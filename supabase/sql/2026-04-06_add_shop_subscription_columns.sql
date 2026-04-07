alter table public.shops
add column if not exists subscription_plan text,
add column if not exists subscription_end_date timestamptz,
add column if not exists is_subscription_active boolean not null default false;

comment on column public.shops.subscription_plan is
'Current merchant service subscription plan such as 6_Months or 1_Year.';

comment on column public.shops.subscription_end_date is
'UTC timestamp showing when the current merchant service subscription expires.';

comment on column public.shops.is_subscription_active is
'True when the merchant service subscription is currently active.';
