-- Home screen data in one call: every committee I'm in, with my dues and the next toss.
create or replace function public.my_home() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with today as (select pkt_today() d),
  mine as (
    select m.id member_id, m.role, c.*
    from committee_members m join committees c on c.id = m.committee_id
    where m.user_id = auth.uid() and m.status = 'active'
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', mine.id,
    'name', mine.name,
    'status', mine.status,
    'role', mine.role,
    'member_count', mine.member_count,
    'joined', (select count(*) from committee_members x where x.committee_id = mine.id and x.status = 'active'),
    'contribution_paisa', mine.contribution_paisa,
    'frequency', mine.frequency,
    'interval_days', mine.interval_days,
    'start_date', mine.start_date,
    'payout_paisa', mine.payout_paisa,
    'rounds_total', mine.member_count,
    'current_round', r.round,
    'toss_date', r.toss_date,
    'today_state', (select o.state from contribution_obligations o
                     where o.member_id = mine.member_id and o.due_date = (select d from today)),
    'due_today_paisa', coalesce((select sum(o.amount_paisa) from contribution_obligations o
                     where o.member_id = mine.member_id and o.due_date = (select d from today)
                       and o.state in ('due','rejected')), 0),
    'overdue_paisa', coalesce((select sum(o.amount_paisa) from contribution_obligations o
                     where o.member_id = mine.member_id and o.due_date < (select d from today)
                       and o.state in ('due','rejected')), 0)
  ) order by (mine.status = 'active') desc, mine.created_at desc), '[]')
  from mine
  left join lateral (
    select s.round, max(s.due_date) toss_date
    from contribution_schedules s
    where s.committee_id = mine.id
      and s.round = coalesce(
        (select s2.round from contribution_schedules s2 where s2.committee_id = mine.id
           and s2.due_date >= (select d from today) order by s2.due_date limit 1),
        (select max(s3.round) from contribution_schedules s3 where s3.committee_id = mine.id))
    group by s.round
  ) r on true
$$;

revoke execute on function public.my_home() from public, anon;
grant execute on function public.my_home() to authenticated;
