-- =============================================================================
-- Fix DM unread/read model (read_at persistence + clean baseline)
-- =============================================================================
-- Root issue:
--   harden-direct-messages-read-update.sql removed the recipient UPDATE policy.
--   Mark-read depends on public.mark_dm_thread_read. If that RPC is missing,
--   not SECURITY DEFINER, or updates 0 rows, clients still clear badges
--   optimistically while historical direct_messages.read_at stays NULL.
--   The next unread recount (or push badge) then returns the full historical
--   unread pile (e.g. 78) + 1 new message = 79.
--
-- This migration:
--   1) Recreates mark_dm_thread_read as SECURITY DEFINER (auth.uid() recipient)
--   2) Adds mark_dm_thread_delivered for delivery acks (same model)
--   3) Restores a narrow recipient UPDATE policy (trigger still guards columns)
--   4) Backfills historical unread incoming messages to establish a clean baseline
--      WITHOUT deleting any messages
--
-- Run in Supabase SQL Editor (Production), then verify with
-- database/verify-dm-unread-model.sql
-- =============================================================================

-- Ensure delivery column exists (older DBs).
alter table public.direct_messages
  add column if not exists delivered_at timestamptz;

create index if not exists idx_direct_messages_recipient_unread
  on public.direct_messages (recipient_id, sender_id)
  where read_at is null;

-- -----------------------------------------------------------------------------
-- Mark all unread incoming messages from a sender as read for auth.uid()
-- -----------------------------------------------------------------------------
create or replace function public.mark_dm_thread_read(p_sender_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  updated_count integer;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  if p_sender_id is null or p_sender_id = uid then
    return 0;
  end if;

  update public.direct_messages
  set
    read_at = coalesce(read_at, now()),
    delivered_at = coalesce(delivered_at, now())
  where sender_id = p_sender_id
    and recipient_id = uid
    and read_at is null;

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

revoke all on function public.mark_dm_thread_read(uuid) from public;
grant execute on function public.mark_dm_thread_read(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Mark incoming messages delivered (device ack) without marking read
-- -----------------------------------------------------------------------------
create or replace function public.mark_dm_thread_delivered(p_sender_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  updated_count integer;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  if p_sender_id is null or p_sender_id = uid then
    return 0;
  end if;

  update public.direct_messages
  set delivered_at = coalesce(delivered_at, now())
  where sender_id = p_sender_id
    and recipient_id = uid
    and delivered_at is null;

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

revoke all on function public.mark_dm_thread_delivered(uuid) from public;
grant execute on function public.mark_dm_thread_delivered(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Narrow recipient UPDATE policy (fallback). Guard trigger still blocks content edits.
-- -----------------------------------------------------------------------------
grant select, insert, update on table public.direct_messages to authenticated;

drop policy if exists "Direct messages mark read by recipient" on public.direct_messages;
create policy "Direct messages mark read by recipient"
on public.direct_messages
for update
to authenticated
using (auth.uid() = recipient_id)
with check (auth.uid() = recipient_id);

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
    or new.created_at is distinct from old.created_at
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

-- -----------------------------------------------------------------------------
-- One-time safe backfill: establish a clean read baseline for historical unread
-- -----------------------------------------------------------------------------
-- Marks currently-unread incoming DMs as read using their created_at timestamp.
-- Does NOT delete messages. Leaves a short grace window so an in-flight new
-- message is not accidentally marked read by this migration.
update public.direct_messages
set
  read_at = coalesce(read_at, created_at),
  delivered_at = coalesce(delivered_at, created_at)
where read_at is null
  and created_at < (now() - interval '2 minutes');
