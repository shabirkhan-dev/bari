-- Settings, membership changes, organizer notifications, account-limit figures, activity feed.

-- ───────── submit_payment: a concurrent retry returns the same submission ─────────
-- (Before: two simultaneous retries with one request id surfaced a misleading
-- "transaction ID already submitted" error.)
create or replace function public.submit_payment(
  p_member_id uuid, p_obligation_ids uuid[], p_amount_paisa bigint, p_tid text,
  p_transferred_at timestamptz, p_paid_by_name text, p_note text, p_client_request_id uuid
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := _require_user(); m committee_members; sid uuid; total bigint; cnt int; v_con text;
begin
  select id into sid from payment_submissions where client_request_id = p_client_request_id;
  if found then return sid; end if;

  select * into m from committee_members where id = p_member_id and status = 'active';
  if not found then raise exception 'Member not found'; end if;
  if m.user_id <> uid and not is_organizer(m.committee_id) then
    raise exception 'You can only submit your own payments' using errcode = '42501';
  end if;
  if (select status from committees where id = m.committee_id) <> 'active' then
    raise exception 'Committee is not active';
  end if;
  if coalesce(cardinality(p_obligation_ids), 0) = 0 then raise exception 'Choose at least one contribution'; end if;

  perform 1 from contribution_obligations where id = any(p_obligation_ids) for update;
  select count(*), coalesce(sum(amount_paisa), 0) into cnt, total
    from contribution_obligations
   where id = any(p_obligation_ids) and member_id = m.id and state in ('due','rejected');
  if cnt <> cardinality(p_obligation_ids) then
    raise exception 'Some contributions are not payable (already submitted, verified, or not yours)';
  end if;
  if total <> p_amount_paisa then
    raise exception 'Amount Rs % does not match the selected contributions (Rs %)', p_amount_paisa / 100.0, total / 100.0;
  end if;

  insert into payment_submissions (committee_id, member_id, submitted_by, paid_by_name, amount_paisa,
    tid, transferred_at, note, client_request_id)
  values (m.committee_id, m.id, uid, nullif(trim(p_paid_by_name), ''), p_amount_paisa,
    nullif(trim(p_tid), ''), p_transferred_at, p_note, p_client_request_id)
  returning id into sid;

  insert into payment_allocations (submission_id, obligation_id, amount_paisa)
  select sid, id, amount_paisa from contribution_obligations where id = any(p_obligation_ids);
  update contribution_obligations set state = 'submitted' where id = any(p_obligation_ids);

  perform _audit(m.committee_id, 'payment.submitted', 'payment_submission', sid,
    jsonb_build_object('amount_paisa', p_amount_paisa, 'tid', p_tid, 'obligations', cardinality(p_obligation_ids),
                       'on_behalf', m.user_id <> uid));
  return sid;
exception when unique_violation then
  get stacked diagnostics v_con = constraint_name;
  if v_con = 'payment_submissions_client_request_id_key' then
    select id into sid from payment_submissions where client_request_id = p_client_request_id;
    return sid;
  end if;
  raise exception 'This transaction ID has already been submitted in this committee';
end $$;

-- ───────── Organizers hear about new payments to check ─────────
create or replace function public._notify_organizers_of_submission() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into notifications (user_id, committee_id, kind, payload)
  select o.user_id, new.committee_id, 'payment.submitted',
         jsonb_build_object('submission_id', new.id, 'amount_paisa', new.amount_paisa,
                            'member_name', (select p.display_name from committee_members cm join profiles p on p.id = cm.user_id where cm.id = new.member_id))
    from committee_members o
   where o.committee_id = new.committee_id and o.status = 'active'
     and o.role in ('owner','organizer') and o.user_id <> new.submitted_by;
  return new;
end $$;

create trigger notify_organizers_on_submission after insert on public.payment_submissions
  for each row execute function public._notify_organizers_of_submission();

-- ───────── Edit a committee ─────────
-- While forming: everything. Once running: name, note, limits and the receiving account
-- (a new SIM happens); the schedule and amounts stay locked. Every change is audited and
-- members are told when the receiving account changes.
create or replace function public.update_committee(
  p_committee_id uuid, p_name text, p_description text, p_instructions text, p_start_date date,
  p_account_title text, p_account_number text, p_monthly_receive_limit_paisa bigint, p_monthly_send_limit_paisa bigint
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare c committees; changed jsonb := '{}';
begin
  perform _require_organizer(p_committee_id);
  select * into c from committees where id = p_committee_id for update;
  if c.status in ('completed','cancelled') then raise exception 'Committee is closed'; end if;
  if p_start_date is distinct from c.start_date then
    if c.status <> 'forming' then raise exception 'The schedule is locked once the committee starts'; end if;
    if p_start_date < pkt_today() then raise exception 'Start date is in the past'; end if;
  end if;

  if p_name is distinct from c.name then changed := changed || jsonb_build_object('name', jsonb_build_array(c.name, p_name)); end if;
  if p_start_date is distinct from c.start_date then changed := changed || jsonb_build_object('start_date', jsonb_build_array(c.start_date, p_start_date)); end if;
  if p_account_number is distinct from c.receiving_account_number or p_account_title is distinct from c.receiving_account_title then
    changed := changed || jsonb_build_object('account', jsonb_build_array(
      c.receiving_account_title || ' ' || c.receiving_account_number, p_account_title || ' ' || p_account_number));
  end if;
  if p_monthly_receive_limit_paisa is distinct from c.monthly_receive_limit_paisa
     or p_monthly_send_limit_paisa is distinct from c.monthly_send_limit_paisa then
    changed := changed || jsonb_build_object('limits', jsonb_build_array(
      jsonb_build_array(c.monthly_receive_limit_paisa, c.monthly_send_limit_paisa),
      jsonb_build_array(p_monthly_receive_limit_paisa, p_monthly_send_limit_paisa)));
  end if;

  update committees set
    name = p_name, description = p_description, payment_instructions = p_instructions,
    start_date = p_start_date, receiving_account_title = p_account_title, receiving_account_number = p_account_number,
    monthly_receive_limit_paisa = p_monthly_receive_limit_paisa, monthly_send_limit_paisa = p_monthly_send_limit_paisa
  where id = c.id;

  perform _audit(c.id, 'committee.updated', 'committee', c.id, changed);
  if changed ? 'account' and c.status = 'active' then
    perform _notify_all(c.id, 'committee.account_changed',
      jsonb_build_object('title', p_account_title, 'number', p_account_number));
  end if;
end $$;

-- ───────── Membership while forming ─────────
create or replace function public.leave_committee(p_committee_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare m committee_members;
begin
  perform _require_user();
  select * into m from committee_members where committee_id = p_committee_id and user_id = auth.uid();
  if not found then raise exception 'Not a member of this committee'; end if;
  if m.role = 'owner' then raise exception 'The organizer can''t leave their own committee'; end if;
  if (select status from committees where id = p_committee_id for update) <> 'forming' then
    raise exception 'Members can only leave before the committee starts';
  end if;
  delete from committee_members where id = m.id;
  perform _audit(p_committee_id, 'member.left', 'committee_member', m.id);
end $$;

create or replace function public.remove_member(p_member_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare m committee_members;
begin
  select * into m from committee_members where id = p_member_id;
  if not found then raise exception 'Member not found'; end if;
  perform _require_organizer(m.committee_id);
  if m.role = 'owner' then raise exception 'The organizer can''t be removed'; end if;
  if m.user_id = auth.uid() then raise exception 'Use Leave to remove yourself'; end if;
  if (select status from committees where id = m.committee_id for update) <> 'forming' then
    raise exception 'Members can only be removed before the committee starts';
  end if;
  delete from committee_members where id = m.id;
  perform _audit(m.committee_id, 'member.removed', 'committee_member', m.id,
                 jsonb_build_object('name', (select display_name from profiles where id = m.user_id)));
end $$;

create or replace function public.revoke_invitations(p_committee_id uuid) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare n int;
begin
  perform _require_organizer(p_committee_id);
  update committee_invitations set revoked_at = now()
   where committee_id = p_committee_id and revoked_at is null and expires_at > now();
  get diagnostics n = row_count;
  perform _audit(p_committee_id, 'invitation.revoked', 'committee', p_committee_id, jsonb_build_object('count', n));
  return n;
end $$;

-- ───────── Activity feed (audit log with names) ─────────
create or replace function public.audit_feed(p_committee_id uuid, p_limit int default 100) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(q.e order by q.ts desc), '[]') from (
    select jsonb_build_object('id', a.id, 'action', a.action, 'actor_name', p.display_name,
                              'details', a.details, 'created_at', a.created_at) e,
           a.created_at ts
      from audit_events a left join profiles p on p.id = a.actor_id
     where a.committee_id = p_committee_id and is_member(p_committee_id)
     order by a.created_at desc
     limit least(greatest(p_limit, 1), 500)
  ) q
$$;

-- ───────── Dashboard v2: pending count + this month's account figures ─────────
-- "Received" counts confirmed money by the day it was confirmed; "expected" is what is due
-- this month. Limits are the organizer's own numbers for their JazzCash tier.
create or replace function public.committee_dashboard_v2(p_committee_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with c as (select * from committees where id = p_committee_id),
  month as (
    select date_trunc('month', pkt_today())::date m0,
           (date_trunc('month', pkt_today()) + interval '1 month')::date m1
  )
  select committee_dashboard(p_committee_id) || jsonb_build_object(
    'pending_reviews', case when is_organizer(p_committee_id) then
      (select count(*) from payment_submissions s
        where s.committee_id = p_committee_id and s.status in ('pending','disputed')) else 0 end,
    'month', jsonb_build_object(
      'receive_limit_paisa', (select monthly_receive_limit_paisa from c),
      'send_limit_paisa', (select monthly_send_limit_paisa from c),
      'received_paisa', (select coalesce(sum(s.amount_paisa), 0) from payment_submissions s, month
                          where s.committee_id = p_committee_id and s.status = 'verified'
                            and (s.decided_at at time zone 'Asia/Karachi')::date >= month.m0
                            and (s.decided_at at time zone 'Asia/Karachi')::date < month.m1),
      'expected_paisa', (select coalesce(sum(o.amount_paisa), 0) from contribution_obligations o, month
                          where o.committee_id = p_committee_id and o.state <> 'cancelled'
                            and o.due_date >= month.m0 and o.due_date < month.m1),
      'sent_paisa', (select coalesce(sum(r.amount_paisa), 0) from payout_records r join payout_rounds pr on pr.id = r.payout_round_id, month
                      where pr.committee_id = p_committee_id
                        and (r.paid_at at time zone 'Asia/Karachi')::date >= month.m0
                        and (r.paid_at at time zone 'Asia/Karachi')::date < month.m1),
      'payouts_due_paisa', (select count(*) * (select payout_paisa from c) from
                          (select round, max(due_date) toss from contribution_schedules where committee_id = p_committee_id group by round) t, month
                          where t.toss >= month.m0 and t.toss < month.m1)
    ))
$$;

revoke execute on function public.update_committee(uuid, text, text, text, date, text, text, bigint, bigint) from public, anon;
revoke execute on function public.leave_committee(uuid) from public, anon;
revoke execute on function public.remove_member(uuid) from public, anon;
revoke execute on function public.revoke_invitations(uuid) from public, anon;
revoke execute on function public.audit_feed(uuid, int) from public, anon;
revoke execute on function public._notify_organizers_of_submission() from public, anon, authenticated;
grant execute on function public.update_committee(uuid, text, text, text, date, text, text, bigint, bigint) to authenticated;
grant execute on function public.leave_committee(uuid) to authenticated;
grant execute on function public.remove_member(uuid) to authenticated;
grant execute on function public.revoke_invitations(uuid) to authenticated;
grant execute on function public.audit_feed(uuid, int) to authenticated;

-- ───────── A member's payable days (self, or an organizer recording on their behalf) ─────────
create or replace function public.member_payable(p_member_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare m committee_members;
begin
  perform _require_user();
  select * into m from committee_members where id = p_member_id and status = 'active';
  if not found then raise exception 'Member not found'; end if;
  if m.user_id <> auth.uid() and not is_organizer(m.committee_id) then
    raise exception 'Only organizers can do this' using errcode = '42501';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', o.id, 'due_date', o.due_date, 'amount_paisa', o.amount_paisa, 'state', o.state
    ) order by o.due_date), '[]')
    from contribution_obligations o
    where o.member_id = m.id and o.state in ('due', 'rejected')
      and o.due_date <= greatest(pkt_today(),
            (select min(s.due_date) from contribution_schedules s where s.committee_id = m.committee_id)) + 14);
end $$;

revoke execute on function public.member_payable(uuid) from public, anon;
grant execute on function public.member_payable(uuid) to authenticated;
