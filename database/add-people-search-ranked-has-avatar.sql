-- Add has_avatar to the existing people_search_ranked view (database/add-people-search-ranking.sql,
-- database/add-people-search-ranked-is-verified.sql) so /search/people can enforce a strict
-- "everyone with a photo before everyone without one" primary sort, independent of
-- ranking_score. Bumping the avatar_url weight inside ranking_score cannot guarantee this
-- (a high-activity account with no photo could still outscore a low-activity account with
-- one) — has_avatar is a separate boolean column, sorted before ranking_score entirely, not
-- folded into the score.
--
-- Does NOT touch ranking_score, its weights, is_verified, or online logic — has_avatar is
-- appended as a plain passthrough column only.
--
-- Postgres requires CREATE OR REPLACE VIEW to keep existing output columns in place and only
-- append new ones at the end — has_avatar is added after ranking_score and is_verified for
-- that reason.
--
-- Prerequisites: database/add-people-search-ranking.sql, database/add-people-search-ranked-is-verified.sql
-- (both must already be applied)
-- Safe to re-run.

create or replace view public.people_search_ranked
with (security_invoker = true) as
select
  p.id,
  p.username,
  p.avatar_url,
  p.cover_url,
  p.bio,
  p.country_slug,
  p.city_slug,
  p.city_id,
  p.age_years,
  p.is_online,
  p.last_seen_at,
  p.is_demo,
  p.created_at,
  (
    -- lib/userPresence.ts: PRESENCE_HEARTBEAT_MS = 45s, PRESENCE_ONLINE_FRESH_MS = 90s (2
    -- heartbeats) — the app's own "don't trust is_online alone" gate (isLastSeenFresh /
    -- isOnlineNow). A crashed app can leave is_online = true forever with a stale
    -- last_seen_at, so the +100 bonus requires both the flag AND a fresh heartbeat.
    (
      case
        when p.is_online = true and p.last_seen_at >= now() - interval '5 minutes' then 100
        else 0
      end
    )
    + (
        case
          when p.last_seen_at is not null and p.last_seen_at >= now() - interval '24 hours' then 60
          when p.last_seen_at is not null and p.last_seen_at >= now() - interval '7 days' then 30
          when p.last_seen_at is not null and p.last_seen_at >= now() - interval '30 days' then 10
          else 0
        end
      )
    + (case when p.avatar_url is not null and btrim(p.avatar_url) <> '' then 25 else 0 end)
    + (case when p.cover_url is not null and btrim(p.cover_url) <> '' then 15 else 0 end)
    + (case when coalesce(post_stats.post_count, 0) > 0 then 20 else 0 end)
    + (
        case
          when post_stats.last_post_at is not null and post_stats.last_post_at >= now() - interval '7 days' then 25
          else 0
        end
      )
    + (case when p.bio is not null and btrim(p.bio) <> '' then 10 else 0 end)
    + (
        case
          when p.country_slug is not null and btrim(p.country_slug) <> '' and p.city_id is not null then 5
          else 0
        end
      )
  )::integer as ranking_score,
  p.is_verified,
  (p.avatar_url is not null and btrim(p.avatar_url) <> '') as has_avatar
from public.profiles p
left join (
  select user_id, count(*) as post_count, max(created_at) as last_post_at
  from public.posts
  group by user_id
) post_stats on post_stats.user_id = p.id;

grant select on public.people_search_ranked to authenticated;

notify pgrst, 'reload schema';
