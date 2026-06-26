-- User presence columns for DM online / last-seen (safe to re-run).
--
-- Run in Supabase SQL Editor before enable-profiles-presence-realtime.sql.

-- Heartbeat timestamp (updated while app is active).
alter table if exists public.profiles
  add column if not exists last_seen_at timestamptz;

-- Online flag (set true on heartbeat, false when app backgrounds).
alter table if exists public.profiles
  add column if not exists is_online boolean not null default false;

-- Backfill nulls if column existed without default.
update public.profiles
set is_online = false
where is_online is null;

alter table if exists public.profiles
  alter column is_online set default false;

alter table if exists public.profiles
  alter column is_online set not null;

-- Speed up presence lookups / sorting.
create index if not exists idx_profiles_last_seen_at
  on public.profiles (last_seen_at desc nulls last);

create index if not exists idx_profiles_is_online
  on public.profiles (is_online)
  where is_online = true;

notify pgrst, 'reload schema';
