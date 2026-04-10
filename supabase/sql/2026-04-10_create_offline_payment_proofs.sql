create table if not exists public.offline_payment_proofs (
  id bigserial primary key,
  merchant_id uuid not null references auth.users(id) on delete cascade,
  shop_id bigint not null references public.shops(id) on delete cascade,
  payment_kind text not null check (payment_kind in ('physical_verification', 'service_fee')),
  plan text check (plan is null or plan in ('6_Months', '1_Year')),
  amount integer not null check (amount >= 0),
  merchant_name text,
  merchant_email text,
  shop_name text,
  depositor_name text,
  transfer_reference text,
  receipt_path text not null,
  receipt_url text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  approval_payment_ref text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint offline_payment_proofs_service_plan_check check (
    (payment_kind = 'service_fee' and plan is not null)
    or (payment_kind = 'physical_verification' and plan is null)
  )
);

create index if not exists idx_offline_payment_proofs_status_created
  on public.offline_payment_proofs(status, created_at desc);

create index if not exists idx_offline_payment_proofs_merchant_shop
  on public.offline_payment_proofs(merchant_id, shop_id);

create unique index if not exists idx_offline_payment_proofs_one_pending
  on public.offline_payment_proofs(merchant_id, shop_id, payment_kind, coalesce(plan, ''))
  where status = 'pending';

create or replace function public.set_offline_payment_proofs_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_offline_payment_proofs_updated_at on public.offline_payment_proofs;
create trigger trg_offline_payment_proofs_updated_at
before update on public.offline_payment_proofs
for each row
execute function public.set_offline_payment_proofs_updated_at();

alter table public.offline_payment_proofs enable row level security;

drop policy if exists "Merchants can create their own payment proofs" on public.offline_payment_proofs;
create policy "Merchants can create their own payment proofs"
on public.offline_payment_proofs
for insert
to authenticated
with check (
  auth.uid() = merchant_id
  and status = 'pending'
  and reviewed_by is null
  and reviewed_at is null
  and exists (
    select 1
    from public.shops
    where shops.id = offline_payment_proofs.shop_id
      and shops.owner_id = auth.uid()
  )
);

drop policy if exists "Merchants can read their own payment proofs" on public.offline_payment_proofs;
create policy "Merchants can read their own payment proofs"
on public.offline_payment_proofs
for select
to authenticated
using (auth.uid() = merchant_id);

drop policy if exists "Staff can read payment proofs" on public.offline_payment_proofs;
create policy "Staff can read payment proofs"
on public.offline_payment_proofs
for select
to authenticated
using (
  exists (
    select 1
    from public.staff_profiles
    where staff_profiles.id = auth.uid()
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-receipts',
  'payment-receipts',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Merchants can upload their payment receipts" on storage.objects;
create policy "Merchants can upload their payment receipts"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'payment-receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Merchants can read their payment receipts" on storage.objects;
create policy "Merchants can read their payment receipts"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'payment-receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
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
    where staff_profiles.id = auth.uid()
  )
);
