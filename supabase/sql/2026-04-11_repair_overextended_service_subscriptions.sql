alter table public.shops
add column if not exists is_subscription_active boolean not null default false;

with latest_service_payments as (
  select distinct on (shop_id)
    shop_id,
    plan,
    created_at,
    case
      when plan = '1_Year' then created_at + interval '1 year'
      when plan = '6_Months' then created_at + interval '6 months'
      else null
    end as expected_end_date
  from public.service_fee_payments
  where shop_id is not null
    and status = 'success'
    and plan in ('1_Year', '6_Months')
  order by shop_id, created_at desc
)
update public.shops
set
  subscription_plan = latest_service_payments.plan,
  subscription_end_date = latest_service_payments.expected_end_date,
  is_subscription_active = latest_service_payments.expected_end_date > now()
from latest_service_payments
where shops.id = latest_service_payments.shop_id
  and latest_service_payments.expected_end_date is not null
  and shops.subscription_end_date > latest_service_payments.expected_end_date + interval '7 days';
