-- =============================================================================
-- Cleanup temporary Production push-test SENDER data only
-- =============================================================================
-- Targets ONLY profiles whose username matches:
--   push_sender_%
--
-- NEVER touches push_recv_* or any other accounts (including production
-- idris1995gaza@gmail.com / push_recv_abe6b331).
--
-- Safe rules:
-- - Never unfiltered DELETE
-- - Never delete user_push_tokens for users that still have platform = 'ios'
-- - Does not delete auth.users by default (commented out)
--
-- Review the PREVIEW selects, then run the DELETE transaction in Supabase SQL Editor.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- PREVIEW (read-only)
-- -----------------------------------------------------------------------------

-- Temporary sender profiles
select
  p.id as profile_id,
  p.username,
  p.created_at,
  u.email as auth_email,
  exists (
    select 1
    from public.user_push_tokens t
    where t.user_id = p.id
      and lower(t.platform) = 'ios'
  ) as has_ios_push_token
from public.profiles p
left join auth.users u on u.id = p.id
where p.username like 'push_sender_%'
order by p.username;

-- Related direct_messages involving those senders
with temp_senders as (
  select id
  from public.profiles
  where username like 'push_sender_%'
)
select
  count(*) as related_direct_messages
from public.direct_messages dm
where dm.sender_id in (select id from temp_senders)
   or dm.recipient_id in (select id from temp_senders);

-- Related conversations
with temp_senders as (
  select id
  from public.profiles
  where username like 'push_sender_%'
)
select
  count(*) as related_direct_conversations
from public.direct_conversations dc
where dc.user_one_id in (select id from temp_senders)
   or dc.user_two_id in (select id from temp_senders);

-- Related notifications
with temp_senders as (
  select id
  from public.profiles
  where username like 'push_sender_%'
),
temp_message_ids as (
  select dm.id::text as source_id
  from public.direct_messages dm
  where dm.sender_id in (select id from temp_senders)
     or dm.recipient_id in (select id from temp_senders)
)
select
  count(*) as related_notifications
from public.notifications n
where n.user_id in (select id from temp_senders)
   or n.actor_id in (select id from temp_senders)
   or (n.type = 'direct_message' and n.source_id in (select source_id from temp_message_ids));

-- Inbox prefs / non-iOS tokens that would be touched
with temp_senders as (
  select id, username
  from public.profiles
  where username like 'push_sender_%'
)
select
  (select count(*) from public.chat_inbox_preferences cip
    where cip.user_id in (select id from temp_senders)
       or (cip.chat_type = 'dm' and cip.chat_key in (select id::text from temp_senders))
  ) as related_chat_inbox_preferences,
  (select count(*) from public.user_push_tokens t
    where t.user_id in (select id from temp_senders)
      and not exists (
        select 1 from public.user_push_tokens ios
        where ios.user_id = t.user_id and lower(ios.platform) = 'ios'
      )
  ) as deletable_non_ios_temp_tokens,
  (select count(*) from public.user_push_tokens t
    where t.user_id in (select id from temp_senders)
      and lower(t.platform) = 'ios'
  ) as protected_ios_tokens_left_alone;

-- -----------------------------------------------------------------------------
-- DELETE (run only after reviewing PREVIEW)
-- -----------------------------------------------------------------------------

begin;

create temporary table tmp_push_sender_profiles on commit drop as
select
  p.id,
  p.username,
  exists (
    select 1
    from public.user_push_tokens t
    where t.user_id = p.id
      and lower(t.platform) = 'ios'
  ) as has_ios_push_token
from public.profiles p
where p.username like 'push_sender_%';

create temporary table tmp_push_sender_message_ids on commit drop as
select dm.id
from public.direct_messages dm
where dm.sender_id in (select id from tmp_push_sender_profiles)
   or dm.recipient_id in (select id from tmp_push_sender_profiles);

-- Dedupe rows for those notifications (if table exists)
do $$
begin
  if to_regclass('public.push_send_dedupe') is not null then
    delete from public.push_send_dedupe d
    using public.notifications n
    where d.notification_id = n.id
      and (
        n.user_id in (select id from tmp_push_sender_profiles)
        or n.actor_id in (select id from tmp_push_sender_profiles)
        or (n.type = 'direct_message' and n.source_id in (select id::text from tmp_push_sender_message_ids))
      );
  end if;
end $$;

-- Notifications
delete from public.notifications n
where n.user_id in (select id from tmp_push_sender_profiles)
   or n.actor_id in (select id from tmp_push_sender_profiles)
   or (n.type = 'direct_message' and n.source_id in (select id::text from tmp_push_sender_message_ids));

-- Inbox preferences
delete from public.chat_inbox_preferences cip
where cip.user_id in (select id from tmp_push_sender_profiles)
   or (cip.chat_type = 'dm' and cip.chat_key in (select id::text from tmp_push_sender_profiles));

-- Direct messages
delete from public.direct_messages dm
where dm.id in (select id from tmp_push_sender_message_ids);

-- Conversations
delete from public.direct_conversations dc
where dc.user_one_id in (select id from tmp_push_sender_profiles)
   or dc.user_two_id in (select id from tmp_push_sender_profiles);

-- Non-iOS push tokens only
delete from public.user_push_tokens t
where t.user_id in (
  select id from tmp_push_sender_profiles where has_ios_push_token = false
);

-- Profiles (skip any that somehow have an iOS token)
delete from public.profiles p
where p.id in (
  select id from tmp_push_sender_profiles where has_ios_push_token = false
);

-- Optional: delete matching auth.users only for profiles we removed.
-- Keep commented unless you are certain these accounts were created only for push tests.
--
-- delete from auth.users u
-- where u.id in (
--   select id from tmp_push_sender_profiles where has_ios_push_token = false
-- );

commit;

-- Post-check: should return zero rows
select id, username
from public.profiles
where username like 'push_sender_%';
