-- Map Marks: automatic 24-hour expiry.
-- Safe to re-run.
--
-- What this does:
-- 1. Adds an `expires_at` column (= created_at + 24h) to public.map_marks,
--    backfilled correctly for existing rows.
-- 2. Tightens the SELECT policy so expired marks are invisible to every
--    client the moment they expire (defense in depth — not just a UI filter).
-- 3. Adds a cleanup function that hard-deletes expired marks (and, via the
--    existing `city_messages.map_mark_id ... on delete cascade` FK, their
--    shared room cards too).
-- 4. Schedules that cleanup with pg_cron so rows are actually removed from
--    the database, not just hidden.

-- 1. expires_at column -------------------------------------------------------

alter table public.map_marks
  add column if not exists expires_at timestamptz;

update public.map_marks
set expires_at = created_at + interval '24 hours'
where expires_at is null;

alter table public.map_marks
  alter column expires_at set default (now() + interval '24 hours');

alter table public.map_marks
  alter column expires_at set not null;

create index if not exists idx_map_marks_expires_at
  on public.map_marks (expires_at);

-- 2. RLS: hide expired marks from every reader, including the owner --------

drop policy if exists "Authenticated users can read map marks" on public.map_marks;
create policy "Authenticated users can read map marks"
on public.map_marks for select
to authenticated
using (expires_at > now());

-- 3. Cleanup function --------------------------------------------------------

create or replace function public.cleanup_expired_map_marks()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.map_marks where expires_at <= now();
$$;

revoke all on function public.cleanup_expired_map_marks() from public;
grant execute on function public.cleanup_expired_map_marks() to authenticated, service_role;

-- 4. Schedule the cleanup with pg_cron ---------------------------------------
-- Requires the pg_cron extension. On Supabase: Database -> Extensions -> enable
-- "pg_cron" first if the `create extension` line below errors with
-- "permission denied" or "extension pg_cron is not available".
create extension if not exists pg_cron;

select cron.schedule(
  'cleanup-expired-map-marks',
  '*/15 * * * *', -- every 15 minutes; marks already disappear from the UI instantly via the RLS policy above, this just reclaims storage
  $$ delete from public.map_marks where expires_at <= now(); $$
);

notify pgrst, 'reload schema';
