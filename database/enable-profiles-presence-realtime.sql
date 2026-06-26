-- Enable Supabase Realtime for profiles (is_online, last_seen_at) — DM header live presence.
-- Safe to re-run.
--
-- Prerequisites: database/add-profiles-last-seen-at.sql

-- Full row data on UPDATE so postgres_changes payloads include is_online + last_seen_at.
alter table if exists public.profiles replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.profiles;
exception
  when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
