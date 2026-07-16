-- Repair: public.get_user_group_inbox raised
--   ERROR 42702: column reference "group_id" is ambiguous
--   Details: It could refer to either a PL/pgSQL variable or a table column.
--
-- Cause: this function uses `returns table (group_id uuid, ...)`, which makes
-- PL/pgSQL implicitly declare `group_id` (along with every other output column
-- name) as a variable in the function's namespace. One subquery referenced the
-- unaliased table `public.group_chat_members` and a bare `group_id` column,
-- which collided with that implicit variable. Every other reference in this
-- function was already alias-qualified (gc., gm., lm., gcm., msg.) — this was
-- the only unqualified one.
--
-- Safe to run on its own — this only replaces the one broken function and its
-- grant (both idempotent) and reloads PostgREST's schema cache. It does not
-- touch tables, indexes, triggers, RLS policies, or any other function.

create or replace function public.get_user_group_inbox(p_user_id uuid)
returns table (
  group_id uuid,
  name text,
  photo_url text,
  owner_id uuid,
  role text,
  member_count int,
  last_message text,
  last_message_type text,
  last_sender_id uuid,
  last_message_at timestamptz,
  unread_count int
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is distinct from p_user_id then
    raise exception 'not authorized';
  end if;

  return query
  select
    gc.id as group_id,
    gc.name,
    gc.photo_url,
    gc.owner_id,
    gm.role,
    (select count(*)::int from public.group_chat_members gcm2 where gcm2.group_id = gc.id) as member_count,
    lm.body as last_message,
    lm.message_type as last_message_type,
    lm.sender_id as last_sender_id,
    coalesce(lm.created_at, gc.updated_at, gc.created_at) as last_message_at,
    (
      select count(*)::int from public.group_chat_messages msg
      where msg.group_id = gc.id
        and msg.created_at > coalesce(gm.last_read_at, '1970-01-01'::timestamptz)
        and msg.sender_id <> p_user_id
    ) as unread_count
  from public.group_chat_members gm
  join public.group_chats gc on gc.id = gm.group_id
  left join lateral (
    select gcm.body, gcm.message_type, gcm.sender_id, gcm.created_at
    from public.group_chat_messages gcm
    where gcm.group_id = gc.id
    order by gcm.created_at desc
    limit 1
  ) lm on true
  where gm.user_id = p_user_id
  order by coalesce(lm.created_at, gc.updated_at, gc.created_at) desc;
end;
$$;

grant execute on function public.get_user_group_inbox(uuid) to authenticated;

notify pgrst, 'reload schema';
