-- Instagram-style inbox: conversations + mutual-friend accepted inserts
-- Run in Supabase SQL editor (idempotent)

-- ---------------------------------------------------------------------------
-- 1. Allow pending OR accepted conversation inserts by participants
-- ---------------------------------------------------------------------------
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

grant select, insert, update on table public.direct_conversations to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Backfill missing conversation rows from direct_messages
-- ---------------------------------------------------------------------------
insert into public.direct_conversations (user_one_id, user_two_id, status, requested_by, created_at, updated_at)
select
  least(d.sender_id, d.recipient_id) as user_one_id,
  greatest(d.sender_id, d.recipient_id) as user_two_id,
  case
    when exists (
      select 1
      from public.follows f1
      join public.follows f2
        on f1.follower_id = f2.following_id
       and f1.following_id = f2.follower_id
      where f1.follower_id = least(d.sender_id, d.recipient_id)
        and f1.following_id = greatest(d.sender_id, d.recipient_id)
    ) then 'accepted'
    else 'pending'
  end as status,
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
group by least(d.sender_id, d.recipient_id), greatest(d.sender_id, d.recipient_id)
on conflict (user_one_id, user_two_id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Promote to accepted where users are mutual friends but row is pending
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 4. Realtime for inbox refresh
-- ---------------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.direct_conversations;
exception
  when duplicate_object then null;
end $$;
