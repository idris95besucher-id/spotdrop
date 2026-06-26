-- Verify profiles presence UPDATE policies exist (run in Supabase SQL Editor).
-- Read-only diagnostic — does not change data.

select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual as using_expression,
  with_check as with_check_expression
from pg_policies
where schemaname = 'public'
  and tablename = 'profiles'
  and cmd = 'UPDATE'
order by policyname;

-- Confirm RLS is enabled on profiles.
select
  relname as table_name,
  relrowsecurity as rls_enabled,
  relforcerowsecurity as rls_forced
from pg_class
join pg_namespace on pg_namespace.oid = pg_class.relnamespace
where nspname = 'public'
  and relname = 'profiles';

-- Confirm presence columns exist.
select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'profiles'
  and column_name in ('is_online', 'last_seen_at')
order by column_name;
