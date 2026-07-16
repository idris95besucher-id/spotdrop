-- Photo messages + live-location sharing for DM, group chats, and City Rooms.
--
-- Photo messages: reuse the existing "post-media" bucket (already public-read, owner-path-
-- scoped write — see schema.sql) via the existing uploadPostMedia() helper. No new bucket, no
-- new RLS. Just one new nullable column per table: image_url.
--
-- "Send current location": needs NO new columns at all — reuses the exact same
-- message_type='text' + "[[spotdrop_place]]" marker-body convention already built for the
-- Share-a-place feature (lib/cityRoomPlaceMessage.ts, sendMapPlaceToRecipient/Group/CityRoom).
-- A one-time GPS snapshot is just another CityRoomPlacePayload.
--
-- "Share live location" is the one genuinely new mechanic: one message row that gets UPDATED
-- in place as the sender's position changes, rather than a new message per update. That needs
-- four new nullable columns (lat/lng/updated_at/expires_at) on all three tables, and — only for
-- group_chat_messages — a new UPDATE policy, since that table currently has none at all
-- (messages were fully immutable until now). direct_messages already allows the sender to
-- update their own message (see direct_messages_guard_recipient_update — it only restricts the
-- *recipient*, never the sender), and city_messages already has a full owner UPDATE policy
-- (used by the existing edit-message feature), so neither needs a new policy — only a trigger
-- guard on group_chat_messages, scoped so the sender can only ever change the live-location
-- columns on their own row, never rewrite the message body/type after the fact.
--
-- Safe to re-run.

-- 1) Photo column ---------------------------------------------------------------

alter table public.direct_messages add column if not exists image_url text;
alter table public.group_chat_messages add column if not exists image_url text;
alter table public.city_messages add column if not exists image_url text;

-- 2) Live-location columns -------------------------------------------------------

alter table public.direct_messages add column if not exists live_location_lat double precision;
alter table public.direct_messages add column if not exists live_location_lng double precision;
alter table public.direct_messages add column if not exists live_location_updated_at timestamptz;
alter table public.direct_messages add column if not exists live_location_expires_at timestamptz;

alter table public.group_chat_messages add column if not exists live_location_lat double precision;
alter table public.group_chat_messages add column if not exists live_location_lng double precision;
alter table public.group_chat_messages add column if not exists live_location_updated_at timestamptz;
alter table public.group_chat_messages add column if not exists live_location_expires_at timestamptz;

alter table public.city_messages add column if not exists live_location_lat double precision;
alter table public.city_messages add column if not exists live_location_lng double precision;
alter table public.city_messages add column if not exists live_location_updated_at timestamptz;
alter table public.city_messages add column if not exists live_location_expires_at timestamptz;

-- 3) Re-harden direct_messages recipient-update guard to cover the new columns ---------------
-- (blocklist trigger — a newly added column is allowed through by default unless added here;
-- the sender is already unrestricted, so this only needs to list columns the *recipient* must
-- never touch, which now includes image_url too since add-voice-messages.sql only covered audio.)

create or replace function public.direct_messages_guard_recipient_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is distinct from new.recipient_id then
    return new;
  end if;

  if auth.uid() = new.sender_id then
    return new;
  end if;

  -- Recipient may only touch delivery/read timestamps.
  if new.body is distinct from old.body
    or new.message_type is distinct from old.message_type
    or new.post_id is distinct from old.post_id
    or new.spot_share_id is distinct from old.spot_share_id
    or new.sender_id is distinct from old.sender_id
    or new.recipient_id is distinct from old.recipient_id
    or new.audio_url is distinct from old.audio_url
    or new.audio_duration_seconds is distinct from old.audio_duration_seconds
    or new.audio_waveform is distinct from old.audio_waveform
    or new.image_url is distinct from old.image_url
    or new.live_location_lat is distinct from old.live_location_lat
    or new.live_location_lng is distinct from old.live_location_lng
    or new.live_location_updated_at is distinct from old.live_location_updated_at
    or new.live_location_expires_at is distinct from old.live_location_expires_at
  then
    raise exception 'recipients may only update read/delivery timestamps';
  end if;

  return new;
end;
$$;

drop trigger if exists direct_messages_guard_recipient_update on public.direct_messages;
create trigger direct_messages_guard_recipient_update
before update on public.direct_messages
for each row
execute function public.direct_messages_guard_recipient_update();

-- 4) New: group_chat_messages sender-scoped UPDATE (this table had zero UPDATE policies
-- before now) — allowlist-by-trigger: the sender may only ever change the live-location
-- columns on their own message, nothing else.

grant update on table public.group_chat_messages to authenticated;

drop policy if exists "Group message sender updates own live location" on public.group_chat_messages;
create policy "Group message sender updates own live location"
on public.group_chat_messages for update
to authenticated
using (auth.uid() = sender_id)
with check (auth.uid() = sender_id);

create or replace function public.group_chat_messages_guard_sender_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.body is distinct from old.body
    or new.message_type is distinct from old.message_type
    or new.post_id is distinct from old.post_id
    or new.audio_url is distinct from old.audio_url
    or new.audio_duration_seconds is distinct from old.audio_duration_seconds
    or new.audio_waveform is distinct from old.audio_waveform
    or new.image_url is distinct from old.image_url
    or new.group_id is distinct from old.group_id
    or new.sender_id is distinct from old.sender_id
    or new.created_at is distinct from old.created_at
  then
    raise exception 'senders may only update their own live-location fields after sending';
  end if;

  return new;
end;
$$;

drop trigger if exists group_chat_messages_guard_sender_update on public.group_chat_messages;
create trigger group_chat_messages_guard_sender_update
before update on public.group_chat_messages
for each row
execute function public.group_chat_messages_guard_sender_update();

notify pgrst, 'reload schema';
