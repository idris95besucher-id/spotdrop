-- Fix map_marks ↔ profiles foreign key for PostgREST embeds.
--
-- Cause of "Could not find a relationship between 'map_marks' and 'profiles'":
-- 1) map_marks may exist without a FK (CREATE TABLE IF NOT EXISTS does not
--    add constraints on later runs if the table was first created without one).
-- 2) Client embeds must use map_marks_user_id_fkey — not posts_user_id_fkey.
--
-- Safe to re-run.

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

-- Ensure columns exist if an older incomplete table was created.
alter table public.map_marks add column if not exists photo_url text;
alter table public.map_marks add column if not exists place_name text;
alter table public.map_marks add column if not exists address text;
alter table public.map_marks add column if not exists created_at timestamptz not null default now();
alter table public.map_marks add column if not exists updated_at timestamptz not null default now();

-- Recreate the FK with an explicit name PostgREST can embed:
--   profiles!map_marks_user_id_fkey(...)  or  profiles(*)
alter table public.map_marks
  drop constraint if exists map_marks_user_id_fkey;

alter table public.map_marks
  add constraint map_marks_user_id_fkey
  foreign key (user_id)
  references public.profiles(id)
  on delete cascade;

create index if not exists idx_map_marks_created_at
  on public.map_marks (created_at desc);

create index if not exists idx_map_marks_user_id
  on public.map_marks (user_id);

create index if not exists idx_map_marks_coords
  on public.map_marks (latitude, longitude);

alter table public.map_marks enable row level security;

drop policy if exists "Authenticated users can read map marks" on public.map_marks;
create policy "Authenticated users can read map marks"
on public.map_marks for select
to authenticated
using (true);

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

-- Force PostgREST / Supabase schema cache refresh so the embed is visible.
notify pgrst, 'reload schema';
