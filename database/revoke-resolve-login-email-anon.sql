-- SECURITY: stop exposing email addresses via username lookup (email oracle).
-- Username sign-in must go through /api/auth/sign-in or Edge Function
-- sign-in-with-identifier (service-role resolves email server-side).
--
-- Idempotent: safe when resolve_login_email is absent or has multiple overloads.
-- Does not create or restore the deprecated function.

do $$
declare
  fn record;
  revoked_any boolean := false;
begin
  for fn in
    select
      n.nspname as schema_name,
      p.proname as function_name,
      pg_get_function_identity_arguments(p.oid) as identity_args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'resolve_login_email'
  loop
    execute format(
      'revoke all on function %I.%I(%s) from public',
      fn.schema_name,
      fn.function_name,
      fn.identity_args
    );
    execute format(
      'revoke all on function %I.%I(%s) from anon',
      fn.schema_name,
      fn.function_name,
      fn.identity_args
    );
    execute format(
      'revoke all on function %I.%I(%s) from authenticated',
      fn.schema_name,
      fn.function_name,
      fn.identity_args
    );
    execute format(
      'comment on function %I.%I(%s) is %L',
      fn.schema_name,
      fn.function_name,
      fn.identity_args,
      'DEPRECATED: Do not grant to anon. Use server-side sign-in-with-identifier instead.'
    );
    revoked_any := true;
    raise notice 'Revoked EXECUTE on public.resolve_login_email(%)', fn.identity_args;
  end loop;

  if not revoked_any then
    raise notice
      'public.resolve_login_email(*) not found — nothing to revoke (server-side sign-in-with-identifier is used instead).';
  end if;
end;
$$;
