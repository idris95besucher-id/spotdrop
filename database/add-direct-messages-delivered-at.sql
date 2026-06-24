-- Delivery receipts for direct messages (WhatsApp-style ✓ / ✓✓)
-- Run after fix-direct-messages-read-at.sql

alter table public.direct_messages
  add column if not exists delivered_at timestamptz;

comment on column public.direct_messages.delivered_at is
  'When the recipient client received the message (server-side ack from recipient update).';
comment on column public.direct_messages.read_at is
  'When the recipient opened the thread and read the message.';

-- Speed up unread inbox queries: recipient + unread filter
create index if not exists idx_direct_messages_recipient_unread
  on public.direct_messages (recipient_id, sender_id)
  where read_at is null;

-- Speed up delivery backfill per thread
create index if not exists idx_direct_messages_recipient_undelivered
  on public.direct_messages (recipient_id, sender_id)
  where delivered_at is null;

-- Recipient-only updates are already allowed by "Direct messages mark read by recipient" policy.
