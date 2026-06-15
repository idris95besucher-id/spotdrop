-- User geo spots on posts (run in Supabase SQL editor)
-- Logical spot fields: user_id, media_url, media_type, content (caption),
-- spot_latitude (latitude), spot_longitude (longitude), spot_address (address),
-- spot_city (city), spot_country (country), created_at on posts.

alter table if exists public.posts add column if not exists spot_latitude numeric;
alter table if exists public.posts add column if not exists spot_longitude numeric;
alter table if exists public.posts add column if not exists spot_address text;
alter table if exists public.posts add column if not exists spot_city text;
alter table if exists public.posts add column if not exists spot_country text;

alter table if exists public.posts drop constraint if exists posts_content_kind_check;
alter table if exists public.posts
  add constraint posts_content_kind_check
  check (content_kind in ('post', 'story', 'video', 'spot'));

create index if not exists idx_posts_spot_geo
  on public.posts(spot_latitude, spot_longitude, created_at desc)
  where spot_latitude is not null and spot_longitude is not null;

create index if not exists idx_posts_spot_kind
  on public.posts(content_kind, created_at desc)
  where content_kind = 'spot';
