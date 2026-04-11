drop policy if exists "Merchants can upload their payment receipts" on storage.objects;
create policy "Merchants can upload their payment receipts"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'payment-receipts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Merchants can read their payment receipts" on storage.objects;
create policy "Merchants can read their payment receipts"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'payment-receipts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Staff can read payment receipts" on storage.objects;
create policy "Staff can read payment receipts"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'payment-receipts'
  and exists (
    select 1
    from public.staff_profiles
    where staff_profiles.id = (select auth.uid())
  )
);
