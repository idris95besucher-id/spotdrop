-- Allow DM recipients to read Spots shared via direct_messages (message_type = 'spot')
-- Run after add-direct-messages-spot-post.sql

drop policy if exists "Allow post read when shared in direct message" on public.posts;

create policy "Allow post read when shared in direct message"
on public.posts
for select
to authenticated
using (
  exists (
    select 1
    from public.direct_messages dm
    where dm.post_id = posts.id
      and dm.message_type = 'spot'
      and dm.recipient_id = auth.uid()
  )
);
