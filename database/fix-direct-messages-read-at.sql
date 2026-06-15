-- Allow recipients to mark incoming messages read (read_at)
-- Run after fix-direct-messages-rls.sql

grant update on table public.direct_messages to authenticated;

drop policy if exists "Direct messages mark read by recipient" on public.direct_messages;
create policy "Direct messages mark read by recipient"
on public.direct_messages
for update
to authenticated
using (auth.uid() = recipient_id)
with check (auth.uid() = recipient_id);

do $$
begin
  alter publication supabase_realtime add table public.direct_messages;
exception
  when duplicate_object then null;
end $$;
