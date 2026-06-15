-- Video spot cover / thumbnail (poster frame chosen at publish time)
alter table if exists public.posts add column if not exists thumbnail_url text;

create index if not exists idx_posts_thumbnail_url
  on public.posts(thumbnail_url)
  where thumbnail_url is not null;
