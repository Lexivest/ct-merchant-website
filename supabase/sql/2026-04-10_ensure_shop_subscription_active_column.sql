alter table public.shops
add column if not exists is_subscription_active boolean not null default false;

update public.shops
set is_subscription_active = true
where subscription_end_date is not null
  and subscription_end_date > now()
  and is_subscription_active is distinct from true;

comment on column public.shops.is_subscription_active is
'True when the merchant service subscription is currently active.';
