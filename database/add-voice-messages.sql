-- Voice messages for DM, group chats, and City Rooms.
--
-- Design: reuses each table's existing text/content column with a fallback caption
-- ("🎤 Voice message") rather than adding a new message_type value — this avoids touching
-- direct_messages' intricate per-type body CHECK constraint (direct_messages_body_check)
-- and group_chat_messages' message_type CHECK (`in ('text','system')`), both of which would
-- otherwise need careful, riskier rewrites. Voice payload itself lives in two new nullable
-- columns (audio_url, audio_duration_seconds) added to all three message tables; the client
-- detects a voice message by audio_url being non-null, checked before any existing
-- message_type/marker-content sniffing. All three tables are already realtime-enabled
-- (enable-direct-messages-realtime.sql / add-group-chats.sql / enable-city-messages-realtime.sql)
-- with replica identity full, so a new column requires no realtime migration.
--
-- Safe to re-run.

-- 1) Columns ------------------------------------------------------------------

-- audio_waveform stores ~40 normalized (0-1) amplitude samples captured live during
-- recording, so the playback bar reflects the real recording rather than a fake pattern.
alter table public.direct_messages add column if not exists audio_url text;
alter table public.direct_messages add column if not exists audio_duration_seconds numeric;
alter table public.direct_messages add column if not exists audio_waveform jsonb;

alter table public.group_chat_messages add column if not exists audio_url text;
alter table public.group_chat_messages add column if not exists audio_duration_seconds numeric;
alter table public.group_chat_messages add column if not exists audio_waveform jsonb;

alter table public.city_messages add column if not exists audio_url text;
alter table public.city_messages add column if not exists audio_duration_seconds numeric;
alter table public.city_messages add column if not exists audio_waveform jsonb;

-- 2) Re-harden direct_messages recipient-update guard to cover the new columns ------------
-- (direct_messages_guard_recipient_update already blocks recipients from rewriting
-- body/message_type/post_id/spot_share_id/sender_id/recipient_id — it's a blocklist, so a
-- newly added column is allowed through by default unless explicitly added here.)

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
  then
    raise exception 'recipients may only update read/delivery timestamps';
  end if;

  return new;
end;
$$;

-- Trigger already exists (harden-direct-messages-read-update.sql) — CREATE OR REPLACE above
-- is enough to update its body; re-creating the trigger itself is not required, but doing it
-- idempotently anyway costs nothing and guards against drift.
drop trigger if exists direct_messages_guard_recipient_update on public.direct_messages;
create trigger direct_messages_guard_recipient_update
before update on public.direct_messages
for each row
execute function public.direct_messages_guard_recipient_update();

-- 3) Storage bucket for voice message audio files -------------------------------

insert into storage.buckets (id, name, public)
values ('chat-audio', 'chat-audio', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Chat audio public read" on storage.objects;
create policy "Chat audio public read" on storage.objects for select
using (bucket_id = 'chat-audio');

drop policy if exists "Chat audio owner upload" on storage.objects;
create policy "Chat audio owner upload" on storage.objects for insert to authenticated
with check (
  bucket_id = 'chat-audio'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "Chat audio owner update" on storage.objects;
create policy "Chat audio owner update" on storage.objects for update to authenticated
using (
  bucket_id = 'chat-audio'
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'chat-audio'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "Chat audio owner delete" on storage.objects;
create policy "Chat audio owner delete" on storage.objects for delete to authenticated
using (
  bucket_id = 'chat-audio'
  and auth.uid()::text = (storage.foldername(name))[1]
);

notify pgrst, 'reload schema';
