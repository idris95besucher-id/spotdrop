-- Fixes two separate "400 Bad Request" sources reported in Safari console:
--   profiles?select=message_privacy
--   post_media_items?select=id,post_id,sort_order,media_url,media_type,video_cover_url,audio_muted
--
-- A 400 (not 404) from PostgREST on a select means the TABLE exists but a requested COLUMN
-- doesn't — confirmed against the live schema:
--
--   1. profiles.message_privacy      — never added. database/add-profile-message-privacy.sql
--      exists in this repo but isn't in database/schema.sql, so it was written but never run
--      against this Supabase project (same class of gap as direct_conversations earlier).
--
--   2. post_media_items.video_cover_url and post_media_items.audio_muted — the table itself
--      exists (this request 400s, it doesn't 404), but these two columns are missing. They come
--      from two later migrations (database/add-post-media-items.sql,
--      database/add-post-audio-muted.sql) that also never fully ran.
--
-- Both columns are genuinely used by working features (Settings > message privacy; video Spot
-- carousel cover thumbnails + per-video mute state), so the fix is to add the missing columns,
-- not strip them from the queries.
--
-- One more thing this file corrects: database/add-post-media-items.sql declares
--   post_id bigint NOT NULL REFERENCES public.posts(id)
-- but public.posts.id is uuid (see database/schema.sql:148 and every other posts FK in this
-- project — post_comments.post_id, post_reactions.post_id are both uuid). Postgres has no
-- implicit bigint<->uuid cast, and database/create-delete-owned-post-rpc.sql:64 already does
-- `post_media_items.post_id = v_row.id` (v_row.id is posts.id, uuid) without error, which is
-- only possible if the live post_media_items.post_id is already uuid. So the "bigint" in that
-- older file was simply wrong; this migration uses uuid for the CREATE TABLE IF NOT EXISTS guard
-- so a fresh environment ends up matching what's actually live, instead of reproducing that bug.
--
-- Safe to run more than once.

-- 1) profiles.message_privacy ------------------------------------------------------------------

alter table public.profiles
  add column if not exists message_privacy text not null default 'everyone';

alter table public.profiles
  drop constraint if exists profiles_message_privacy_check;

alter table public.profiles
  add constraint profiles_message_privacy_check
  check (message_privacy in ('everyone', 'followers', 'friends', 'nobody'));

-- 2) post_media_items — table guard (uuid post_id, matching the real posts.id type) + missing
--    columns. The CREATE TABLE is a no-op here since the table already exists live; it only
--    matters for an environment that never ran add-post-media-items.sql at all.

create table if not exists public.post_media_items (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  sort_order integer not null,
  media_url text not null,
  media_type text not null check (media_type in ('image', 'video')),
  video_cover_url text,
  audio_muted boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.post_media_items add column if not exists video_cover_url text;
alter table public.post_media_items add column if not exists audio_muted boolean not null default false;

create index if not exists idx_post_media_items_post_sort
  on public.post_media_items (post_id, sort_order);

alter table public.post_media_items enable row level security;

drop policy if exists "post_media_items_select_public" on public.post_media_items;
create policy "post_media_items_select_public"
  on public.post_media_items for select
  using (
    exists (
      select 1 from public.posts p
      where p.id = post_media_items.post_id
        and (p.visibility = 'public' or p.user_id = auth.uid())
    )
  );

drop policy if exists "post_media_items_insert_own" on public.post_media_items;
create policy "post_media_items_insert_own"
  on public.post_media_items for insert
  with check (
    exists (
      select 1 from public.posts p
      where p.id = post_media_items.post_id
        and p.user_id = auth.uid()
    )
  );

drop policy if exists "post_media_items_delete_own" on public.post_media_items;
create policy "post_media_items_delete_own"
  on public.post_media_items for delete
  using (
    exists (
      select 1 from public.posts p
      where p.id = post_media_items.post_id
        and p.user_id = auth.uid()
    )
  );

notify pgrst, 'reload schema';
