-- Structured official guide place cards linked to normal posts.

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
