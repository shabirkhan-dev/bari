-- Support for the second set of Figma screens: optional late fines, invite preview before
-- joining, per-member days for the Members screen, decided receipts, streaks, and push
-- notifications (daily reminder + every in-app notification) sent by the Cloudflare worker.

-- ───────── Optional late fine (per committee, fixed once the committee starts) ─────────
alter table public.committees add column if not exists late_fine_paisa bigint check (late_fine_paisa > 0);

create or replace function public.set_late_fine(p_committee_id uuid, p_fine_paisa bigint) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare c committees;
begin
  perform _require_organizer(p_committee_id);
  select * into c from committees where id = p_committee_id for update;
  if c.status <> 'forming' then raise exception 'The schedule is locked once the committee starts'; end if;
  if p_fine_paisa is not null and p_fine_paisa <= 0 then raise exception 'Amount must be positive'; end if;
  update committees set late_fine_paisa = p_fine_paisa where id = c.id;
  perform _audit(c.id, 'committee.updated', 'committee', c.id,
                 jsonb_build_object('late_fine_paisa', jsonb_build_array(c.late_fine_paisa, p_fine_paisa)));
end $$;

-- When a contribution stops being on time: its due date at the daily cutoff, Pakistan time.
create or replace function public._deadline(p_due date, p_cutoff time) returns timestamptz
language sql stable as $$ select (p_due + p_cutoff) at time zone 'Asia/Karachi' $$;

-- Late = the deadline passed with no transfer claimed by then (a rejected claim doesn't count).
-- Derived, never stored; the organizer records when a fine is paid or waived.
create table if not exists public.fine_settlements (
  obligation_id uuid primary key references public.contribution_obligations(id) on delete cascade,
  committee_id uuid not null references public.committees(id) on delete cascade,
  status text not null check (status in ('paid', 'waived')),
  settled_by uuid not null references public.profiles(id),
  settled_at timestamptz not null default now()
);
alter table public.fine_settlements enable row level security;
create policy "members see fine settlements" on public.fine_settlements for select using (is_member(committee_id));
grant select on public.fine_settlements to authenticated;

create or replace function public._late(p_committee_id uuid)
returns table (obligation_id uuid, member_id uuid, round int, due_date date, fine_paisa bigint, settled text)
language sql stable security definer set search_path = public, pg_temp as $$
  select o.id, o.member_id, o.round, o.due_date, c.late_fine_paisa, fs.status
    from contribution_obligations o
    join committees c on c.id = o.committee_id
    left join fine_settlements fs on fs.obligation_id = o.id
   where o.committee_id = p_committee_id
     and c.late_fine_paisa is not null
     and o.state <> 'cancelled'
     and _deadline(o.due_date, c.daily_cutoff) < now()
     and not exists (
       select 1 from payment_allocations a join payment_submissions s on s.id = a.submission_id
        where a.obligation_id = o.id and s.status <> 'rejected'
          and s.created_at <= _deadline(o.due_date, c.daily_cutoff))
$$;

create or replace function public.settle_fine(p_obligation_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare o contribution_obligations; f record;
begin
  perform _require_user();
  select * into o from contribution_obligations where id = p_obligation_id;
  if not found then raise exception 'Not found'; end if;
  perform _require_organizer(o.committee_id);
  if p_status not in ('paid', 'waived') then raise exception 'Invalid status'; end if;
  if exists (select 1 from committee_members where id = o.member_id and user_id = auth.uid()) then
    raise exception 'Someone else must confirm your own payment' using errcode = '42501';
  end if;
  select * into f from _late(o.committee_id) l where l.obligation_id = o.id;
  if not found then raise exception 'There is no fine for this day'; end if;
  insert into fine_settlements (obligation_id, committee_id, status, settled_by)
  values (o.id, o.committee_id, p_status, auth.uid())
  on conflict (obligation_id) do update set status = excluded.status, settled_by = excluded.settled_by, settled_at = now();
  perform _audit(o.committee_id, 'fine.' || p_status, 'obligation', o.id, jsonb_build_object('amount_paisa', f.fine_paisa));
end $$;

-- Open fines of one member (the member, or an organizer settling them).
create or replace function public.member_fines(p_member_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare m committee_members;
begin
  perform _require_user();
  select * into m from committee_members where id = p_member_id;
  if not found or not (m.user_id = auth.uid() or is_organizer(m.committee_id)) then
    raise exception 'Member not found' using errcode = '42501';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('obligation_id', f.obligation_id, 'due_date', f.due_date,
            'round', f.round, 'fine_paisa', f.fine_paisa) order by f.due_date), '[]')
            from _late(m.committee_id) f where f.member_id = m.id and f.settled is null);
end $$;

-- ───────── Streak: consecutive verified contributions up to the latest due one ─────────
create or replace function public._streak(p_member_id uuid) returns int
language sql stable security definer set search_path = public, pg_temp as $$
  with d as (
    select state, row_number() over (order by due_date desc) rn
      from contribution_obligations
     where member_id = p_member_id and state <> 'cancelled' and due_date <= pkt_today()
       -- today's contribution doesn't break the streak until its day is over
       and not (due_date = pkt_today() and state <> 'verified')
  )
  select coalesce(min(rn) - 1, (select count(*) from d))::int from d where state <> 'verified'
$$;

-- ───────── Ledger v2 = ledger + streak + fines ─────────
create or replace function public.my_ledger_v2(p_committee_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare l jsonb; me uuid;
begin
  l := my_ledger(p_committee_id);
  me := (l->>'member_id')::uuid;
  return l || jsonb_build_object(
    'streak', _streak(me),
    'late_fine_paisa', (select late_fine_paisa from committees where id = p_committee_id),
    'fines', (select coalesce(jsonb_agg(jsonb_build_object(
                'obligation_id', f.obligation_id, 'round', f.round, 'due_date', f.due_date,
                'fine_paisa', f.fine_paisa, 'settled', f.settled) order by f.due_date), '[]')
                from _late(p_committee_id) f where f.member_id = me));
end $$;

-- ───────── Dashboard v4 = v3 + fine rule + unsettled fines per member ─────────
create or replace function public.committee_dashboard_v4(p_committee_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select committee_dashboard_v3(p_committee_id) || jsonb_build_object(
    'late_fine_paisa', (select late_fine_paisa from committees where id = p_committee_id),
    'fines', (select coalesce(jsonb_object_agg(member_id, owed), '{}') from (
                select member_id, sum(fine_paisa) owed from _late(p_committee_id)
                 where settled is null and is_member(p_committee_id) group by member_id) x))
$$;

-- ───────── Invite preview: what you're joining, before you join ─────────
create or replace function public.invitation_preview(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare inv committee_invitations; c committees;
begin
  perform _require_user();
  select * into inv from committee_invitations
   where code = upper(trim(p_code)) and revoked_at is null and expires_at > now();
  if not found then raise exception 'Invitation code is invalid or expired'; end if;
  select * into c from committees where id = inv.committee_id;
  return jsonb_build_object(
    'committee_id', c.id, 'name', c.name, 'status', c.status,
    'organizer', (select p.display_name from committee_members m join profiles p on p.id = m.user_id
                   where m.committee_id = c.id and m.role = 'owner'),
    'contribution_paisa', c.contribution_paisa, 'frequency', c.frequency, 'interval_days', c.interval_days,
    'periods_per_round', c.periods_per_round, 'member_count', c.member_count, 'payout_paisa', c.payout_paisa,
    'start_date', c.start_date, 'cutoff', to_char(c.daily_cutoff, 'HH24:MI'), 'late_fine_paisa', c.late_fine_paisa,
    'already_member', exists (select 1 from committee_members where committee_id = c.id and user_id = auth.uid() and status = 'active'),
    'members', (select coalesce(jsonb_agg(jsonb_build_object('name', p.display_name, 'user_id', m.user_id) order by m.joined_at), '[]')
                  from committee_members m join profiles p on p.id = m.user_id
                 where m.committee_id = c.id and m.status = 'active'));
end $$;

-- ───────── Members screen: each member's contributions this round ─────────
create or replace function public.members_round(p_committee_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare cur int; today date := pkt_today();
begin
  perform _require_user();
  if not is_member(p_committee_id) then raise exception 'Not a member of this committee' using errcode = '42501'; end if;
  select coalesce(
           (select round from contribution_schedules where committee_id = p_committee_id and due_date >= today order by due_date limit 1),
           (select max(round) from contribution_schedules where committee_id = p_committee_id))
    into cur;
  return jsonb_build_object('today', today, 'round', cur, 'members', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'member_id', m.id,
      'days', (select coalesce(jsonb_agg(jsonb_build_object('d', o.due_date, 's', o.state) order by o.due_date), '[]')
                 from contribution_obligations o where o.member_id = m.id and o.round = cur),
      'won_round', (select pr.round from payout_rounds pr where pr.winner_member_id = m.id),
      'streak', _streak(m.id)
    ) order by m.joined_at), '[]')
    from committee_members m where m.committee_id = p_committee_id and m.status = 'active'));
end $$;

-- ───────── Receipts already decided (organizer's Approved / Rejected tabs) ─────────
create or replace function public.review_history(p_committee_id uuid, p_limit int default 100) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(x order by (x->>'decided_at') desc), '[]') from (
    select jsonb_build_object(
      'id', s.id, 'status', s.status, 'member_id', s.member_id, 'member_name', mp.display_name,
      'amount_paisa', s.amount_paisa, 'tid', s.tid, 'created_at', s.created_at,
      'decided_at', s.decided_at, 'decided_by_name', dp.display_name, 'decision_reason', s.decision_reason,
      'periods', (select jsonb_agg(_period_in_round(a.obligation_id) order by o.due_date)
                    from payment_allocations a join contribution_obligations o on o.id = a.obligation_id
                   where a.submission_id = s.id)) x
      from payment_submissions s
      join committee_members m on m.id = s.member_id
      join profiles mp on mp.id = m.user_id
      left join profiles dp on dp.id = s.decided_by
     where s.committee_id = p_committee_id and s.status in ('verified', 'rejected') and is_organizer(p_committee_id)
     order by s.decided_at desc
     limit least(greatest(p_limit, 1), 500)) q
$$;

-- ───────── Push notifications ─────────
alter table public.profiles
  add column if not exists reminder_on boolean not null default false,
  add column if not exists reminder_time time not null default '20:00',
  add column if not exists reminder_sent_on date,
  add column if not exists lang text not null default 'en' check (lang in ('en', 'ur'));
alter table public.notifications add column if not exists pushed_at timestamptz;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://'),
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create policy "own push subscriptions" on public.push_subscriptions for select using (user_id = auth.uid());
grant select on public.push_subscriptions to authenticated;

-- Late days already announced, so "fine added" goes out once.
create table if not exists public.fine_notices (obligation_id uuid primary key references public.contribution_obligations(id) on delete cascade);
alter table public.fine_notices enable row level security;

create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform _require_user();
  insert into push_subscriptions (user_id, endpoint, p256dh, auth) values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
end $$;

create or replace function public.remove_push_subscription(p_endpoint text) returns void
language sql security definer set search_path = public, pg_temp as $$
  delete from push_subscriptions where endpoint = p_endpoint and user_id = auth.uid()
$$;

create or replace function public.set_reminder(p_on boolean, p_time time, p_lang text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform _require_user();
  update profiles set reminder_on = coalesce(p_on, reminder_on), reminder_time = coalesce(p_time, reminder_time),
                      lang = coalesce(p_lang, lang) where id = auth.uid();
end $$;

create or replace function public.my_settings() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('reminder_on', reminder_on, 'reminder_time', to_char(reminder_time, 'HH24:MI'), 'lang', lang,
                            'push_devices', (select count(*) from push_subscriptions where user_id = auth.uid()))
    from profiles where id = auth.uid()
$$;

-- Run by the worker every few minutes with the service key. Creates due reminders and
-- "fine added" notices, then hands over every notification not yet pushed (claiming it),
-- with the subscriptions to send it to.
create or replace function public.push_jobs() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare now_pkt timestamp := now() at time zone 'Asia/Karachi'; today date := pkt_today(); out jsonb;
begin
  -- Daily reminder: only when something is still unpaid for today (or earlier).
  with due as (
    select p.id user_id, c.id committee_id, c.name, c.daily_cutoff,
           sum(o.amount_paisa) amount, count(*) n
      from profiles p
      join committee_members m on m.user_id = p.id and m.status = 'active'
      join committees c on c.id = m.committee_id and c.status = 'active'
      join contribution_obligations o on o.member_id = m.id and o.state in ('due', 'rejected') and o.due_date <= today
     where p.reminder_on and now_pkt::time >= p.reminder_time
       and (p.reminder_sent_on is null or p.reminder_sent_on < today)
     group by p.id, c.id
  ), ins as (
    insert into notifications (user_id, committee_id, kind, payload)
    select user_id, committee_id, 'payment.due',
           jsonb_build_object('amount_paisa', amount, 'count', n, 'cutoff', to_char(daily_cutoff, 'HH24:MI'), 'committee', name)
      from due returning user_id
  )
  update profiles set reminder_sent_on = today
   where reminder_on and now_pkt::time >= reminder_time and (reminder_sent_on is null or reminder_sent_on < today);

  -- Fine added (once per late day, only on committees with a fine).
  with late as (
    select l.*, c.id committee_id from committees c, lateral _late(c.id) l
     where c.status = 'active' and c.late_fine_paisa is not null and l.settled is null
       and l.due_date >= today - 7
       and not exists (select 1 from fine_notices fn where fn.obligation_id = l.obligation_id)
  ), noted as (
    insert into fine_notices (obligation_id) select obligation_id from late on conflict do nothing returning obligation_id
  )
  insert into notifications (user_id, committee_id, kind, payload)
  select m.user_id, l.committee_id, 'fine.added',
         jsonb_build_object('amount_paisa', l.fine_paisa, 'due_date', l.due_date, 'round', l.round,
                            'n', (_period_in_round(l.obligation_id))->'n')
    from late l join noted using (obligation_id) join committee_members m on m.id = l.member_id;

  with claimed as (
    update notifications n set pushed_at = now()
     where pushed_at is null and created_at > now() - interval '2 days'
    returning n.id, n.user_id, n.kind, n.payload, n.committee_id
  )
  select jsonb_build_object(
    'notifications', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'user_id', c.user_id, 'kind', c.kind, 'payload', c.payload, 'committee_id', c.committee_id,
        'committee', (select name from committees where id = c.committee_id),
        'lang', (select lang from profiles where id = c.user_id)))
      from claimed c where exists (select 1 from push_subscriptions s where s.user_id = c.user_id)), '[]'),
    'subscriptions', coalesce((select jsonb_agg(jsonb_build_object('user_id', s.user_id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
      from push_subscriptions s where s.user_id in (select user_id from claimed)), '[]'))
    into out;
  -- Older unpushed rows (e.g. from before push existed) are simply marked as handled.
  update notifications set pushed_at = now() where pushed_at is null;
  return out;
end $$;

create or replace function public.push_gone(p_endpoints text[]) returns void
language sql security definer set search_path = public, pg_temp as $$
  delete from push_subscriptions where endpoint = any(p_endpoints)
$$;

-- ───────── Richer notifications ("Ayesha verified Day 17 · your streak is 17 days") ─────────
create or replace function public._enrich_notification() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare s payment_submissions;
begin
  if new.committee_id is not null then
    new.payload := new.payload || jsonb_build_object('frequency', (select frequency from committees where id = new.committee_id));
  end if;
  if new.kind in ('payment.verified', 'payment.rejected', 'payment.submitted') and new.payload ? 'submission_id' then
    select * into s from payment_submissions where id = (new.payload->>'submission_id')::uuid;
    if found then
      new.payload := new.payload || jsonb_build_object(
        'by_name', (select display_name from profiles where id = coalesce(s.decided_by, s.submitted_by)),
        'periods', (select jsonb_agg(_period_in_round(a.obligation_id) order by o.due_date)
                      from payment_allocations a join contribution_obligations o on o.id = a.obligation_id
                     where a.submission_id = s.id));
      if new.kind = 'payment.verified' then
        new.payload := new.payload || jsonb_build_object('streak', _streak(s.member_id));
      end if;
    end if;
  elsif new.kind = 'toss.drawn' and new.payload ? 'winner_member_id' then
    new.payload := new.payload || jsonb_build_object('winner_name',
      (select p.display_name from committee_members m join profiles p on p.id = m.user_id
        where m.id = (new.payload->>'winner_member_id')::uuid));
  end if;
  return new;
end $$;
drop trigger if exists enrich_notification on public.notifications;
create trigger enrich_notification before insert on public.notifications
  for each row execute function public._enrich_notification();
revoke execute on function public._enrich_notification() from public, anon, authenticated;

-- ───────── Grants ─────────
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;

revoke execute on function public.set_late_fine(uuid, bigint) from public, anon;
revoke execute on function public._deadline(date, time) from public, anon;
revoke execute on function public._late(uuid) from public, anon, authenticated;
revoke execute on function public.settle_fine(uuid, text) from public, anon;
revoke execute on function public._streak(uuid) from public, anon, authenticated;
revoke execute on function public.member_fines(uuid) from public, anon;
grant execute on function public.member_fines(uuid) to authenticated;
revoke execute on function public.my_ledger_v2(uuid) from public, anon;
revoke execute on function public.committee_dashboard_v4(uuid) from public, anon;
revoke execute on function public.invitation_preview(text) from public, anon;
revoke execute on function public.members_round(uuid) from public, anon;
revoke execute on function public.review_history(uuid, int) from public, anon;
revoke execute on function public.save_push_subscription(text, text, text) from public, anon;
revoke execute on function public.remove_push_subscription(text) from public, anon;
revoke execute on function public.set_reminder(boolean, time, text) from public, anon;
revoke execute on function public.my_settings() from public, anon;
revoke execute on function public.push_jobs() from public, anon, authenticated;
revoke execute on function public.push_gone(text[]) from public, anon, authenticated;

grant execute on function public.set_late_fine(uuid, bigint) to authenticated;
grant execute on function public.settle_fine(uuid, text) to authenticated;
grant execute on function public.my_ledger_v2(uuid) to authenticated;
grant execute on function public.committee_dashboard_v4(uuid) to authenticated;
grant execute on function public.invitation_preview(text) to authenticated;
grant execute on function public.members_round(uuid) to authenticated;
grant execute on function public.review_history(uuid, int) to authenticated;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;
grant execute on function public.remove_push_subscription(text) to authenticated;
grant execute on function public.set_reminder(boolean, time, text) to authenticated;
grant execute on function public.my_settings() to authenticated;
grant execute on function public.push_jobs() to service_role;
grant execute on function public.push_gone(text[]) to service_role;
