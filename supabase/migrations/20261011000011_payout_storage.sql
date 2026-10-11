-- Payout proof (the organizer's JazzCash screenshot of sending the pot).
-- Path: payouts/<committee_id>/<payout_round_id>/<sha256>.<ext> in the private receipts bucket.
-- Supabase-only (storage schema); not exercised by the local Postgres tests.

create policy "organizers upload payout proof" on storage.objects for insert to authenticated with check (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] = 'payouts'
  and exists (
    select 1 from public.payout_rounds r
     where r.committee_id::text = (storage.foldername(name))[2]
       and r.id::text = (storage.foldername(name))[3]
       and r.status = 'drawn'
       and public.is_organizer(r.committee_id)));

create policy "members read payout proof" on storage.objects for select to authenticated using (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] = 'payouts'
  and exists (
    select 1 from public.payout_rounds r
     where r.committee_id::text = (storage.foldername(name))[2]
       and public.is_member(r.committee_id)));
