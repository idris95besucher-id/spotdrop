-- RLS + safe read RPC for private_spot_shares (idempotent — safe to re-run)
-- Run after add-private-spot-shares.sql / add-direct-messages-message-type.sql

alter table public.private_spot_shares enable row level security;

revoke all on table public.private_spot_shares from public;
revoke all on table public.private_spot_shares from anon;

grant select, insert, update on table public.private_spot_shares to authenticated;

-- Participants only (sender or recipient)
drop policy if exists "Private spot shares readable by participants" on public.private_spot_shares;
create policy "Private spot shares readable by participants"
on public.private_spot_shares
for select
to authenticated
using (auth.uid() = sender_id or auth.uid() = recipient_id);

-- Only the sender can create a share
drop policy if exists "Private spot shares insert by sender" on public.private_spot_shares;
create policy "Private spot shares insert by sender"
on public.private_spot_shares
for insert
to authenticated
with check (auth.uid() = sender_id);

-- Only the recipient can accept or decline while pending
drop policy if exists "Private spot shares update by recipient" on public.private_spot_shares;
create policy "Private spot shares update by recipient"
on public.private_spot_shares
for update
to authenticated
using (auth.uid() = recipient_id and status = 'pending')
with check (auth.uid() = recipient_id and status in ('accepted', 'declined'));

-- No delete policy: deletes are denied by default when RLS is enabled

-- Safe fetch: recipient cannot read coordinates until accepted
create or replace function public.fetch_private_spot_share(p_share_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.private_spot_shares%rowtype;
begin
  if v_uid is null then
    return null;
  end if;

  select * into v_row
  from public.private_spot_shares
  where id = p_share_id;

  if not found then
    return null;
  end if;

  if v_row.sender_id <> v_uid and v_row.recipient_id <> v_uid then
    return null;
  end if;

  if v_row.recipient_id = v_uid and v_row.status = 'pending' then
    return jsonb_build_object(
      'id', v_row.id,
      'sender_id', v_row.sender_id,
      'recipient_id', v_row.recipient_id,
      'status', v_row.status,
      'accepted_at', v_row.accepted_at,
      'created_at', v_row.created_at
    );
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'sender_id', v_row.sender_id,
    'recipient_id', v_row.recipient_id,
    'sender_latitude', v_row.sender_latitude,
    'sender_longitude', v_row.sender_longitude,
    'sender_address', v_row.sender_address,
    'status', v_row.status,
    'accepted_at', v_row.accepted_at,
    'created_at', v_row.created_at
  );
end;
$$;

revoke all on function public.fetch_private_spot_share(uuid) from public;
grant execute on function public.fetch_private_spot_share(uuid) to authenticated;
