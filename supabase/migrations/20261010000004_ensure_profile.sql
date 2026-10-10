-- Accounts can exist without a profile (e.g. someone signed in with Google before the
-- schema was applied, so the new-user trigger never ran). Backfill them, and let the
-- app repair its own profile on demand.

create or replace function public._name_from_meta(meta jsonb) returns text
language sql immutable as $$
  select left(coalesce(
    nullif(trim(meta->>'display_name'), ''),
    nullif(trim(meta->>'full_name'), ''),
    nullif(trim(meta->>'name'), ''),
    'Member'), 80)
$$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into profiles (id, display_name) values (new.id, _name_from_meta(new.raw_user_meta_data))
  on conflict (id) do nothing;
  return new;
end $$;

insert into public.profiles (id, display_name)
select u.id, public._name_from_meta(u.raw_user_meta_data)
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

-- Idempotent: creates the caller's profile only if it's missing.
create or replace function public.ensure_my_profile() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform _require_user();
  insert into profiles (id, display_name)
  select u.id, _name_from_meta(u.raw_user_meta_data) from auth.users u where u.id = auth.uid()
  on conflict (id) do nothing;
end $$;

revoke execute on function public.ensure_my_profile() from public, anon;
grant execute on function public.ensure_my_profile() to authenticated;
revoke execute on function public._name_from_meta(jsonb) from public, anon;
