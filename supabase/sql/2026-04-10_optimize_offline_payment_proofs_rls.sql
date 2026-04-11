drop policy if exists "Merchants can create their own payment proofs" on public.offline_payment_proofs;
create policy "Merchants can create their own payment proofs"
on public.offline_payment_proofs
for insert
to authenticated
with check (
  (select auth.uid()) = merchant_id
  and status = 'pending'
  and reviewed_by is null
  and reviewed_at is null
  and exists (
    select 1
    from public.shops
    where shops.id = offline_payment_proofs.shop_id
      and shops.owner_id = (select auth.uid())
  )
);

drop policy if exists "Merchants can read their own payment proofs" on public.offline_payment_proofs;
drop policy if exists "Staff can read payment proofs" on public.offline_payment_proofs;
drop policy if exists "Authenticated can read relevant payment proofs" on public.offline_payment_proofs;
create policy "Authenticated can read relevant payment proofs"
on public.offline_payment_proofs
for select
to authenticated
using (
  (select auth.uid()) = merchant_id
  or exists (
    select 1
    from public.staff_profiles
    where staff_profiles.id = (select auth.uid())
  )
);
