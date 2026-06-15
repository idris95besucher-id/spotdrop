-- direct_messages.message_type + spot share columns (run in Supabase SQL editor)
--
-- Current baseline (typical production):
--   id, sender_id, recipient_id, body (not null), created_at, read_at
--
-- This migration adds message_type, optional spot_share_id, and relaxed body rules
-- for spot_share_request / spot_share_accepted messages.

-- ---------------------------------------------------------------------------
-- 1. message_type
-- ---------------------------------------------------------------------------
alter table public.direct_messages
  add column if not exists message_type text;

update public.direct_messages
set message_type = 'text'
where message_type is null;

alter table public.direct_messages
  alter column message_type set default 'text';

alter table public.direct_messages
  alter column message_type set not null;

alter table public.direct_messages drop constraint if exists direct_messages_message_type_check;

alter table public.direct_messages
  add constraint direct_messages_message_type_check
  check (message_type in ('text', 'spot_share_request', 'spot_share_accepted'));

-- ---------------------------------------------------------------------------
-- 2. spot_share_id (requires private_spot_shares — run add-private-spot-shares.sql first)
-- ---------------------------------------------------------------------------
create table if not exists public.private_spot_shares (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  sender_latitude double precision not null,
  sender_longitude double precision not null,
  sender_address text,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined')),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint private_spot_shares_distinct_users check (sender_id <> recipient_id)
);

alter table public.direct_messages
  add column if not exists spot_share_id uuid references public.private_spot_shares(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 3. body rules: text messages need body; spot share messages use spot_share_id
-- ---------------------------------------------------------------------------
alter table public.direct_messages
  alter column body drop not null;

alter table public.direct_messages drop constraint if exists direct_messages_body_check;

alter table public.direct_messages
  add constraint direct_messages_body_check
  check (
    (
      message_type = 'text'
      and body is not null
      and btrim(body) <> ''
      and spot_share_id is null
    )
    or (
      message_type in ('spot_share_request', 'spot_share_accepted')
      and spot_share_id is not null
    )
  );
