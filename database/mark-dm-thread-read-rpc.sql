-- Mark a DM thread read for the authenticated recipient (RLS-safe).
-- Prefer the full fix + backfill in: database/fix-dm-unread-read-model.sql

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
  uid uuid := auth.uid();
  updated_count integer;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  if p_sender_id is null or p_sender_id = uid then
    return 0;
  end if;

  update public.direct_messages
  set
    read_at = coalesce(read_at, now()),
    delivered_at = coalesce(delivered_at, now())
  where sender_id = p_sender_id
    and recipient_id = uid
    and read_at is null;

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

revoke all on function public.mark_dm_thread_read(uuid) from public;
grant execute on function public.mark_dm_thread_read(uuid) to authenticated;
