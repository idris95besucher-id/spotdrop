-- Fixes repeated "400 Bad Request" on /rest/v1/map_marks.
--
-- Exact Supabase/PostgREST error (already captured once before in this repo — see the comment
-- at the top of database/fix-map-marks-profiles-fk.sql, which diagnosed this same failure):
--
--   code: PGRST200
--   message: Could not find a relationship between 'map_marks' and 'profiles' using the
--            hint 'map_marks_user_id_fkey' in the schema cache
--
-- Root cause: lib/mapMarks.ts embeds the author profile via
--   profiles!map_marks_user_id_fkey(username, avatar_url, is_private, is_demo)
-- That embed hint is only resolvable by PostgREST if a foreign key constraint literally named
-- map_marks_user_id_fkey exists from map_marks.user_id -> profiles.id. database/add-map-marks.sql
-- and database/fix-map-marks-profiles-fk.sql both add it, but neither is in database/schema.sql —
-- they were written but never actually run against this Supabase project (same class of gap as
-- direct_conversations and profiles.message_privacy earlier). Without the named FK, EVERY select
-- against map_marks that embeds profiles fails with PGRST200 — including the "fallback" query in
-- lib/mapMarks.ts, which still uses the identical embed hint, so a single call logs two failed
-- requests (primary + fallback), matching the "repeated 400s" reported.
--
-- The query in lib/mapMarks.ts is correct for the intended schema — this is a missing-relation
-- problem, not a wrong-query problem, so the fix is entirely this migration. No code changes.
--
-- This also folds in every column MAP_MARK_SELECT (lib/mapMarks.ts) actually selects, in case an
-- older/partial map_marks table is missing them too — category, municipality, region_code,
-- region_name, canton_code, canton_name, country_slug, country_code, hub_city_slug, expires_at
-- (from database/add-map-mark-global-region-room-share.sql and
-- database/add-map-marks-24h-expiry.sql, also never confirmed run). Region-room-sharing RPCs and
-- the region_room_mappings seed data are NOT duplicated here — run
-- database/add-map-mark-global-region-room-share.sql separately if that feature also needs it;
-- this file only concerns the map_marks <-> profiles relationship and its own columns.
--
-- Safe to run more than once.

-- 1) Base table -----------------------------------------------------------------------------

create table if not exists public.map_marks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  text text not null check (char_length(trim(text)) > 0),
  photo_url text,
  latitude double precision not null,
  longitude double precision not null,
  place_name text,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2) Every column MAP_MARK_SELECT expects ----------------------------------------------------

alter table public.map_marks add column if not exists photo_url text;
alter table public.map_marks add column if not exists place_name text;
alter table public.map_marks add column if not exists address text;
alter table public.map_marks add column if not exists category text;
alter table public.map_marks add column if not exists municipality text;
alter table public.map_marks add column if not exists region_code text;
alter table public.map_marks add column if not exists region_name text;
alter table public.map_marks add column if not exists canton_code text;
alter table public.map_marks add column if not exists canton_name text;
alter table public.map_marks add column if not exists country_slug text;
alter table public.map_marks add column if not exists country_code text;
alter table public.map_marks add column if not exists hub_city_slug text;
alter table public.map_marks add column if not exists created_at timestamptz not null default now();
alter table public.map_marks add column if not exists updated_at timestamptz not null default now();

alter table public.map_marks add column if not exists expires_at timestamptz;
update public.map_marks set expires_at = created_at + interval '24 hours' where expires_at is null;
alter table public.map_marks alter column expires_at set default (now() + interval '24 hours');
alter table public.map_marks alter column expires_at set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'map_marks_category_check'
      and conrelid = 'public.map_marks'::regclass
  ) then
    alter table public.map_marks
      add constraint map_marks_category_check
      check (
        category is null or category in (
          'traffic', 'road_closed', 'police', 'parking', 'danger',
          'event', 'viewpoint', 'restaurant', 'cafe', 'question', 'general'
        )
      );
  end if;
end $$;

update public.map_marks set category = 'general' where category is null;
alter table public.map_marks alter column category set default 'general';

-- 3) THE actual fix — the named foreign key PostgREST embeds on -----------------------------

alter table public.map_marks
  drop constraint if exists map_marks_user_id_fkey;

alter table public.map_marks
  add constraint map_marks_user_id_fkey
  foreign key (user_id)
  references public.profiles(id)
  on delete cascade;

-- 4) Indexes -----------------------------------------------------------------------------------

create index if not exists idx_map_marks_created_at on public.map_marks (created_at desc);
create index if not exists idx_map_marks_user_id on public.map_marks (user_id);
create index if not exists idx_map_marks_coords on public.map_marks (latitude, longitude);
create index if not exists idx_map_marks_expires_at on public.map_marks (expires_at);
create index if not exists idx_map_marks_category on public.map_marks (category);
create index if not exists idx_map_marks_region_code on public.map_marks (region_code);
create index if not exists idx_map_marks_country_slug on public.map_marks (country_slug);

-- 5) RLS (final state: expired marks hidden from every reader, including the owner) ---------

alter table public.map_marks enable row level security;

drop policy if exists "Authenticated users can read map marks" on public.map_marks;
create policy "Authenticated users can read map marks"
on public.map_marks for select
to authenticated
using (expires_at > now());

drop policy if exists "Users can insert own map marks" on public.map_marks;
create policy "Users can insert own map marks"
on public.map_marks for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own map marks" on public.map_marks;
create policy "Users can update own map marks"
on public.map_marks for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own map marks" on public.map_marks;
create policy "Users can delete own map marks"
on public.map_marks for delete
to authenticated
using (auth.uid() = user_id);

grant select, insert, update, delete on table public.map_marks to authenticated;

notify pgrst, 'reload schema';
