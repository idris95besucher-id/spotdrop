-- Spot name for user spots (run in Supabase SQL editor)

alter table if exists public.posts add column if not exists spot_name text;

create index if not exists idx_posts_spot_name
  on public.posts(spot_name)
  where content_kind = 'spot' and spot_name is not null;
