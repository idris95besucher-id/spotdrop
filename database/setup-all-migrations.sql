-- SpotDrop: paste into Supabase SQL Editor → Run

-- >>> database/add-guide-places.sql
-- Structured place cards linked to normal posts.

create table if not exists public.guide_places (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade unique,
  title text not null,
  location_name text,
  canton text,
  city text,
  description text,
  opening_hours text,
  price_info text,
  official_url text,
  read_more_text text,
  media_url text,
  media_type text check (media_type is null or media_type in ('image', 'video')),
  source_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.guide_places add column if not exists post_id uuid references public.posts(id) on delete cascade;
alter table if exists public.guide_places add column if not exists title text;
alter table if exists public.guide_places add column if not exists location_name text;
alter table if exists public.guide_places add column if not exists canton text;
alter table if exists public.guide_places add column if not exists city text;
alter table if exists public.guide_places add column if not exists description text;
alter table if exists public.guide_places add column if not exists opening_hours text;
alter table if exists public.guide_places add column if not exists price_info text;
alter table if exists public.guide_places add column if not exists official_url text;
alter table if exists public.guide_places add column if not exists read_more_text text;
alter table if exists public.guide_places add column if not exists media_url text;
alter table if exists public.guide_places add column if not exists media_type text;
alter table if exists public.guide_places add column if not exists source_url text;
alter table if exists public.guide_places add column if not exists created_at timestamptz not null default now();
alter table if exists public.guide_places add column if not exists updated_at timestamptz not null default now();

alter table if exists public.guide_places drop constraint if exists guide_places_media_type_check;
alter table if exists public.guide_places
  add constraint guide_places_media_type_check
  check (media_type is null or media_type in ('image', 'video'));

create unique index if not exists guide_places_post_id_key on public.guide_places(post_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'guide_places_post_id_unique'
      and conrelid = 'public.guide_places'::regclass
  ) then
    alter table public.guide_places
      add constraint guide_places_post_id_unique unique using index guide_places_post_id_key;
  end if;
end $$;

alter table public.guide_places enable row level security;

drop policy if exists "Authenticated users can read public guide places" on public.guide_places;
create policy "Authenticated users can read public guide places"
on public.guide_places for select
to authenticated
using (
  exists (
    select 1
    from public.posts
    where posts.id = guide_places.post_id
      and (
        posts.visibility = 'public'
        or posts.user_id = auth.uid()
      )
  )
);

drop policy if exists "Post owners can manage own guide places" on public.guide_places;
create policy "Post owners can manage own guide places"
on public.guide_places for all
to authenticated
using (
  exists (
    select 1
    from public.posts
    where posts.id = guide_places.post_id
      and posts.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.posts
    where posts.id = guide_places.post_id
      and posts.user_id = auth.uid()
  )
);

-- >>> database/add-discovery-map.sql
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

-- >>> database/add-stories.sql
-- Stories: 24h profile highlights, archive, optional map/city sharing

create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  city_id uuid references public.cities(id) on delete set null,
  place_id uuid references public.discovery_places(id) on delete set null,
  media_url text not null,
  media_type text not null check (media_type in ('image', 'video')),
  caption text not null default '',
  visibility text not null default 'public' check (visibility in ('public', 'friends', 'private')),
  shared_to_room boolean not null default false,
  expires_at timestamptz not null,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_stories_user_active on public.stories(user_id, expires_at desc);
create index if not exists idx_stories_place_history on public.stories(place_id, created_at desc) where place_id is not null;
create index if not exists idx_stories_city_history on public.stories(city_id, created_at desc) where city_id is not null;

alter table public.stories enable row level security;

drop policy if exists "Public stories readable" on public.stories;
create policy "Public stories readable"
on public.stories for select
to anon, authenticated
using (
  visibility = 'public'
  or user_id = auth.uid()
);

drop policy if exists "Users create own stories" on public.stories;
create policy "Users create own stories"
on public.stories for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Users update own stories" on public.stories;
create policy "Users update own stories"
on public.stories for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users delete own stories" on public.stories;
create policy "Users delete own stories"
on public.stories for delete
to authenticated
using (user_id = auth.uid());

notify pgrst, 'reload schema';
