-- Direct message conversations (Instagram-style message requests)

create table if not exists public.direct_conversations (
  id uuid primary key default gen_random_uuid(),
  user_one_id uuid not null references public.profiles(id) on delete cascade,
  user_two_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'blocked')),
  requested_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint direct_conversations_user_order check (user_one_id < user_two_id),
  constraint direct_conversations_distinct_users check (user_one_id <> user_two_id),
  unique (user_one_id, user_two_id)
);

create index if not exists idx_direct_conversations_user_one on public.direct_conversations(user_one_id);
create index if not exists idx_direct_conversations_user_two on public.direct_conversations(user_two_id);
create index if not exists idx_direct_conversations_status on public.direct_conversations(status);
create index if not exists idx_direct_conversations_requested_by on public.direct_conversations(requested_by);

-- Backfill accepted conversations from existing direct messages
insert into public.direct_conversations (user_one_id, user_two_id, status, requested_by, created_at, updated_at)
select
  least(sender_id, recipient_id) as user_one_id,
  greatest(sender_id, recipient_id) as user_two_id,
  'accepted'::text as status,
  (
    select dm.sender_id
    from public.direct_messages dm
    where least(dm.sender_id, dm.recipient_id) = least(d.sender_id, d.recipient_id)
      and greatest(dm.sender_id, dm.recipient_id) = greatest(d.sender_id, d.recipient_id)
    order by dm.created_at asc
    limit 1
  ) as requested_by,
  min(d.created_at) as created_at,
  max(d.created_at) as updated_at
from public.direct_messages d
group by least(sender_id, recipient_id), greatest(sender_id, recipient_id)
on conflict (user_one_id, user_two_id) do nothing;

alter table public.direct_conversations enable row level security;

drop policy if exists "Direct conversations readable by participants" on public.direct_conversations;
create policy "Direct conversations readable by participants"
on public.direct_conversations
for select
using (auth.uid() = user_one_id or auth.uid() = user_two_id);

drop policy if exists "Direct conversations insert by participant" on public.direct_conversations;
create policy "Direct conversations insert by participant"
on public.direct_conversations
for insert
with check (
  auth.uid() in (user_one_id, user_two_id)
  and auth.uid() = requested_by
  and status = 'pending'
);

drop policy if exists "Direct conversations update by participant" on public.direct_conversations;
create policy "Direct conversations update by participant"
on public.direct_conversations
for update
using (auth.uid() = user_one_id or auth.uid() = user_two_id)
with check (auth.uid() = user_one_id or auth.uid() = user_two_id);
