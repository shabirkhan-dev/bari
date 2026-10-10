-- Private receipts bucket. Path: <committee_id>/<submission_id>/<sha256>.<ext>
-- Supabase-only (uses the storage schema); not exercised by the local Postgres tests.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 5242880, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;

-- Upload only into a submission you made.
create policy "upload own receipt" on storage.objects for insert to authenticated with check (
  bucket_id = 'receipts' and exists (
    select 1 from public.payment_submissions s
    where s.submitted_by = auth.uid()
      and (storage.foldername(name))[1] = s.committee_id::text
      and (storage.foldername(name))[2] = s.id::text));

-- Read follows the same rule as payment_receipts rows.
create policy "read permitted receipts" on storage.objects for select to authenticated using (
  bucket_id = 'receipts' and exists (
    select 1 from public.payment_receipts r where r.storage_path = name));
-- No update/delete policies: receipts are immutable evidence.
