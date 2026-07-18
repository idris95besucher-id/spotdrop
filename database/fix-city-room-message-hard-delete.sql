-- Fix: "Delete for everyone" in city/country room chats now calls a real Supabase DELETE
-- (previously a soft delete via `update ... set deleted_at = now()`), but Supabase was
-- rejecting it because there was no RLS policy that permits `delete` on this table at all —
-- the only owner-delete policy that ever existed for city_messages
-- ("Allow city message owner delete") was explicitly DROPPED by add-message-edit-delete.sql
-- when the app switched to the soft-delete convention, and never recreated.
--
-- Table: public.city_messages   (confirmed against database/schema.sql and lib/cityMessageRow.ts)
-- Sender/owner column: user_id  (NOT sender_id / profile_id / author_id — this table was
--   renamed from sender_id -> user_id years ago; see the `do $$ ... rename column sender_id to
--   user_id ...` block in database/schema.sql)
--
-- This one table backs BOTH city rooms and country rooms (app/rooms/[country]/[city]/CityRoomView.tsx
-- and its channels sibling) and the room-list "country" pages are just navigation — there is no
-- separate country_messages table — so this single migration covers both.
--
-- Safe to re-run.

-- 1) Diagnostics — run this first if you want to see whether any existing rows have a null or
--    mismatched owner (those rows can never be deleted by anyone, by design: a null user_id
--    can never equal auth.uid(), so RLS correctly leaves them undeletable rather than guessing).
--    This is a read-only SELECT; it changes nothing.
select
  count(*) as total_rows,
  count(*) filter (where user_id is null) as null_user_id_rows,
  count(*) filter (where map_mark_id is not null) as map_mark_linked_rows
from public.city_messages;

-- 2) RLS: owner-only DELETE policy ------------------------------------------------------------

alter table if exists public.city_messages enable row level security;

drop policy if exists "Allow city message owner delete" on public.city_messages;

create policy "Allow city message owner delete"
on public.city_messages
for delete
to authenticated
using (auth.uid() = user_id);

-- 3) Guard trigger: re-enforces sender-only + the 24-hour delete window at the database level,
--    so a policy misconfiguration alone can never let someone delete another user's message or
--    bypass the window (belt-and-suspenders alongside the RLS policy above). Rows synced from a
--    map_mark are exempt, same as the existing edit/update guard, since those aren't
--    user-authored chat messages in the normal sense.

create or replace function public.city_messages_guard_owner_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.map_mark_id is not null then
    return old;
  end if;

  if auth.uid() is distinct from old.user_id then
    raise exception 'only the sender can delete this message';
  end if;

  if old.created_at < now() - interval '24 hours' then
    raise exception 'delete window has expired';
  end if;

  return old;
end;
$$;

drop trigger if exists city_messages_guard_owner_delete on public.city_messages;
create trigger city_messages_guard_owner_delete
before delete on public.city_messages
for each row
execute function public.city_messages_guard_owner_delete();

notify pgrst, 'reload schema';
