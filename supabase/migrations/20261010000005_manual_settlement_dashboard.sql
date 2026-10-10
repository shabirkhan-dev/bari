-- Committee rule (agreed): late or missing money is settled within the family/friend
-- circle, not enforced by the app. The app shows who is behind and reminds them.
-- So a payout can be recorded even when the round's pot isn't fully verified;
-- the shortfall is recorded in the audit log and shown, never hidden.

create or replace function public.record_payout(p_payout_round_id uuid, p_amount_paisa bigint, p_tid text,
                                                p_paid_at timestamptz, p_evidence_path text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare r payout_rounds; c committees; verified bigint; prid uuid;
begin
  select * into r from payout_rounds where id = p_payout_round_id for update;
  if not found then raise exception 'Round not found'; end if;
  perform _require_organizer(r.committee_id);
  select id into prid from payout_records where payout_round_id = r.id;
  if found then return prid; end if; -- idempotent
  select * into c from committees where id = r.committee_id;
  if p_amount_paisa <= 0 then raise exception 'Enter the amount you sent'; end if;
  select coalesce(sum(verified_paisa), 0) into verified from contribution_obligations
   where committee_id = r.committee_id and round = r.round and state = 'verified';

  insert into payout_records (payout_round_id, amount_paisa, tid, paid_at, evidence_path, recorded_by,
                              confirmed_by, confirmed_at)
  values (r.id, p_amount_paisa, nullif(trim(p_tid), ''), p_paid_at, p_evidence_path, auth.uid(),
          case when c.require_recipient_confirmation then null else auth.uid() end,
          case when c.require_recipient_confirmation then null else now() end)
  returning id into prid;
  update payout_rounds set status = case when c.require_recipient_confirmation then 'paid' else 'confirmed' end
   where id = r.id;
  perform _audit(r.committee_id, 'payout.recorded', 'payout_record', prid,
    jsonb_build_object('round', r.round, 'amount_paisa', p_amount_paisa, 'tid', p_tid,
                       'pot_paisa', c.payout_paisa, 'verified_paisa', verified,
                       'unverified_shortfall_paisa', greatest(c.payout_paisa - verified, 0)));
  perform _notify(r.committee_id, array[r.winner_member_id], 'payout.recorded',
                  jsonb_build_object('round', r.round, 'amount_paisa', p_amount_paisa));
  return prid;
end $$;

-- Everything the committee screen needs in one round trip, computed server-side
-- (avoids the API's 1,000-row page limit: 10 members × 150 days is 1,500 obligations).
create or replace function public.committee_dashboard(p_committee_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  today date := pkt_today();
  c committees;
  me committee_members;
  cur_round int;
  rounds jsonb;
  members jsonb;
begin
  perform _require_user();
  if not is_member(p_committee_id) then raise exception 'Not a member of this committee' using errcode = '42501'; end if;
  select * into c from committees where id = p_committee_id;
  select * into me from committee_members where committee_id = c.id and user_id = auth.uid();

  select coalesce(
           (select round from contribution_schedules where committee_id = c.id and due_date >= today order by due_date limit 1),
           (select max(round) from contribution_schedules where committee_id = c.id))
    into cur_round;

  select coalesce(jsonb_agg(jsonb_build_object(
           'round', s.round,
           'first_due', s.first_due,
           'toss_date', s.toss_date,
           'verified_paisa', coalesce(v.verified, 0),
           'status', pr.status,
           'winner_member_id', pr.winner_member_id
         ) order by s.round), '[]')
    into rounds
    from (select round, min(due_date) first_due, max(due_date) toss_date
            from contribution_schedules where committee_id = c.id group by round) s
    left join (select round, sum(verified_paisa) verified from contribution_obligations
                where committee_id = c.id and state = 'verified' group by round) v on v.round = s.round
    left join payout_rounds pr on pr.committee_id = c.id and pr.round = s.round;

  select coalesce(jsonb_agg(jsonb_build_object(
           'member_id', m.id,
           'user_id', m.user_id,
           'name', p.display_name,
           'phone', p.phone,
           'role', m.role,
           'today_state', t.state,
           'overdue_paisa', coalesce(o.amt, 0),
           'overdue_count', coalesce(o.n, 0),
           'pending_paisa', coalesce(pe.amt, 0),
           'paid_out', exists (select 1 from payout_rounds r where r.committee_id = c.id and r.winner_member_id = m.id)
         ) order by (m.role = 'owner') desc, p.display_name), '[]')
    into members
    from committee_members m
    join profiles p on p.id = m.user_id
    left join contribution_obligations t on t.member_id = m.id and t.due_date = today
    left join lateral (select sum(amount_paisa) amt, count(*) n from contribution_obligations
                        where member_id = m.id and due_date < today and state in ('due','rejected')) o on true
    left join lateral (select sum(amount_paisa) amt from contribution_obligations
                        where member_id = m.id and state in ('submitted','disputed')) pe on true
   where m.committee_id = c.id and m.status = 'active';

  return jsonb_build_object(
    'today', today,
    'committee', jsonb_build_object(
      'id', c.id, 'name', c.name, 'description', c.description, 'status', c.status,
      'member_count', c.member_count, 'contribution_paisa', c.contribution_paisa,
      'frequency', c.frequency, 'interval_days', c.interval_days,
      'periods_per_round', c.periods_per_round, 'start_date', c.start_date,
      'payout_paisa', c.payout_paisa, 'account_title', c.receiving_account_title,
      'account_number', c.receiving_account_number, 'instructions', c.payment_instructions),
    'me', jsonb_build_object('member_id', me.id, 'role', me.role),
    'current_round', cur_round,
    'rounds', rounds,
    'members', members);
end $$;

revoke execute on function public.committee_dashboard(uuid) from public, anon;
grant execute on function public.committee_dashboard(uuid) to authenticated;
