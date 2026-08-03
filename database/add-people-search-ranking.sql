-- People search ranking: sort /search/people by profile activity/completeness
-- instead of plain alphabetical order, computed server-side so pagination stays
-- correct across pages.
--
-- Prerequisites (columns/indexes referenced below):
--   database/add-profiles-last-seen-at.sql   (profiles.last_seen_at, profiles.is_online)
--   database/hide-profile-date-of-birth.sql  (profiles.age_years)
--   schema.sql                               (profiles.avatar_url, cover_url, bio,
--                                              country_slug, city_id; posts.user_id,
--                                              created_at + idx_posts_user_id_created_at)
--
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
  )::integer as ranking_score
from public.profiles p
left join (
  select user_id, count(*) as post_count, max(created_at) as last_post_at
  from public.posts
  group by user_id
) post_stats on post_stats.user_id = p.id;

grant select on public.people_search_ranked to authenticated;

notify pgrst, 'reload schema';
