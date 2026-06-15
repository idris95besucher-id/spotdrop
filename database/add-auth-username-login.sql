-- Username → email lookup for password sign-in (run in Supabase SQL editor).
-- Does not expose whether username exists to anonymous callers beyond auth attempt.

create or replace function public.resolve_login_email(identifier text)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  normalized text := lower(trim(identifier));
  resolved_email text;
begin
  if normalized is null or normalized = '' then
    return null;
  end if;

  if position('@' in normalized) > 0 then
    return trim(identifier);
  end if;

  select u.email into resolved_email
  from public.profiles p
  join auth.users u on u.id = p.id
  where lower(p.username) = normalized
  limit 1;

  return resolved_email;
end;
$$;

revoke all on function public.resolve_login_email(text) from public;
grant execute on function public.resolve_login_email(text) to anon, authenticated;
