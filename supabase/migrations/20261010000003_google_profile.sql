-- New accounts from Google arrive with "full_name"/"name" in their metadata, not "display_name".
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into profiles (id, display_name)
  values (new.id, left(coalesce(
    nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    nullif(trim(new.raw_user_meta_data->>'name'), ''),
    'Member'), 80));
  return new;
end $$;

-- Members give the JazzCash number they pay from, so the organizer can match transfers.
-- Stored in Pakistani local form: 03XXXXXXXXX.
alter table public.profiles drop constraint if exists profiles_phone_check;
alter table public.profiles add constraint profiles_phone_check check (phone ~ '^03[0-9]{9}$');
