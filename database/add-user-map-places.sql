-- Personal map places: saved locations + private markers (safe to re-run).

create table if not exists public.user_saved_places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  -- Rounded coords for duplicate prevention (~1.1m).
  coord_key text not null,
  name text not null,
  address text,
  city text,
  country text,
  created_at timestamptz not null default now(),
  unique (user_id, coord_key)
);

create index if not exists idx_user_saved_places_user_id
  on public.user_saved_places (user_id, created_at desc);

create table if not exists public.user_map_markers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  coord_key text not null,
  name text not null,
  address text,
  city text,
  country text,
  created_at timestamptz not null default now(),
  unique (user_id, coord_key)
);

create index if not exists idx_user_map_markers_user_id
  on public.user_map_markers (user_id, created_at desc);

alter table public.user_saved_places enable row level security;
alter table public.user_map_markers enable row level security;

drop policy if exists "Users can read own saved places" on public.user_saved_places;
create policy "Users can read own saved places"
on public.user_saved_places for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert own saved places" on public.user_saved_places;
create policy "Users can insert own saved places"
on public.user_saved_places for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own saved places" on public.user_saved_places;
create policy "Users can delete own saved places"
on public.user_saved_places for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can read own map markers" on public.user_map_markers;
create policy "Users can read own map markers"
on public.user_map_markers for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert own map markers" on public.user_map_markers;
create policy "Users can insert own map markers"
on public.user_map_markers for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own map markers" on public.user_map_markers;
create policy "Users can delete own map markers"
on public.user_map_markers for delete
to authenticated
using (auth.uid() = user_id);

grant select, insert, delete on table public.user_saved_places to authenticated;
grant select, insert, delete on table public.user_map_markers to authenticated;
