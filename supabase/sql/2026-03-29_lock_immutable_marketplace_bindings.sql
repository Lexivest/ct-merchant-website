create or replace function public.prevent_immutable_column_changes()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  column_name text;
  old_value text;
  new_value text;
begin
  foreach column_name in array tg_argv loop
    old_value := to_jsonb(old) ->> column_name;
    new_value := to_jsonb(new) ->> column_name;

    if new_value is distinct from old_value then
      raise exception '% cannot be changed after creation on table %.',
        column_name,
        tg_table_name
        using errcode = '42501';
    end if;
  end loop;

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.shops') is not null then
    execute 'drop trigger if exists trg_lock_shops_immutable_bindings on public.shops';
    execute '
      create trigger trg_lock_shops_immutable_bindings
      before update on public.shops
      for each row
      execute function public.prevent_immutable_column_changes(''owner_id'')
    ';
  end if;
end;
$$;

do $$
begin
  if to_regclass('public.products') is not null then
    execute 'drop trigger if exists trg_lock_products_immutable_bindings on public.products';
    execute '
      create trigger trg_lock_products_immutable_bindings
      before update on public.products
      for each row
      execute function public.prevent_immutable_column_changes(''shop_id'')
    ';
  end if;
end;
$$;

do $$
begin
  if to_regclass('public.shop_banners_news') is not null then
    execute 'drop trigger if exists trg_lock_shop_banners_news_immutable_bindings on public.shop_banners_news';
    execute '
      create trigger trg_lock_shop_banners_news_immutable_bindings
      before update on public.shop_banners_news
      for each row
      execute function public.prevent_immutable_column_changes(''shop_id'', ''merchant_id'', ''content_type'')
    ';
  end if;
end;
$$;

do $$
begin
  if to_regclass('public.physical_verification_payments') is not null then
    execute 'drop trigger if exists trg_lock_physical_verification_payments_immutable_bindings on public.physical_verification_payments';
    execute '
      create trigger trg_lock_physical_verification_payments_immutable_bindings
      before update on public.physical_verification_payments
      for each row
      execute function public.prevent_immutable_column_changes(''merchant_id'', ''payment_ref'')
    ';
  end if;
end;
$$;

do $$
begin
  if to_regclass('public.service_fee_payments') is not null then
    execute 'drop trigger if exists trg_lock_service_fee_payments_immutable_bindings on public.service_fee_payments';
    execute '
      create trigger trg_lock_service_fee_payments_immutable_bindings
      before update on public.service_fee_payments
      for each row
      execute function public.prevent_immutable_column_changes(''merchant_id'', ''shop_id'', ''payment_ref'')
    ';
  end if;
end;
$$;
