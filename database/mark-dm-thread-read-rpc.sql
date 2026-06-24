-- Mark a DM thread read for the authenticated recipient (RLS-safe fallback)
-- Run in Supabase SQL editor after fix-direct-messages-read-at.sql

grant update on table public.direct_messages to authenticated;

drop policy if exists "Direct messages mark read by recipient" on public.direct_messages;
create policy "Direct messages mark read by recipient"
on public.direct_messages
for update
to authenticated
using (auth.uid() = recipient_id)
with check (auth.uid() = recipient_id);

create or replace function public.mark_dm_thread_read(p_sender_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  update public.direct_messages
  set
    read_at = now(),
    delivered_at = coalesce(delivered_at, now())
  where sender_id = p_sender_id
    and recipient_id = auth.uid()
    and read_at is null;

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

revoke all on function public.mark_dm_thread_read(uuid) from public;
grant execute on function public.mark_dm_thread_read(uuid) to authenticated;
