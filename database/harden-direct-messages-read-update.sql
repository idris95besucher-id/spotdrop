-- Harden DM recipient updates: recipients must not be able to rewrite message body/type.
-- Mark-read goes through security-definer RPC only.
-- Run in Supabase SQL editor after mark-dm-thread-read-rpc.sql

drop policy if exists "Direct messages mark read by recipient" on public.direct_messages;

-- Recipients no longer get a blanket UPDATE policy.
-- Keep EXECUTE on mark_dm_thread_read for authenticated users.
revoke all on function public.mark_dm_thread_read(uuid) from public;
grant execute on function public.mark_dm_thread_read(uuid) to authenticated;

-- Optional: block direct table updates that change content columns even if a
-- future policy is added. Only allow read_at / delivered_at changes on UPDATE.
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
