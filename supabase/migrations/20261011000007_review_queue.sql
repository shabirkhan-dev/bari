-- Organizer's "payments to check" list, and a pending count on the dashboard.

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
    'tid', s.tid,
    'transferred_at', s.transferred_at,
    'note', s.note,
    'created_at', s.created_at,
    'due_dates', (select jsonb_agg(o.due_date order by o.due_date)
                    from payment_allocations a join contribution_obligations o on o.id = a.obligation_id
                   where a.submission_id = s.id),
    'receipt_path', (select r.storage_path from payment_receipts r where r.submission_id = s.id order by r.created_at limit 1),
    'receipt_type', (select r.mime_type from payment_receipts r where r.submission_id = s.id order by r.created_at limit 1),
    -- Nobody confirms their own money: not the member, not whoever entered it.
    'can_decide', (m.user_id <> auth.uid() and s.submitted_by <> auth.uid())
  ) order by s.created_at), '[]')
  from payment_submissions s
  join committee_members m on m.id = s.member_id
  join profiles mp on mp.id = m.user_id
  join profiles sp on sp.id = s.submitted_by
  where s.committee_id = p_committee_id
    and s.status in ('pending', 'disputed')
    and is_organizer(p_committee_id)
$$;

revoke execute on function public.review_queue(uuid) from public, anon;
grant execute on function public.review_queue(uuid) to authenticated;

-- My payable contributions: missed days, today, and up to two weeks ahead (paying in advance).
-- Before the start, the two weeks count from the first payment date.
create or replace function public.my_payable(p_committee_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', o.id, 'due_date', o.due_date, 'amount_paisa', o.amount_paisa, 'state', o.state
  ) order by o.due_date), '[]')
  from contribution_obligations o
  join committee_members m on m.id = o.member_id
  where o.committee_id = p_committee_id
    and m.user_id = auth.uid()
    and o.state in ('due', 'rejected')
    and o.due_date <= greatest(pkt_today(),
          (select min(s.due_date) from contribution_schedules s where s.committee_id = p_committee_id)) + 14
$$;

revoke execute on function public.my_payable(uuid) from public, anon;
grant execute on function public.my_payable(uuid) to authenticated;

-- Add the organizer's pending count to the dashboard payload.
create or replace function public.committee_dashboard_v2(p_committee_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select committee_dashboard(p_committee_id) || jsonb_build_object(
    'pending_reviews', case when is_organizer(p_committee_id) then
      (select count(*) from payment_submissions s
        where s.committee_id = p_committee_id and s.status in ('pending','disputed')) else 0 end)
$$;

revoke execute on function public.committee_dashboard_v2(uuid) from public, anon;
grant execute on function public.committee_dashboard_v2(uuid) to authenticated;
