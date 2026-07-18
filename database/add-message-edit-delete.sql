-- Long-press Edit / Delete for everyone for direct_messages, group_chat_messages, and
-- city_messages. Safe to re-run.
--
-- Rules enforced here (server-side, not just client-side):
--   - Only the original sender/author may edit or delete their own message.
--   - Edit is only allowed within 15 minutes of created_at.
--   - Delete for everyone is only allowed within 24 hours of created_at.
--   - A message can never be un-deleted, and a deleted message can never be edited.
--   - Editing may only ever change body/content + edited_at — nothing else, in the same
--     statement (immutable identity columns, media/location columns, etc. cannot move).
--   - Delete-for-everyone may only ever set deleted_at — nothing else changes in that
--     statement. The client is responsible for rendering "This message was deleted" for any
--     row with deleted_at set, regardless of what the original body/content/media columns
--     still contain.
--   - Media (audio/photo) and location messages can only be deleted, never edited.
--   - Group system messages can never be edited (message_type must be 'text').
--   - city_messages rows linked to a map_mark (map_mark_id is not null) are exempt from this
--     guard entirely — those are synced from the map_mark itself via a separate
--     security-definer trigger (sync_city_message_for_map_mark) and are not user-editable
--     chat messages in the normal sense.

-- 1) New columns ------------------------------------------------------------------

alter table public.direct_messages add column if not exists edited_at timestamptz;
alter table public.direct_messages add column if not exists deleted_at timestamptz;

alter table public.group_chat_messages add column if not exists edited_at timestamptz;
alter table public.group_chat_messages add column if not exists deleted_at timestamptz;

alter table public.city_messages add column if not exists deleted_at timestamptz;

-- 2) direct_messages: sender may edit/delete their own message -------------------------

drop policy if exists "Direct messages sender edits or deletes own message" on public.direct_messages;
create policy "Direct messages sender edits or deletes own message"
on public.direct_messages for update
to authenticated
using (auth.uid() = sender_id)
with check (auth.uid() = sender_id);

create or replace function public.direct_messages_guard_sender_edit_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_delete_action boolean;
  is_media_or_location boolean;
begin
  -- Only guard the sender's own edit/delete path here; recipient-side restrictions are
  -- handled separately by direct_messages_guard_recipient_update.
  if auth.uid() is distinct from old.sender_id then
    return new;
  end if;

  if new.sender_id is distinct from old.sender_id
    or new.recipient_id is distinct from old.recipient_id
    or new.created_at is distinct from old.created_at
    or new.message_type is distinct from old.message_type
    or new.post_id is distinct from old.post_id
    or new.spot_share_id is distinct from old.spot_share_id
  then
    raise exception 'cannot change message identity fields';
  end if;

  is_delete_action := new.deleted_at is distinct from old.deleted_at;

  if is_delete_action then
    if old.deleted_at is not null then
      raise exception 'message already deleted';
    end if;

    if new.deleted_at is null then
      raise exception 'cannot undelete a message';
    end if;

    if old.created_at < now() - interval '24 hours' then
      raise exception 'delete window has expired';
    end if;

    if new.body is distinct from old.body
      or new.edited_at is distinct from old.edited_at
      or new.audio_url is distinct from old.audio_url
      or new.audio_duration_seconds is distinct from old.audio_duration_seconds
      or new.audio_waveform is distinct from old.audio_waveform
      or new.image_url is distinct from old.image_url
      or new.live_location_lat is distinct from old.live_location_lat
      or new.live_location_lng is distinct from old.live_location_lng
      or new.live_location_updated_at is distinct from old.live_location_updated_at
      or new.live_location_expires_at is distinct from old.live_location_expires_at
    then
      raise exception 'delete may only set deleted_at';
    end if;

    return new;
  end if;

  -- Otherwise this is an edit attempt.
  if old.deleted_at is not null then
    raise exception 'cannot edit a deleted message';
  end if;

  is_media_or_location := old.audio_url is not null or old.image_url is not null or old.live_location_lat is not null;

  if is_media_or_location then
    raise exception 'media and location messages cannot be edited';
  end if;

  if old.created_at < now() - interval '15 minutes' then
    raise exception 'edit window has expired';
  end if;

  if new.audio_url is distinct from old.audio_url
    or new.audio_duration_seconds is distinct from old.audio_duration_seconds
    or new.audio_waveform is distinct from old.audio_waveform
    or new.image_url is distinct from old.image_url
    or new.live_location_lat is distinct from old.live_location_lat
    or new.live_location_lng is distinct from old.live_location_lng
    or new.live_location_updated_at is distinct from old.live_location_updated_at
    or new.live_location_expires_at is distinct from old.live_location_expires_at
  then
    raise exception 'edit may only change body and edited_at';
  end if;

  return new;
end;
$$;

drop trigger if exists direct_messages_guard_sender_edit_delete on public.direct_messages;
create trigger direct_messages_guard_sender_edit_delete
before update on public.direct_messages
for each row
execute function public.direct_messages_guard_sender_edit_delete();

-- 3) group_chat_messages: replace the sender-update guard to cover edit/delete -----------
-- (previously this only permitted live-location column updates; that feature was removed,
-- so this trigger's whole purpose is now edit/delete-for-everyone.)

create or replace function public.group_chat_messages_guard_sender_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_delete_action boolean;
  is_media_or_location boolean;
begin
  if new.group_id is distinct from old.group_id
    or new.sender_id is distinct from old.sender_id
    or new.created_at is distinct from old.created_at
    or new.message_type is distinct from old.message_type
    or new.post_id is distinct from old.post_id
  then
    raise exception 'cannot change message identity fields';
  end if;

  is_delete_action := new.deleted_at is distinct from old.deleted_at;

  if is_delete_action then
    if old.deleted_at is not null then
      raise exception 'message already deleted';
    end if;

    if new.deleted_at is null then
      raise exception 'cannot undelete a message';
    end if;

    if old.created_at < now() - interval '24 hours' then
      raise exception 'delete window has expired';
    end if;

    if new.body is distinct from old.body
      or new.edited_at is distinct from old.edited_at
      or new.audio_url is distinct from old.audio_url
      or new.audio_duration_seconds is distinct from old.audio_duration_seconds
      or new.audio_waveform is distinct from old.audio_waveform
      or new.image_url is distinct from old.image_url
      or new.live_location_lat is distinct from old.live_location_lat
      or new.live_location_lng is distinct from old.live_location_lng
      or new.live_location_updated_at is distinct from old.live_location_updated_at
      or new.live_location_expires_at is distinct from old.live_location_expires_at
    then
      raise exception 'delete may only set deleted_at';
    end if;

    return new;
  end if;

  if old.deleted_at is not null then
    raise exception 'cannot edit a deleted message';
  end if;

  if old.message_type <> 'text' then
    raise exception 'only text messages can be edited';
  end if;

  is_media_or_location := old.audio_url is not null or old.image_url is not null or old.live_location_lat is not null;

  if is_media_or_location then
    raise exception 'media and location messages cannot be edited';
  end if;

  if old.created_at < now() - interval '15 minutes' then
    raise exception 'edit window has expired';
  end if;

  if new.audio_url is distinct from old.audio_url
    or new.audio_duration_seconds is distinct from old.audio_duration_seconds
    or new.audio_waveform is distinct from old.audio_waveform
    or new.image_url is distinct from old.image_url
    or new.live_location_lat is distinct from old.live_location_lat
    or new.live_location_lng is distinct from old.live_location_lng
    or new.live_location_updated_at is distinct from old.live_location_updated_at
    or new.live_location_expires_at is distinct from old.live_location_expires_at
  then
    raise exception 'edit may only change body and edited_at';
  end if;

  return new;
end;
$$;

drop policy if exists "Group message sender updates own live location" on public.group_chat_messages;
drop policy if exists "Group message sender edits or deletes own message" on public.group_chat_messages;
create policy "Group message sender edits or deletes own message"
on public.group_chat_messages for update
to authenticated
using (auth.uid() = sender_id)
with check (auth.uid() = sender_id);

drop trigger if exists group_chat_messages_guard_sender_update on public.group_chat_messages;
create trigger group_chat_messages_guard_sender_update
before update on public.group_chat_messages
for each row
execute function public.group_chat_messages_guard_sender_update();

-- 4) city_messages: switch from hard delete to time-boxed soft delete + edit window -----
-- Drop the old hard-delete policy: "delete for everyone" now goes through the soft-delete
-- (deleted_at) path below instead, so a raw DELETE would otherwise let a sender bypass the
-- 24-hour window entirely.

drop policy if exists "Allow city message owner delete" on public.city_messages;

create or replace function public.city_messages_guard_owner_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_delete_action boolean;
  is_media_or_location boolean;
begin
  -- Rows synced from a map_mark are driven by sync_city_message_for_map_mark (security
  -- definer, runs as whoever edited the map mark) and are not user-editable chat messages —
  -- exempt them entirely so that trigger keeps working unmodified.
  if old.map_mark_id is not null then
    return new;
  end if;

  if auth.uid() is distinct from old.user_id then
    raise exception 'only the sender can edit or delete this message';
  end if;

  if new.user_id is distinct from old.user_id
    or new.city_id is distinct from old.city_id
    or new.created_at is distinct from old.created_at
  then
    raise exception 'cannot change message identity fields';
  end if;

  is_delete_action := new.deleted_at is distinct from old.deleted_at;

  if is_delete_action then
    if old.deleted_at is not null then
      raise exception 'message already deleted';
    end if;

    if new.deleted_at is null then
      raise exception 'cannot undelete a message';
    end if;

    if old.created_at < now() - interval '24 hours' then
      raise exception 'delete window has expired';
    end if;

    if new.content is distinct from old.content
      or new.edited_at is distinct from old.edited_at
      or new.audio_url is distinct from old.audio_url
      or new.audio_duration_seconds is distinct from old.audio_duration_seconds
      or new.audio_waveform is distinct from old.audio_waveform
      or new.image_url is distinct from old.image_url
      or new.live_location_lat is distinct from old.live_location_lat
      or new.live_location_lng is distinct from old.live_location_lng
      or new.live_location_updated_at is distinct from old.live_location_updated_at
      or new.live_location_expires_at is distinct from old.live_location_expires_at
    then
      raise exception 'delete may only set deleted_at';
    end if;

    return new;
  end if;

  if old.deleted_at is not null then
    raise exception 'cannot edit a deleted message';
  end if;

  is_media_or_location := old.audio_url is not null or old.image_url is not null or old.live_location_lat is not null;

  if is_media_or_location then
    raise exception 'media and location messages cannot be edited';
  end if;

  if old.created_at < now() - interval '15 minutes' then
    raise exception 'edit window has expired';
  end if;

  if new.audio_url is distinct from old.audio_url
    or new.audio_duration_seconds is distinct from old.audio_duration_seconds
    or new.audio_waveform is distinct from old.audio_waveform
    or new.image_url is distinct from old.image_url
    or new.live_location_lat is distinct from old.live_location_lat
    or new.live_location_lng is distinct from old.live_location_lng
    or new.live_location_updated_at is distinct from old.live_location_updated_at
    or new.live_location_expires_at is distinct from old.live_location_expires_at
  then
    raise exception 'edit may only change content and edited_at';
  end if;

  return new;
end;
$$;

drop trigger if exists city_messages_guard_owner_update on public.city_messages;
create trigger city_messages_guard_owner_update
before update on public.city_messages
for each row
execute function public.city_messages_guard_owner_update();

notify pgrst, 'reload schema';
