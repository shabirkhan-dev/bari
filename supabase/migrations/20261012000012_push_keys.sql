-- Web Push (VAPID) keys, created once by the push worker and kept in the database, so the
-- only secret to configure is the worker's Supabase secret key. The private key is readable
-- by the service role only; the public key is public by design.
create table if not exists public.push_config (
  id int primary key default 1 check (id = 1),
  public_key text not null,
  private_key text not null,
  created_at timestamptz not null default now()
);
alter table public.push_config enable row level security; -- no policies: clients can't read it
revoke all on public.push_config from anon, authenticated;

-- Worker: the stored keys (null until first saved).
create or replace function public.push_vapid() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('public_key', public_key, 'private_key', private_key) from push_config where id = 1
$$;

-- Worker: save a freshly generated pair; if two runs race, the first one wins and both use it.
create or replace function public.save_push_vapid(p_public text, p_private text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into push_config (id, public_key, private_key) values (1, p_public, p_private) on conflict (id) do nothing;
  return push_vapid();
end $$;

-- App: the public key phones subscribe with.
create or replace function public.push_public_key() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select public_key from push_config where id = 1
$$;

revoke execute on function public.push_vapid() from public, anon, authenticated;
revoke execute on function public.save_push_vapid(text, text) from public, anon, authenticated;
revoke execute on function public.push_public_key() from public, anon;
grant execute on function public.push_vapid() to service_role;
grant execute on function public.save_push_vapid(text, text) to service_role;
grant execute on function public.push_public_key() to authenticated;
