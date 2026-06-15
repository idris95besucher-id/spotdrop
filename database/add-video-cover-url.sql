-- Video poster frame for feed/profile/map grids (chosen or auto-generated at publish)
alter table if exists public.posts add column if not exists video_cover_url text;

create index if not exists idx_posts_video_cover_url
  on public.posts(video_cover_url)
  where video_cover_url is not null;

-- Backfill from legacy thumbnail_url when present
update public.posts
set video_cover_url = thumbnail_url
where video_cover_url is null
  and thumbnail_url is not null
  and (media_type = 'video' or video_url is not null);
