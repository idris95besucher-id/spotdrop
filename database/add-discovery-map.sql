-- Bern Discovery Map (future-ready for full Switzerland expansion)

create table if not exists public.discovery_regions (
  id uuid primary key default gen_random_uuid(),
  country_slug text not null,
  slug text not null,
  name text not null,
  map_bounds_north numeric not null,
  map_bounds_south numeric not null,
  map_bounds_east numeric not null,
  map_bounds_west numeric not null,
  city_slug text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (country_slug, slug)
);

create table if not exists public.discovery_places (
  id uuid primary key default gen_random_uuid(),
  region_id uuid not null references public.discovery_regions(id) on delete cascade,
  slug text not null,
  name text not null,
  category text not null check (category in ('lakes', 'mountains', 'villages', 'viewpoints', 'hiking')),
  latitude numeric not null,
  longitude numeric not null,
  short_description text,
  official_summary text,
  hero_image_url text,
  official_url text,
  sort_order int not null default 0,
  is_featured boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (region_id, slug)
);

create table if not exists public.discovery_place_saves (
  user_id uuid not null references public.profiles(id) on delete cascade,
  place_id uuid not null references public.discovery_places(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, place_id)
);

create table if not exists public.discovery_place_comments (
  id bigint generated always as identity primary key,
  place_id uuid not null references public.discovery_places(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_discovery_place_comments_place_created
  on public.discovery_place_comments(place_id, created_at asc);

alter table if exists public.posts add column if not exists discovery_place_id uuid references public.discovery_places(id) on delete set null;
alter table if exists public.posts add column if not exists content_kind text not null default 'post';
alter table if exists public.posts add column if not exists expires_at timestamptz;

alter table if exists public.posts drop constraint if exists posts_content_kind_check;
alter table if exists public.posts
  add constraint posts_content_kind_check
  check (content_kind in ('post', 'story', 'video'));

create index if not exists idx_posts_discovery_place_kind
  on public.posts(discovery_place_id, content_kind, created_at desc);

alter table public.discovery_regions enable row level security;
alter table public.discovery_places enable row level security;
alter table public.discovery_place_saves enable row level security;
alter table public.discovery_place_comments enable row level security;

drop policy if exists "Anyone authenticated can read discovery regions" on public.discovery_regions;
drop policy if exists "Public can read discovery regions" on public.discovery_regions;
create policy "Public can read discovery regions"
on public.discovery_regions for select
to anon, authenticated
using (is_active = true);

drop policy if exists "Anyone authenticated can read discovery places" on public.discovery_places;
drop policy if exists "Public can read discovery places" on public.discovery_places;
create policy "Public can read discovery places"
on public.discovery_places for select
to anon, authenticated
using (true);

drop policy if exists "Users manage own discovery place saves" on public.discovery_place_saves;
create policy "Users manage own discovery place saves"
on public.discovery_place_saves for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Discovery place comments readable" on public.discovery_place_comments;
drop policy if exists "Public can read discovery place comments" on public.discovery_place_comments;
create policy "Public can read discovery place comments"
on public.discovery_place_comments for select
to anon, authenticated
using (true);

drop policy if exists "Users can create discovery place comments" on public.discovery_place_comments;
create policy "Users can create discovery place comments"
on public.discovery_place_comments for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Users can delete own discovery place comments" on public.discovery_place_comments;
create policy "Users can delete own discovery place comments"
on public.discovery_place_comments for delete
to authenticated
using (user_id = auth.uid());
