-- Fix: deleting your own message in city/country room chats silently does nothing.
--
-- Root cause (see chat write-up for the full explanation):
--   1. City/country rooms never use a real SQL DELETE — "Delete for everyone" is a soft
--      delete (`update city_messages set deleted_at = now() ...`), same convention as DMs and
--      group chats. That update is only allowed by RLS when `auth.uid() = user_id`, enforced by
--      the "Allow city message owner update" policy.
--   2. Unlike direct_messages/group_chat_messages (where the owner-update policy and the
--      edit/delete guard trigger are created together in the same migration), city_messages'
--      owner-update policy was created in an *earlier*, separate migration
--      (add-city-messages-edited-at.sql) that add-message-edit-delete.sql never re-asserts. If
--      that earlier file was skipped/out of order on any environment, the guard trigger exists
--      but the policy that lets the UPDATE reach it does not — and Postgres/PostgREST does NOT
--      raise an error for an UPDATE that RLS filters down to zero matching rows, it just quietly
--      updates nothing. That is indistinguishable from "the button did nothing" in the UI.
--   3. The client-side delete call also never checked whether any row actually came back, so
--      even a real trigger exception (e.g. delete window expired) was caught and only
--      console.error'd, never shown to the user (fixed in lib/messageEditDelete.ts / the chat
--      views alongside this migration).
--
-- This migration re-asserts the column, the owner-only UPDATE policy, and the guard trigger
-- together (idempotent, safe to re-run) so city_messages can never again drift out of sync the
-- way described above.

alter table if exists public.city_messages add column if not exists deleted_at timestamptz;

alter table if exists public.city_messages enable row level security;

drop policy if exists "Allow city message owner update" on public.city_messages;

create policy "Allow city message owner update"
on public.city_messages
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

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

-- Belt-and-suspenders: group_chat_messages already bundles its policy + trigger together in
-- add-message-edit-delete.sql, but re-assert the policy here too so a delete failure can never
-- be blamed on an ambiguous "was this migration run" question again.
drop policy if exists "Group message sender edits or deletes own message" on public.group_chat_messages;
create policy "Group message sender edits or deletes own message"
on public.group_chat_messages for update
to authenticated
using (auth.uid() = sender_id)
with check (auth.uid() = sender_id);

notify pgrst, 'reload schema';
