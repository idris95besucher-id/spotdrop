-- Official Channel posts: support up to 10 photos per post (was exactly one,
-- via official_channel_posts.image_path).
--
-- Additive, backward-compatible: official_channel_posts.image_path is left
-- completely untouched — existing single-image posts keep rendering exactly
-- as before. New posts (1-10 photos) populate this new table instead and
-- leave image_path null; feed rendering checks this table first and falls
-- back to the legacy image_path column when no rows exist here.
--
-- The 1-10 range itself is enforced by the publish API route (all writes to
-- this table go through service_role there, never directly from a client),
-- matching how other per-post limits in this codebase (e.g. SPOT_MAX_PHOTOS)
-- are enforced at the application layer rather than in SQL.

create table if not exists public.official_channel_post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.official_channel_posts(id) on delete cascade,
  image_path text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (post_id, sort_order)
);

create index if not exists official_channel_post_media_post_id_idx
  on public.official_channel_post_media (post_id);

alter table public.official_channel_post_media enable row level security;

-- Mirrors official_channel_posts' own "published read" policy exactly.
drop policy if exists "Official channel post media published read" on public.official_channel_post_media;
create policy "Official channel post media published read"
on public.official_channel_post_media for select
to authenticated
using (
  exists (
    select 1 from public.official_channel_posts p
    where p.id = official_channel_post_media.post_id
      and p.status = 'published'
  )
);

-- No INSERT / UPDATE / DELETE policies for authenticated/anon — writes are
-- service_role only, same as official_channel_posts itself.
revoke all on table public.official_channel_post_media from public;
revoke all on table public.official_channel_post_media from anon;
revoke all on table public.official_channel_post_media from authenticated;
grant select on table public.official_channel_post_media to authenticated;
grant all on table public.official_channel_post_media to service_role;

notify pgrst, 'reload schema';
