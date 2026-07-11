-- Ensure Spot GPS capture metadata columns exist on public.posts.
-- Required by createGeoSpot / createPrivateLocationCardPost inserts.
-- Safe to re-run.

alter table if exists public.posts
  add column if not exists spot_accuracy numeric default null;

alter table if exists public.posts
  add column if not exists spot_captured_at timestamptz default null;

alter table if exists public.posts
  add column if not exists spot_speed numeric default null;

alter table if exists public.posts
  add column if not exists spot_heading numeric default null;

comment on column public.posts.spot_accuracy is
  'Horizontal GPS accuracy in meters at capture freeze';
comment on column public.posts.spot_captured_at is
  'Device GPS timestamp when coordinates were frozen for this Spot';
comment on column public.posts.spot_speed is
  'Ground speed m/s at capture freeze (nullable)';
comment on column public.posts.spot_heading is
  'Heading degrees at capture freeze (nullable)';

-- Optional lookup aid for analytics; not required for map pins.
create index if not exists idx_posts_spot_captured_at
  on public.posts (spot_captured_at desc)
  where spot_captured_at is not null;

notify pgrst, 'reload schema';
