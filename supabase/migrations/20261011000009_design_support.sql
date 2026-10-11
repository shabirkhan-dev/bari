-- Support for the Figma screens: a daily cutoff ("Closes 9 pm"), what was read off each
-- receipt (for the organizer's checks), a per-member ledger, and richer review items.

-- ───────── Daily cutoff ─────────
alter table public.committees add column if not exists daily_cutoff time not null default '21:00';

create or replace function public.set_daily_cutoff(p_committee_id uuid, p_cutoff time) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare old time;
begin
  perform _require_organizer(p_committee_id);
  select daily_cutoff into old from committees where id = p_committee_id for update;
  update committees set daily_cutoff = p_cutoff where id = p_committee_id;
  perform _audit(p_committee_id, 'committee.updated', 'committee', p_committee_id,
                 jsonb_build_object('daily_cutoff', jsonb_build_array(old, p_cutoff)));
end $$;

-- ───────── What the phone read off the receipt (never proof by itself) ─────────
alter table public.payment_submissions
  add column if not exists receipt_amount_paisa bigint check (receipt_amount_paisa > 0),
  add column if not exists receipt_successful boolean;

create or replace function public.record_receipt_reading(p_submission_id uuid, p_amount_paisa bigint, p_successful boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare s payment_submissions;
begin
  perform _require_user();
  select * into s from payment_submissions where id = p_submission_id for update;
  if not found or s.submitted_by <> auth.uid() then raise exception 'Submission not found' using errcode = '42501'; end if;
  if s.status <> 'pending' then raise exception 'Submission is %', s.status; end if;
  update payment_submissions set receipt_amount_paisa = p_amount_paisa, receipt_successful = p_successful where id = s.id;
end $$;

-- Period number inside its round ("Day 18 of 30").
create or replace function public._period_in_round(p_obligation_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('round', s.round, 'n', s.period_index - (s.round - 1) * c.periods_per_round + 1)
    from contribution_obligations o
    join contribution_schedules s on s.id = o.schedule_id
    join committees c on c.id = o.committee_id
   where o.id = p_obligation_id
$$;

-- ───────── Review items, with receipt facts and checks ─────────
create or replace function public.review_queue(p_committee_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'status', s.status,
    'member_id', s.member_id,
    'member_name', mp.display_name,
    'member_phone', mp.phone,
    'submitted_by_name', sp.display_name,
    'paid_by_name', s.paid_by_name,
    'amount_paisa', s.amount_paisa,
    'receipt_amount_paisa', s.receipt_amount_paisa,
    'receipt_successful', s.receipt_successful,
    'tid', s.tid,
    'transferred_at', s.transferred_at,
    'note', s.note,
    'created_at', s.created_at,
    'due_dates', (select jsonb_agg(o.due_date order by o.due_date)
                    from payment_allocations a join contribution_obligations o on o.id = a.obligation_id
                   where a.submission_id = s.id),
    'periods', (select jsonb_agg(_period_in_round(a.obligation_id) order by o.due_date)
                  from payment_allocations a join contribution_obligations o on o.id = a.obligation_id
                 where a.submission_id = s.id),
    'receipt_path', r.storage_path,
    'receipt_type', r.mime_type,
    'receipt_size', r.size_bytes,
    'receipt_created_at', r.created_at,
    -- Nobody confirms their own money: not the member, not whoever entered it.
    'can_decide', (m.user_id <> auth.uid() and s.submitted_by <> auth.uid())
  ) order by s.created_at), '[]')
  from payment_submissions s
  join committee_members m on m.id = s.member_id
  join profiles mp on mp.id = m.user_id
  join profiles sp on sp.id = s.submitted_by
  left join lateral (select storage_path, mime_type, size_bytes, created_at from payment_receipts
                      where submission_id = s.id order by created_at limit 1) r on true
  where s.committee_id = p_committee_id
    and s.status in ('pending', 'disputed')
    and is_organizer(p_committee_id)
$$;

-- ───────── My ledger: per round paid / waiting / still to pay, this round's days, history ─────────
create or replace function public.my_ledger(p_committee_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare me committee_members; today date := pkt_today(); cur int; c committees;
begin
  perform _require_user();
  select * into me from committee_members where committee_id = p_committee_id and user_id = auth.uid() and status = 'active';
  if not found then raise exception 'Not a member of this committee' using errcode = '42501'; end if;
  select * into c from committees where id = p_committee_id;
  select coalesce(
           (select round from contribution_schedules where committee_id = c.id and due_date >= today order by due_date limit 1),
           (select max(round) from contribution_schedules where committee_id = c.id))
    into cur;

  return jsonb_build_object(
    'today', today,
    'member_id', me.id,
    'current_round', cur,
    'periods_per_round', c.periods_per_round,
    'rounds', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'round', s.round, 'first_due', s.first_due, 'toss_date', s.toss_date,
        'total_paisa', coalesce(t.total, 0),
        'paid_paisa', coalesce(t.paid, 0),
        'waiting_paisa', coalesce(t.waiting, 0),
        'unpaid_paisa', coalesce(t.unpaid, 0)
      ) order by s.round), '[]')
      from (select round, min(due_date) first_due, max(due_date) toss_date
              from contribution_schedules where committee_id = c.id group by round) s
      left join (
        select round,
               sum(amount_paisa) filter (where state <> 'cancelled') total,
               sum(coalesce(verified_paisa, amount_paisa)) filter (where state = 'verified') paid,
               sum(amount_paisa) filter (where state in ('submitted','disputed')) waiting,
               sum(amount_paisa) filter (where state in ('due','rejected') and due_date <= today) unpaid
          from contribution_obligations where member_id = me.id group by round
      ) t on t.round = s.round),
    'days', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', o.id, 'due_date', o.due_date, 'state', o.state, 'amount_paisa', o.amount_paisa,
        'n', sc.period_index - (sc.round - 1) * c.periods_per_round + 1
      ) order by o.due_date), '[]')
      from contribution_obligations o join contribution_schedules sc on sc.id = o.schedule_id
      where o.member_id = me.id and o.round = cur),
    'history', (
      select coalesce(jsonb_agg(h.x order by h.created_at desc), '[]') from (
        select jsonb_build_object(
          'id', s.id, 'created_at', s.created_at, 'amount_paisa', s.amount_paisa, 'status', s.status,
          'decision_reason', s.decision_reason, 'decided_at', s.decided_at, 'tid', s.tid,
          'paid_by_name', s.paid_by_name,
          'periods', (select jsonb_agg(_period_in_round(a.obligation_id) order by o.due_date)
                        from payment_allocations a join contribution_obligations o on o.id = a.obligation_id
                       where a.submission_id = s.id)
        ) x, s.created_at
        from payment_submissions s where s.member_id = me.id
        order by s.created_at desc limit 200
      ) h)
  );
end $$;

-- ───────── Dashboard v3 = v2 + cutoff ─────────
create or replace function public.committee_dashboard_v3(p_committee_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select committee_dashboard_v2(p_committee_id) || jsonb_build_object(
    'cutoff', (select to_char(daily_cutoff, 'HH24:MI') from committees where id = p_committee_id))
$$;

revoke execute on function public.set_daily_cutoff(uuid, time) from public, anon;
revoke execute on function public.record_receipt_reading(uuid, bigint, boolean) from public, anon;
revoke execute on function public._period_in_round(uuid) from public, anon, authenticated;
revoke execute on function public.my_ledger(uuid) from public, anon;
revoke execute on function public.committee_dashboard_v3(uuid) from public, anon;
grant execute on function public.set_daily_cutoff(uuid, time) to authenticated;
grant execute on function public.record_receipt_reading(uuid, bigint, boolean) to authenticated;
grant execute on function public.my_ledger(uuid) to authenticated;
grant execute on function public.committee_dashboard_v3(uuid) to authenticated;
