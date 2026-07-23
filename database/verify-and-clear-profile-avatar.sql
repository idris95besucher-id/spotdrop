-- Verify / clear stale profile avatar for the production account.
-- Run in Supabase SQL Editor (Production).

-- 1) Inspect current avatar_url
select
  p.id,
  p.username,
  u.email,
  p.avatar_url,
  (p.avatar_url is null or btrim(p.avatar_url) = '') as avatar_is_cleared
from public.profiles p
left join auth.users u on u.id = p.id
where u.email = 'idris1995gaza@gmail.com'
   or p.username ilike '%idris%';

-- 2) Clear stale avatar_url (deleted photo still referenced)
update public.profiles p
set avatar_url = null
from auth.users u
where u.id = p.id
  and u.email = 'idris1995gaza@gmail.com'
  and p.avatar_url is not null;

-- 3) Confirm
select id, username, avatar_url
from public.profiles p
where p.id in (
  select id from auth.users where email = 'idris1995gaza@gmail.com'
);
