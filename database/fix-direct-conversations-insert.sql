-- Allow creating accepted conversations (e.g. users who already have direct_messages but no row yet)
-- Run in Supabase SQL editor if spot share / DMs fail with "Unable to start conversation."

drop policy if exists "Direct conversations insert by participant" on public.direct_conversations;

create policy "Direct conversations insert by participant"
on public.direct_conversations
for insert
to authenticated
with check (
  auth.uid() in (user_one_id, user_two_id)
  and (
    (status = 'pending' and auth.uid() = requested_by)
    or status = 'accepted'
  )
);
