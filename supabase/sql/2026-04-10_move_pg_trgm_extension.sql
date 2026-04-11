create schema if not exists extensions;

do $$
begin
  if exists (
    select 1
    from pg_extension ext
    join pg_namespace nsp on nsp.oid = ext.extnamespace
    where ext.extname = 'pg_trgm'
      and nsp.nspname = 'public'
  ) then
    alter extension pg_trgm set schema extensions;
  end if;
end;
$$;

grant usage on schema extensions to anon, authenticated, service_role;
