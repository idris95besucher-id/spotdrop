-- Consolidated fix for the missing direct_conversations table (Instagram-style DM message
-- requests: pending/accepted/declined/blocked between two users).
--
-- Root cause of the "Failed to load resource: 404 (direct_conversations)" console errors: this
-- table was never created on this Supabase project. It only ever existed as a standalone
-- migration (add-direct-conversations.sql), later patched by fix-direct-conversations-insert.sql
-- and fix-chats-inbox-conversations.sql — none of which are in database/schema.sql. The app code
-- (lib/directConversations.ts) already tolerates the table being missing and falls back to
-- "legacy" mode (every DM allowed, no request gating), so this isn't crashing anything — it's
-- just silently disabling the message-request feature.
--
-- This file folds all three migrations into their final, correct end state. Safe to run once in
-- the Supabase SQL Editor regardless of which (if any) of the three older files already ran.

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

alter table public.direct_conversations enable row level security;

drop policy if exists "Direct conversations readable by participants" on public.direct_conversations;
create policy "Direct conversations readable by participants"
on public.direct_conversations
for select
using (auth.uid() = user_one_id or auth.uid() = user_two_id);

-- Final version of the insert policy (supersedes add-direct-conversations.sql and
-- fix-direct-conversations-insert.sql): allows a participant to create either a pending request
-- they're the requester of, or an accepted conversation they're the requester of (e.g. two users
-- who are already mutual friends skip the request step entirely).
drop policy if exists "Direct conversations insert by participant" on public.direct_conversations;
create policy "Direct conversations insert by participant"
on public.direct_conversations
for insert
to authenticated
with check (
  auth.uid() in (user_one_id, user_two_id)
  and (
    (status = 'pending' and auth.uid() = requested_by)
    or (status = 'accepted' and auth.uid() = requested_by)
  )
);

drop policy if exists "Direct conversations update by participant" on public.direct_conversations;
create policy "Direct conversations update by participant"
on public.direct_conversations
for update
using (auth.uid() = user_one_id or auth.uid() = user_two_id)
with check (auth.uid() = user_one_id or auth.uid() = user_two_id);

grant select, insert, update on table public.direct_conversations to authenticated;

-- Backfill conversation rows for existing direct_messages that predate this table — friend pairs
-- backfill as already-accepted, everyone else as pending (requested_by = whoever sent first).
--
-- Restructured as CTEs instead of correlated subqueries inside a single GROUP BY query: Postgres's
-- grouping-validity check is purely syntactic, so a subquery that reaches back into an outer
-- query's raw column (d.sender_id / d.recipient_id) is rejected as an "ungrouped column" even when
-- it's wrapped in the exact same least()/greatest() expression the outer query groups by — it only
-- recognizes the literal grouped expression, not a subquery re-deriving it from the raw column
-- (error 42803). Each step below groups by already-materialized plain columns instead, so no
-- subquery ever needs to reference a raw pre-aggregation column again.
with pair_messages as (
  select
    least(sender_id, recipient_id) as user_one_id,
    greatest(sender_id, recipient_id) as user_two_id,
    sender_id,
    created_at
  from public.direct_messages
),
pair_bounds as (
  select
    user_one_id,
    user_two_id,
    min(created_at) as created_at,
    max(created_at) as updated_at
  from pair_messages
  group by user_one_id, user_two_id
),
first_message as (
  select distinct on (user_one_id, user_two_id)
    user_one_id,
    user_two_id,
    sender_id as requested_by
  from pair_messages
  order by user_one_id, user_two_id, created_at asc
)
insert into public.direct_conversations (user_one_id, user_two_id, status, requested_by, created_at, updated_at)
select
  b.user_one_id,
  b.user_two_id,
  case
    when exists (
      select 1
      from public.follows f1
      join public.follows f2
        on f1.follower_id = f2.following_id
       and f1.following_id = f2.follower_id
      where f1.follower_id = b.user_one_id
        and f1.following_id = b.user_two_id
    ) then 'accepted'
    else 'pending'
  end as status,
  fm.requested_by,
  b.created_at,
  b.updated_at
from pair_bounds b
join first_message fm
  on fm.user_one_id = b.user_one_id and fm.user_two_id = b.user_two_id
on conflict (user_one_id, user_two_id) do nothing;

-- Promote any already-backfilled pending row to accepted if the pair turned out to be mutual
-- friends (covers rows inserted by an earlier, non-friend-aware run of this backfill).
update public.direct_conversations dc
set status = 'accepted', updated_at = now()
where dc.status = 'pending'
  and exists (
    select 1
    from public.follows f1
    join public.follows f2
      on f1.follower_id = f2.following_id
     and f1.following_id = f2.follower_id
    where f1.follower_id = dc.user_one_id
      and f1.following_id = dc.user_two_id
  );

-- Realtime for inbox refresh.
do $$
begin
  alter publication supabase_realtime add table public.direct_conversations;
exception
  when duplicate_object then null;
end $$;

-- Force PostgREST to pick up the new table immediately instead of waiting for its own schema
-- cache TTL — without this, the 404s can persist for a few minutes even after the table exists.
notify pgrst, 'reload schema';
