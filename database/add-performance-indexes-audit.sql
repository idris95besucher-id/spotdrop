-- Performance index audit (2026-06-21)
-- Run in Supabase SQL Editor. Idempotent — safe to re-run.
--
-- Adds only indexes missing from existing migrations that match hot query paths.
-- Does NOT duplicate indexes already defined in schema.sql and related migrations.

-- ---------------------------------------------------------------------------
-- posts
-- ---------------------------------------------------------------------------
-- Hot path: loadFeedPosts / querySpotFeed
--   WHERE content_kind = 'spot'
--     AND visibility = 'public'
--     AND published_to_spots = true
--   ORDER BY spot_rank_score DESC, created_at DESC
--
-- Existing:
--   idx_posts_explore_spots        → created_at only (no rank)
--   idx_posts_spot_rank_score      → all spots by rank (no visibility/published filter)
--   idx_posts_user_id_created_at   → profile grids
--   PK (id)                        → single-post lookups

create index if not exists idx_posts_explore_spots_rank
  on public.posts (spot_rank_score desc, created_at desc)
  where content_kind = 'spot'
    and visibility = 'public'
    and published_to_spots = true;

-- ---------------------------------------------------------------------------
-- direct_messages
-- ---------------------------------------------------------------------------
-- Hot paths:
--   loadDirectMessagesForThread / loadMessagesForPartners
--     OR (sender=A AND recipient=B) OR (sender=B AND recipient=A)
--     ORDER BY created_at
--   loadDistinctMessagePartnerIds
--     OR sender_id = me OR recipient_id = me
--
-- Existing:
--   idx_direct_messages_recipient_id_created_at → recipient-side timeline
--   idx_direct_messages_recipient_unread        → unread badge (partial)
--   idx_direct_messages_recipient_undelivered   → delivery ack (partial)
--   direct_messages_post_id_idx                 → spot message lookups

-- Sender-side partner discovery (complements recipient_id_created_at).
create index if not exists idx_direct_messages_sender_id_created_at
  on public.direct_messages (sender_id, created_at desc);

-- Thread history for a stable conversation pair (both OR branches share one key).
create index if not exists idx_direct_messages_conversation_created_at
  on public.direct_messages (
    least(sender_id, recipient_id),
    greatest(sender_id, recipient_id),
    created_at asc
  );

notify pgrst, 'reload schema';
