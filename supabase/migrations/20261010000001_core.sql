-- Committee OS — core schema.
-- Principle: we manage the committee; JazzCash moves the money.
-- Money is integer paisa (bigint). Committee dates are PKT calendar dates.
-- All writes go through SECURITY DEFINER functions below; tables expose SELECT only (RLS).

create extension if not exists pgcrypto;

-- ───────────────────────── helpers ─────────────────────────

create or replace function public.pkt_today() returns date
language sql stable as $$ select (now() at time zone 'Asia/Karachi')::date $$;

-- ───────────────────────── tables ─────────────────────────

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 1 and 80),
  phone text check (phone ~ '^\+?[0-9]{10,15}$'),
  created_at timestamptz not null default now()
);

create table public.committees (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  description text check (length(description) <= 1000),
  currency text not null default 'PKR' check (currency = 'PKR'),
  member_count int not null check (member_count between 2 and 50),
  contribution_paisa bigint not null check (contribution_paisa > 0),
  frequency text not null check (frequency in ('daily','weekly','monthly','custom')),
  interval_days int check (interval_days between 1 and 366),
  periods_per_round int not null check (periods_per_round between 1 and 366),
  start_date date not null,
  payout_paisa bigint not null,
  receiving_account_title text not null check (length(trim(receiving_account_title)) between 1 and 80),
  receiving_account_number text not null check (receiving_account_number ~ '^[0-9]{10,15}$'),
  payment_instructions text check (length(payment_instructions) <= 2000),
  monthly_receive_limit_paisa bigint check (monthly_receive_limit_paisa > 0),
  monthly_send_limit_paisa bigint check (monthly_send_limit_paisa > 0),
  rules text check (length(rules) <= 4000),
  receipts_visible_to_members boolean not null default false,
  require_recipient_confirmation boolean not null default true,
  status text not null default 'forming' check (status in ('forming','active','completed','cancelled')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint custom_needs_interval check ((frequency = 'custom') = (interval_days is not null)),
  constraint payout_is_consistent check (payout_paisa = member_count::bigint * periods_per_round * contribution_paisa)
);

create table public.committee_members (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid not null references public.committees(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  role text not null check (role in ('owner','organizer','member')),
  status text not null default 'active' check (status in ('active','left')),
  joined_at timestamptz not null default now(),
  unique (committee_id, user_id)
);
create unique index one_owner_per_committee on public.committee_members (committee_id) where role = 'owner';

create table public.committee_invitations (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid not null references public.committees(id) on delete cascade,
  code text not null unique,
  created_by uuid not null references public.profiles(id),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- One row per contribution period (shared by all members).
create table public.contribution_schedules (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid not null references public.committees(id) on delete cascade,
  period_index int not null check (period_index >= 0),
  round int not null check (round >= 1),
  due_date date not null,
  unique (committee_id, period_index)
);

-- What each member owes for each period. "overdue" is derived from due_date, never stored.
create table public.contribution_obligations (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid not null references public.committees(id) on delete cascade,
  schedule_id uuid not null references public.contribution_schedules(id) on delete cascade,
  member_id uuid not null references public.committee_members(id),
  round int not null,
  due_date date not null,
  amount_paisa bigint not null check (amount_paisa > 0),
  state text not null default 'due'
    check (state in ('due','submitted','verified','rejected','disputed','cancelled')),
  verified_paisa bigint,
  verified_by uuid references public.profiles(id),
  verified_at timestamptz,
  unique (schedule_id, member_id),
  constraint verified_fields check (
    (state = 'verified') = (verified_paisa is not null and verified_by is not null and verified_at is not null)
    or (state = 'disputed' and verified_paisa is not null)
  )
);
create index on public.contribution_obligations (committee_id, member_id, due_date);
create index on public.contribution_obligations (committee_id, round);

-- One row per JazzCash transfer a member says they made. Evidence, not money.
create table public.payment_submissions (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid not null references public.committees(id) on delete cascade,
  member_id uuid not null references public.committee_members(id),
  submitted_by uuid not null references public.profiles(id),
  paid_by_name text check (length(paid_by_name) <= 80), -- e.g. a family member paying on their behalf
  amount_paisa bigint not null check (amount_paisa > 0),
  tid text check (tid ~ '^[0-9]{6,20}$'),
  transferred_at timestamptz,
  note text check (length(note) <= 500),
  client_request_id uuid not null unique, -- idempotency key from the device
  status text not null default 'pending' check (status in ('pending','verified','rejected','disputed')),
  decided_by uuid references public.profiles(id),
  decided_at timestamptz,
  decision_reason text check (length(decision_reason) <= 500),
  created_at timestamptz not null default now()
);
-- Same TID can't be claimed twice in a committee (unless the earlier claim was rejected).
create unique index one_live_claim_per_tid on public.payment_submissions (committee_id, tid)
  where tid is not null and status <> 'rejected';

-- Which obligations a transfer pays (a weekend catch-up covers several days).
create table public.payment_allocations (
  submission_id uuid not null references public.payment_submissions(id) on delete cascade,
  obligation_id uuid not null references public.contribution_obligations(id),
  amount_paisa bigint not null check (amount_paisa > 0),
  primary key (submission_id, obligation_id)
);
create index on public.payment_allocations (obligation_id);

create table public.payment_receipts (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid not null references public.committees(id) on delete cascade,
  submission_id uuid not null references public.payment_submissions(id) on delete cascade,
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp','application/pdf')),
  size_bytes int not null check (size_bytes between 1 and 5242880),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  unique (committee_id, sha256) -- the same image can't be reused for another claim
);

-- One per round: the toss and its auditable inputs.
create table public.payout_rounds (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid not null references public.committees(id) on delete cascade,
  round int not null check (round >= 1),
  toss_date date not null,
  draw_method text not null check (draw_method in ('app','manual')),
  eligible_member_ids uuid[] not null check (cardinality(eligible_member_ids) >= 1),
  excluded jsonb not null default '[]',
  random_value bigint check (random_value between 0 and 4294967295),
  winner_member_id uuid not null references public.committee_members(id),
  drawn_by uuid not null references public.profiles(id),
  drawn_at timestamptz not null default now(),
  status text not null default 'drawn' check (status in ('drawn','paid','confirmed','disputed')),
  unique (committee_id, round),
  constraint app_draw_has_random check ((draw_method = 'app') = (random_value is not null))
);
-- A member wins at most once per committee.
create unique index one_win_per_member on public.payout_rounds (committee_id, winner_member_id);

create table public.payout_records (
  id uuid primary key default gen_random_uuid(),
  payout_round_id uuid not null unique references public.payout_rounds(id) on delete cascade,
  amount_paisa bigint not null check (amount_paisa > 0),
  tid text check (tid ~ '^[0-9]{6,20}$'),
  paid_at timestamptz not null,
  evidence_path text,
  recorded_by uuid not null references public.profiles(id),
  confirmed_by uuid references public.profiles(id),
  confirmed_at timestamptz,
  dispute_reason text check (length(dispute_reason) <= 500),
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  committee_id uuid references public.committees(id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.notifications (user_id, created_at desc);

create table public.audit_events (
  id bigint generated always as identity primary key,
  committee_id uuid references public.committees(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  action text not null,
  entity text not null,
  entity_id uuid,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on public.audit_events (committee_id, created_at desc);

-- ───────────────────────── membership helpers (RLS) ─────────────────────────

create or replace function public.my_member_id(c uuid) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select id from committee_members where committee_id = c and user_id = auth.uid() and status = 'active'
$$;

create or replace function public.is_member(c uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from committee_members where committee_id = c and user_id = auth.uid() and status = 'active')
$$;

create or replace function public.is_organizer(c uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from committee_members
                 where committee_id = c and user_id = auth.uid() and status = 'active'
                   and role in ('owner','organizer'))
$$;

-- ───────────────────────── RLS ─────────────────────────

alter table public.profiles enable row level security;
alter table public.committees enable row level security;
alter table public.committee_members enable row level security;
alter table public.committee_invitations enable row level security;
alter table public.contribution_schedules enable row level security;
alter table public.contribution_obligations enable row level security;
alter table public.payment_submissions enable row level security;
alter table public.payment_allocations enable row level security;
alter table public.payment_receipts enable row level security;
alter table public.payout_rounds enable row level security;
alter table public.payout_records enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_events enable row level security;

create policy "see self and co-members" on public.profiles for select using (
  id = auth.uid() or exists (
    select 1 from committee_members a join committee_members b on a.committee_id = b.committee_id
    where a.user_id = auth.uid() and a.status = 'active' and b.user_id = profiles.id))
;
create policy "edit own profile" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy "members see committee" on public.committees for select using (is_member(id));
create policy "members see members" on public.committee_members for select using (is_member(committee_id));
create policy "organizers see invitations" on public.committee_invitations for select using (is_organizer(committee_id));
create policy "members see schedule" on public.contribution_schedules for select using (is_member(committee_id));
-- Shared ledger: every member sees everyone's obligation status (that's the point of a committee).
create policy "members see obligations" on public.contribution_obligations for select using (is_member(committee_id));
create policy "members see submissions" on public.payment_submissions for select using (is_member(committee_id));
create policy "members see allocations" on public.payment_allocations for select using (
  exists (select 1 from payment_submissions s where s.id = submission_id and is_member(s.committee_id)));
-- Receipt images are more private: uploader + organizers, unless the committee opts in.
create policy "receipt visibility" on public.payment_receipts for select using (
  is_organizer(committee_id)
  or exists (select 1 from payment_submissions s where s.id = submission_id and s.submitted_by = auth.uid())
  or (is_member(committee_id) and (select receipts_visible_to_members from committees where id = committee_id)));
create policy "members see payouts" on public.payout_rounds for select using (is_member(committee_id));
create policy "members see payout records" on public.payout_records for select using (
  exists (select 1 from payout_rounds r where r.id = payout_round_id and is_member(r.committee_id)));
create policy "own notifications" on public.notifications for select using (user_id = auth.uid());
create policy "mark own read" on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "members see audit" on public.audit_events for select using (is_member(committee_id));

-- Clients get SELECT (filtered by RLS) plus two narrow column updates. Everything else is RPC.
revoke all on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to authenticated;
grant update (display_name, phone) on public.profiles to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- ───────────────────────── internal helpers ─────────────────────────

create or replace function public._audit(c uuid, act text, ent text, ent_id uuid, d jsonb default '{}')
returns void language sql security definer set search_path = public, pg_temp as $$
  insert into audit_events (committee_id, actor_id, action, entity, entity_id, details)
  values (c, auth.uid(), act, ent, ent_id, d)
$$;

create or replace function public._notify(c uuid, member_ids uuid[], k text, p jsonb)
returns void language sql security definer set search_path = public, pg_temp as $$
  insert into notifications (user_id, committee_id, kind, payload)
  select user_id, c, k, p from committee_members where id = any(member_ids)
$$;

create or replace function public._notify_all(c uuid, k text, p jsonb)
returns void language sql security definer set search_path = public, pg_temp as $$
  insert into notifications (user_id, committee_id, kind, payload)
  select user_id, c, k, p from committee_members where committee_id = c and status = 'active'
$$;

create or replace function public._require_user() returns uuid language plpgsql stable as $$
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '28000'; end if;
  return auth.uid();
end $$;

create or replace function public._require_organizer(c uuid) returns void language plpgsql stable
security definer set search_path = public, pg_temp as $$
begin
  perform _require_user();
  if not is_organizer(c) then raise exception 'Only organizers can do this' using errcode = '42501'; end if;
end $$;

-- ───────────────────────── profiles ─────────────────────────

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into profiles (id, display_name)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), 'Member'));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────── committee lifecycle ─────────────────────────

create or replace function public.create_committee(
  p_name text, p_description text, p_member_count int, p_contribution_paisa bigint,
  p_frequency text, p_interval_days int, p_periods_per_round int, p_start_date date,
  p_payout_paisa bigint, p_account_title text, p_account_number text, p_instructions text,
  p_monthly_receive_limit_paisa bigint, p_monthly_send_limit_paisa bigint, p_rules text
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := _require_user(); cid uuid; mid uuid;
begin
  if p_start_date < pkt_today() then raise exception 'Start date is in the past'; end if;
  insert into committees (name, description, member_count, contribution_paisa, frequency, interval_days,
    periods_per_round, start_date, payout_paisa, receiving_account_title, receiving_account_number,
    payment_instructions, monthly_receive_limit_paisa, monthly_send_limit_paisa, rules, created_by)
  values (p_name, p_description, p_member_count, p_contribution_paisa, p_frequency, p_interval_days,
    p_periods_per_round, p_start_date, p_payout_paisa, p_account_title, p_account_number,
    p_instructions, p_monthly_receive_limit_paisa, p_monthly_send_limit_paisa, p_rules, uid)
  returning id into cid;
  insert into committee_members (committee_id, user_id, role) values (cid, uid, 'owner') returning id into mid;
  perform _audit(cid, 'committee.created', 'committee', cid,
    jsonb_build_object('member_count', p_member_count, 'contribution_paisa', p_contribution_paisa,
                       'frequency', p_frequency, 'payout_paisa', p_payout_paisa));
  return cid;
end $$;

create or replace function public.create_invitation(p_committee_id uuid, p_valid_hours int default 72)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare code text;
begin
  perform _require_organizer(p_committee_id);
  if (select status from committees where id = p_committee_id) <> 'forming' then
    raise exception 'Committee is no longer accepting members';
  end if;
  -- 8 chars from an unambiguous alphabet (no 0/O/1/I): easy to read out over the phone.
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + (get_byte(b, i) % 32), 1), '')
    into code from (select gen_random_bytes(8) b) x, generate_series(0, 7) i;
  insert into committee_invitations (committee_id, code, created_by, expires_at)
  values (p_committee_id, code, auth.uid(), now() + make_interval(hours => least(greatest(p_valid_hours, 1), 720)));
  perform _audit(p_committee_id, 'invitation.created', 'committee', p_committee_id);
  return code;
end $$;

create or replace function public.join_committee(p_code text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := _require_user(); inv committee_invitations; c committees; n int;
begin
  select * into inv from committee_invitations
   where code = upper(trim(p_code)) and revoked_at is null and expires_at > now();
  if not found then raise exception 'Invitation code is invalid or expired'; end if;
  select * into c from committees where id = inv.committee_id for update; -- serialize joins
  if c.status <> 'forming' then raise exception 'Committee is no longer accepting members'; end if;
  if exists (select 1 from committee_members where committee_id = c.id and user_id = uid) then
    return c.id; -- idempotent
  end if;
  select count(*) into n from committee_members where committee_id = c.id and status = 'active';
  if n >= c.member_count then raise exception 'Committee is full'; end if;
  insert into committee_members (committee_id, user_id, role) values (c.id, uid, 'member');
  perform _audit(c.id, 'member.joined', 'committee', c.id);
  return c.id;
end $$;

create or replace function public.set_member_role(p_member_id uuid, p_role text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare m committee_members;
begin
  perform _require_user();
  select * into m from committee_members where id = p_member_id;
  if not found then raise exception 'Member not found'; end if;
  if not exists (select 1 from committee_members where committee_id = m.committee_id
                 and user_id = auth.uid() and role = 'owner') then
    raise exception 'Only the owner can change roles' using errcode = '42501';
  end if;
  if m.role = 'owner' or p_role not in ('organizer','member') then raise exception 'Invalid role change'; end if;
  update committee_members set role = p_role where id = p_member_id;
  perform _audit(m.committee_id, 'member.role_changed', 'committee_member', p_member_id,
                 jsonb_build_object('from', m.role, 'to', p_role));
end $$;

-- Locks the configuration and generates every period and obligation, once.
create or replace function public.activate_committee(p_committee_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare c committees; n int; total int;
begin
  perform _require_organizer(p_committee_id);
  select * into c from committees where id = p_committee_id for update;
  if c.status <> 'forming' then raise exception 'Committee already activated'; end if;
  select count(*) into n from committee_members where committee_id = c.id and status = 'active';
  if n <> c.member_count then raise exception 'Need % members, have %', c.member_count, n; end if;
  if c.start_date < pkt_today() then raise exception 'Start date has passed; recreate the committee'; end if;
  total := c.member_count * c.periods_per_round;

  insert into contribution_schedules (committee_id, period_index, round, due_date)
  select c.id, i, i / c.periods_per_round + 1,
         case c.frequency
           when 'daily'   then c.start_date + i
           when 'weekly'  then c.start_date + i * 7
           when 'custom'  then c.start_date + i * c.interval_days
           -- Postgres anchors month arithmetic to the start date and clamps: Jan 31 → Feb 28 → Mar 31.
           when 'monthly' then (c.start_date + make_interval(months => i))::date
         end
  from generate_series(0, total - 1) i;

  insert into contribution_obligations (committee_id, schedule_id, member_id, round, due_date, amount_paisa)
  select c.id, s.id, m.id, s.round, s.due_date, c.contribution_paisa
  from contribution_schedules s cross join committee_members m
  where s.committee_id = c.id and m.committee_id = c.id and m.status = 'active';

  update committees set status = 'active' where id = c.id;
  perform _audit(c.id, 'committee.activated', 'committee', c.id, jsonb_build_object('periods', total));
  perform _notify_all(c.id, 'committee.activated', jsonb_build_object('start_date', c.start_date));
end $$;

-- ───────────────────────── payments ─────────────────────────

-- A member (or an organizer on a member's behalf, e.g. a relative paid) claims one transfer
-- covering one or more whole obligations. Status becomes Submitted — never Verified.
create or replace function public.submit_payment(
  p_member_id uuid, p_obligation_ids uuid[], p_amount_paisa bigint, p_tid text,
  p_transferred_at timestamptz, p_paid_by_name text, p_note text, p_client_request_id uuid
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := _require_user(); m committee_members; sid uuid; total bigint; cnt int;
begin
  -- Idempotent retry from a flaky connection: same request id → same submission.
  select id into sid from payment_submissions where client_request_id = p_client_request_id;
  if found then return sid; end if;

  select * into m from committee_members where id = p_member_id and status = 'active';
  if not found then raise exception 'Member not found'; end if;
  if m.user_id <> uid and not is_organizer(m.committee_id) then
    raise exception 'You can only submit your own payments' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_obligation_ids), 0) = 0 then raise exception 'Choose at least one contribution'; end if;

  -- Lock the obligations so two devices can't claim the same day at once.
  perform 1 from contribution_obligations where id = any(p_obligation_ids) for update;
  select count(*), coalesce(sum(amount_paisa), 0) into cnt, total
    from contribution_obligations
   where id = any(p_obligation_ids) and member_id = m.id and state in ('due','rejected');
  if cnt <> cardinality(p_obligation_ids) then
    raise exception 'Some contributions are not payable (already submitted, verified, or not yours)';
  end if;
  if total <> p_amount_paisa then
    raise exception 'Amount Rs % does not match the selected contributions (Rs %)',
      p_amount_paisa / 100.0, total / 100.0;
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
    jsonb_build_object('amount_paisa', p_amount_paisa, 'tid', p_tid, 'obligations', cardinality(p_obligation_ids)));
  return sid;
exception when unique_violation then
  raise exception 'This transaction ID has already been submitted in this committee';
end $$;

-- Organizer confirms the transfer appears in the real receiving account. Idempotent.
-- An organizer cannot verify a payment for their own contributions or one they submitted.
create or replace function public.verify_submission(p_submission_id uuid, p_confirmed_amount_paisa bigint)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare s payment_submissions; uid uuid := _require_user();
begin
  select * into s from payment_submissions where id = p_submission_id for update;
  if not found then raise exception 'Submission not found'; end if;
  perform _require_organizer(s.committee_id);
  if s.status = 'verified' then return; end if;
  if s.status not in ('pending','disputed') then raise exception 'Submission is %', s.status; end if;
  if s.submitted_by = uid or exists (select 1 from committee_members where id = s.member_id and user_id = uid) then
    raise exception 'Another organizer must verify your own payment' using errcode = '42501';
  end if;
  if p_confirmed_amount_paisa <> s.amount_paisa then
    raise exception 'Confirmed amount differs from the claim; reject it with a reason instead';
  end if;

  update payment_submissions set status = 'verified', decided_by = uid, decided_at = now(), decision_reason = null
   where id = s.id;
  update contribution_obligations o
     set state = 'verified', verified_paisa = a.amount_paisa, verified_by = uid, verified_at = now()
    from payment_allocations a
   where a.submission_id = s.id and o.id = a.obligation_id;

  perform _audit(s.committee_id, 'payment.verified', 'payment_submission', s.id,
                 jsonb_build_object('amount_paisa', s.amount_paisa, 'tid', s.tid));
  perform _notify(s.committee_id, array[s.member_id], 'payment.verified',
                  jsonb_build_object('submission_id', s.id, 'amount_paisa', s.amount_paisa));
end $$;

create or replace function public.reject_submission(p_submission_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare s payment_submissions; uid uuid := _require_user();
begin
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Give a reason'; end if;
  select * into s from payment_submissions where id = p_submission_id for update;
  if not found then raise exception 'Submission not found'; end if;
  perform _require_organizer(s.committee_id);
  if s.status = 'rejected' then return; end if;
  if s.status not in ('pending','disputed') then raise exception 'Submission is %', s.status; end if;
  if exists (select 1 from committee_members where id = s.member_id and user_id = uid) then
    raise exception 'Another organizer must decide on your own payment' using errcode = '42501';
  end if;

  update payment_submissions set status = 'rejected', decided_by = uid, decided_at = now(),
         decision_reason = trim(p_reason) where id = s.id;
  update contribution_obligations o
     set state = 'rejected', verified_paisa = null, verified_by = null, verified_at = null
    from payment_allocations a where a.submission_id = s.id and o.id = a.obligation_id;

  perform _audit(s.committee_id, 'payment.rejected', 'payment_submission', s.id, jsonb_build_object('reason', p_reason));
  perform _notify(s.committee_id, array[s.member_id], 'payment.rejected',
                  jsonb_build_object('submission_id', s.id, 'reason', p_reason));
end $$;

-- Registers a receipt file already uploaded to the private bucket at
-- receipts/<committee_id>/<submission_id>/<sha256>.<ext>. Same image can't back two claims.
create or replace function public.attach_receipt(p_submission_id uuid, p_storage_path text, p_mime_type text,
                                                 p_size_bytes int, p_sha256 text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare s payment_submissions; rid uuid;
begin
  perform _require_user();
  select * into s from payment_submissions where id = p_submission_id;
  if not found or s.submitted_by <> auth.uid() then raise exception 'Submission not found' using errcode = '42501'; end if;
  if p_storage_path not like s.committee_id || '/' || s.id || '/%' then raise exception 'Bad receipt path'; end if;
  insert into payment_receipts (committee_id, submission_id, storage_path, mime_type, size_bytes, sha256)
  values (s.committee_id, s.id, p_storage_path, p_mime_type, p_size_bytes, lower(p_sha256))
  returning id into rid;
  perform _audit(s.committee_id, 'receipt.attached', 'payment_receipt', rid, jsonb_build_object('sha256', p_sha256));
  return rid;
exception when unique_violation then
  raise exception 'This receipt image was already used for another payment';
end $$;

-- ───────────────────────── toss & payout ─────────────────────────

-- Eligible = active, not yet paid out, and every contribution due up to toss day verified.
create or replace function public.toss_eligibility(p_committee_id uuid, p_round int)
returns table (member_id uuid, eligible boolean, reason text, arrears_paisa bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  with toss as (
    select max(due_date) d from contribution_schedules where committee_id = p_committee_id and round = p_round
  )
  select m.id,
         not paid and coalesce(arr, 0) = 0,
         case when paid then 'already_paid_out' when coalesce(arr, 0) > 0 then 'arrears' end,
         coalesce(arr, 0)
  from committee_members m
  cross join toss
  cross join lateral (select exists (select 1 from payout_rounds r
                                     where r.committee_id = p_committee_id and r.winner_member_id = m.id)) p(paid)
  left join lateral (select sum(o.amount_paisa) arr from contribution_obligations o
                     where o.member_id = m.id and o.due_date <= toss.d
                       and o.state not in ('verified','cancelled')) a on true
  where m.committee_id = p_committee_id and m.status = 'active' and is_member(p_committee_id)
  order by m.id
$$;

-- p_method 'app': cryptographic draw, inputs stored for audit.
-- p_method 'manual': records the winner of a physical toss done in person.
create or replace function public.draw_toss(p_committee_id uuid, p_round int, p_method text, p_manual_winner uuid default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare c committees; tdate date; elig uuid[]; excl jsonb; rnd bigint; winner uuid; rid uuid;
begin
  perform _require_organizer(p_committee_id);
  select * into c from committees where id = p_committee_id for update; -- one draw at a time
  if c.status <> 'active' then raise exception 'Committee is not active'; end if;
  select id into rid from payout_rounds where committee_id = c.id and round = p_round;
  if found then return rid; end if; -- idempotent: a round is drawn once
  if p_round <> 1 and not exists (select 1 from payout_rounds where committee_id = c.id and round = p_round - 1) then
    raise exception 'Draw round % first', p_round - 1;
  end if;
  select max(due_date) into tdate from contribution_schedules where committee_id = c.id and round = p_round;
  if tdate is null then raise exception 'No such round'; end if;
  if pkt_today() < tdate then raise exception 'Toss day is %', tdate; end if;

  select coalesce(array_agg(member_id order by member_id) filter (where eligible), '{}'),
         coalesce(jsonb_agg(jsonb_build_object('member_id', member_id, 'reason', reason, 'arrears_paisa', arrears_paisa))
                  filter (where not eligible), '[]')
    into elig, excl
    from toss_eligibility(c.id, p_round);
  if cardinality(elig) = 0 then raise exception 'Nobody is eligible: clear arrears or verify pending payments first'; end if;

  if p_method = 'app' then
    rnd := (get_byte(b, 0)::bigint << 24) | (get_byte(b, 1) << 16) | (get_byte(b, 2) << 8) | get_byte(b, 3)
           from (select gen_random_bytes(4) b) x;
    winner := elig[1 + (rnd % cardinality(elig))::int]; -- mirrors pickWinner() in src/domain/toss.ts
  elsif p_method = 'manual' then
    if p_manual_winner is null or not (p_manual_winner = any(elig)) then
      raise exception 'Manual winner must be an eligible member';
    end if;
    winner := p_manual_winner;
  else
    raise exception 'Unknown draw method';
  end if;

  insert into payout_rounds (committee_id, round, toss_date, draw_method, eligible_member_ids, excluded,
                             random_value, winner_member_id, drawn_by)
  values (c.id, p_round, tdate, p_method, elig, excl, rnd, winner, auth.uid())
  returning id into rid;
  perform _audit(c.id, 'toss.drawn', 'payout_round', rid,
    jsonb_build_object('round', p_round, 'method', p_method, 'eligible', elig, 'excluded', excl,
                       'random_value', rnd, 'winner', winner));
  perform _notify_all(c.id, 'toss.drawn', jsonb_build_object('round', p_round, 'winner_member_id', winner));
  return rid;
end $$;

-- Organizer records that they sent the pot. Only allowed once the round's full pot is verified.
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
  if p_amount_paisa <> c.payout_paisa then raise exception 'Payout must be the full pot'; end if;
  select coalesce(sum(verified_paisa), 0) into verified from contribution_obligations
   where committee_id = r.committee_id and round = r.round and state = 'verified';
  if verified < c.payout_paisa then
    raise exception 'Round % is short by Rs % of verified contributions',
      r.round, (c.payout_paisa - verified) / 100.0;
  end if;

  insert into payout_records (payout_round_id, amount_paisa, tid, paid_at, evidence_path, recorded_by,
                              confirmed_by, confirmed_at)
  values (r.id, p_amount_paisa, nullif(trim(p_tid), ''), p_paid_at, p_evidence_path, auth.uid(),
          case when c.require_recipient_confirmation then null else auth.uid() end,
          case when c.require_recipient_confirmation then null else now() end)
  returning id into prid;
  update payout_rounds set status = case when c.require_recipient_confirmation then 'paid' else 'confirmed' end
   where id = r.id;
  perform _audit(r.committee_id, 'payout.recorded', 'payout_record', prid,
                 jsonb_build_object('round', r.round, 'amount_paisa', p_amount_paisa, 'tid', p_tid));
  perform _notify(r.committee_id, array[r.winner_member_id], 'payout.recorded',
                  jsonb_build_object('round', r.round, 'amount_paisa', p_amount_paisa));
  return prid;
end $$;

-- The recipient confirms (or disputes) that the money arrived — the second confirmation.
create or replace function public.confirm_payout(p_payout_round_id uuid, p_received boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare r payout_rounds; uid uuid := _require_user();
begin
  select * into r from payout_rounds where id = p_payout_round_id for update;
  if not found then raise exception 'Round not found'; end if;
  if not exists (select 1 from committee_members where id = r.winner_member_id and user_id = uid) then
    raise exception 'Only the recipient can confirm' using errcode = '42501';
  end if;
  if r.status = 'confirmed' and p_received then return; end if;
  if r.status <> 'paid' then raise exception 'Payout is %', r.status; end if;
  if p_received then
    update payout_records set confirmed_by = uid, confirmed_at = now() where payout_round_id = r.id;
    update payout_rounds set status = 'confirmed' where id = r.id;
  else
    if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Give a reason'; end if;
    update payout_records set dispute_reason = trim(p_reason) where payout_round_id = r.id;
    update payout_rounds set status = 'disputed' where id = r.id;
  end if;
  perform _audit(r.committee_id, case when p_received then 'payout.confirmed' else 'payout.disputed' end,
                 'payout_round', r.id, jsonb_build_object('reason', p_reason));
  if (select count(*) from payout_rounds where committee_id = r.committee_id and status = 'confirmed')
     = (select member_count from committees where id = r.committee_id) then
    update committees set status = 'completed' where id = r.committee_id;
  end if;
end $$;

-- ───────────────────────── function grants ─────────────────────────

revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.pkt_today(), public.my_member_id(uuid), public.is_member(uuid), public.is_organizer(uuid),
  public.create_committee(text, text, int, bigint, text, int, int, date, bigint, text, text, text, bigint, bigint, text),
  public.create_invitation(uuid, int), public.join_committee(text), public.set_member_role(uuid, text),
  public.activate_committee(uuid),
  public.submit_payment(uuid, uuid[], bigint, text, timestamptz, text, text, uuid),
  public.verify_submission(uuid, bigint), public.reject_submission(uuid, text),
  public.attach_receipt(uuid, text, text, int, text),
  public.toss_eligibility(uuid, int), public.draw_toss(uuid, int, text, uuid),
  public.record_payout(uuid, bigint, text, timestamptz, text), public.confirm_payout(uuid, boolean, text)
to authenticated;
