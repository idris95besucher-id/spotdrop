-- direct_messages RLS: sender + recipient can read; sender can insert
-- Run in Supabase SQL editor (idempotent)

alter table public.direct_messages enable row level security;

revoke all on table public.direct_messages from public;
revoke all on table public.direct_messages from anon;
grant select, insert, update on table public.direct_messages to authenticated;

drop policy if exists "Direct messages readable by participants" on public.direct_messages;
create policy "Direct messages readable by participants"
on public.direct_messages
for select
to authenticated
using (auth.uid() = sender_id or auth.uid() = recipient_id);

drop policy if exists "Direct messages insert by sender" on public.direct_messages;
create policy "Direct messages insert by sender"
on public.direct_messages
for insert
to authenticated
with check (auth.uid() = sender_id);

-- Remove overly strict legacy policies if present
drop policy if exists "Users can read own sent messages" on public.direct_messages;
drop policy if exists "Users can insert own messages" on public.direct_messages;
drop policy if exists "direct_messages_select" on public.direct_messages;
drop policy if exists "direct_messages_insert" on public.direct_messages;
