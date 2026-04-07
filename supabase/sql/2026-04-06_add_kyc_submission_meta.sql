alter table public.shops
add column if not exists kyc_submission_meta jsonb;

comment on column public.shops.kyc_submission_meta is
'Stores merchant KYC submission metadata such as timestamps, location label, coordinates, and address for admin review.';
