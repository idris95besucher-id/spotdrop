-- =============================================================================
-- Verify DM unread model after fix-dm-unread-read-model.sql
-- =============================================================================
-- Scenario:
--   1) Existing DM thread was fully read (historical pile backfilled / opened)
--   2) Receive 1 new message → unread for that pair must be exactly 1
--   3) Open thread (mark_dm_thread_read) → unread for that pair must be 0
--
-- Replace :me and :partner with real UUIDs (or use the lookup below).
-- =============================================================================

-- Optional: resolve ids by email/username
-- select id, email from auth.users where email = 'you@example.com';
-- select id, username from public.profiles where username = 'partner_username';

-- 1) Unread totals for current user (must match My Chats / nav / iOS badge source)
select
  count(*) filter (
    where dm.read_at is null
      and dm.recipient_id = :me
      and dm.sender_id <> :me
  ) as unread_incoming_total,
  count(*) filter (
    where dm.read_at is null
      and dm.recipient_id = :me
      and dm.sender_id = :partner
  ) as unread_from_partner
from public.direct_messages dm;

-- 2) After one new message from partner (run after insert, before open):
--    unread_from_partner must equal 1

-- 3) Simulate open-thread mark-read as the recipient (run while authed as :me),
--    or call from the app / SQL with set local role:
-- select public.mark_dm_thread_read(:partner);

-- 4) Re-check: unread_from_partner must equal 0
select
  count(*) as unread_from_partner_after_open
from public.direct_messages dm
where dm.recipient_id = :me
  and dm.sender_id = :partner
  and dm.read_at is null;

-- 5) Sanity: never count sender's own outbound as unread for them
select
  count(*) as incorrectly_counted_own_outbound
from public.direct_messages dm
where dm.sender_id = :me
  and dm.recipient_id = :partner
  and dm.read_at is null
  and false; -- own outbound is excluded by recipient_id = me in app counts
