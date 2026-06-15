-- Private spot sharing in direct messages (run after add-direct-conversations.sql)

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

create index if not exists idx_private_spot_shares_recipient_status
  on public.private_spot_shares(recipient_id, status, created_at desc);

create index if not exists idx_private_spot_shares_sender
  on public.private_spot_shares(sender_id, created_at desc);

alter table public.direct_messages
  add column if not exists message_type text not null default 'text';

alter table public.direct_messages
  add column if not exists spot_share_id uuid references public.private_spot_shares(id) on delete set null;

alter table public.direct_messages drop constraint if exists direct_messages_message_type_check;
alter table public.direct_messages
  add constraint direct_messages_message_type_check
  check (message_type in ('text', 'spot_share_request', 'spot_share_accepted'));

alter table public.direct_messages drop constraint if exists direct_messages_body_check;
alter table public.direct_messages
  alter column body drop not null;

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

alter table public.private_spot_shares enable row level security;

drop policy if exists "Private spot shares readable by participants" on public.private_spot_shares;
create policy "Private spot shares readable by participants"
on public.private_spot_shares
for select
using (auth.uid() = sender_id or auth.uid() = recipient_id);

drop policy if exists "Private spot shares insert by sender" on public.private_spot_shares;
create policy "Private spot shares insert by sender"
on public.private_spot_shares
for insert
with check (auth.uid() = sender_id);

drop policy if exists "Private spot shares update by recipient" on public.private_spot_shares;
create policy "Private spot shares update by recipient"
on public.private_spot_shares
for update
using (auth.uid() = recipient_id and status = 'pending')
with check (auth.uid() = recipient_id and status in ('accepted', 'declined'));

-- Safe fetch: hides coordinates from recipient until accepted
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
