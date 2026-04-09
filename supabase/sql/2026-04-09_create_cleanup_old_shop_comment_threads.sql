create or replace function public.cleanup_old_shop_comment_threads()
returns table (
  deleted_threads bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count bigint := 0;
begin
  with deleted_rows as (
    delete from public.shop_comments
    where parent_id is null
      and created_at < (now() - interval '1 year')
    returning id
  )
  select count(*) into deleted_count
  from deleted_rows;

  return query
  select deleted_count;
end;
$$;

revoke all on function public.cleanup_old_shop_comment_threads() from public;
revoke all on function public.cleanup_old_shop_comment_threads() from anon;
revoke all on function public.cleanup_old_shop_comment_threads() from authenticated;
