-- Instagram-style group chats: group_chats, group_chat_members, group_chat_messages.
--
-- Design notes (why this is separate from direct_messages):
--   - direct_messages / direct_conversations model exactly 2 participants with a
--     "message request" accept/decline state machine. Group chats have N members,
--     per-member roles (owner/moderator/member), and no request flow — members are
--     added directly, matching Instagram/WhatsApp groups. Forcing that into the
--     2-party direct_conversations schema would require nullable "third+ party"
--     columns or a parallel junction table anyway, so a dedicated schema is safer
--     and keeps existing DM code completely untouched.
--   - All membership/role mutations (create, add/remove member, promote/demote,
--     transfer ownership, delete group) go through SECURITY DEFINER RPC functions
--     that explicitly check the caller's role. Direct client INSERT/UPDATE/DELETE
--     on group_chats and group_chat_members is not granted at all — this means the
--     rules are enforced in the database, not just in the UI, and can't be bypassed
--     by calling the REST API directly.
--   - group_chat_messages allows direct client INSERT/SELECT (member-only, via RLS)
--     for low-latency realtime sends — mirrors how direct_messages/city_messages
--     already work in this codebase.
--   - Order: 1) tables  2) indexes  3) helper functions  4) triggers  5) RLS
--     6) RPC functions  7) grants  8) realtime  9) storage bucket + policies.

-- 1. Tables ------------------------------------------------------------------

create table if not exists public.group_chats (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  photo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create table if not exists public.group_chat_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.group_chats(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'moderator', 'member')),
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  unique (group_id, user_id)
);

create table if not exists public.group_chat_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.group_chats(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  message_type text not null default 'text' check (message_type in ('text', 'system')),
  body text,
  post_id bigint references public.posts(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 2. Indexes ------------------------------------------------------------------

create index if not exists idx_group_chat_members_user on public.group_chat_members(user_id);
create index if not exists idx_group_chat_members_group on public.group_chat_members(group_id);
create index if not exists idx_group_chat_messages_group_created on public.group_chat_messages(group_id, created_at asc);
create index if not exists idx_group_chats_last_message_at on public.group_chats(last_message_at desc);

-- 3. Helper functions (security definer — bypass RLS for safe internal checks) --

create or replace function public.is_group_chat_member(p_group_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_chat_members
    where group_id = p_group_id and user_id = p_user_id
  );
$$;

create or replace function public.group_chat_member_role(p_group_id uuid, p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.group_chat_members
  where group_id = p_group_id and user_id = p_user_id;
$$;

create or replace function public.is_group_chat_moderator_or_owner(p_group_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_chat_members
    where group_id = p_group_id and user_id = p_user_id and role in ('owner', 'moderator')
  );
$$;

create or replace function public.is_group_chat_owner(p_group_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_chats where id = p_group_id and owner_id = p_user_id
  );
$$;

/** Encodes a compact JSON payload into group_chat_messages.body for system rows. */
create or replace function public.build_group_system_event(
  p_event text,
  p_actor uuid,
  p_targets uuid[] default null,
  p_extra jsonb default '{}'::jsonb
)
returns text
language sql
immutable
as $$
  select 'SPOTDROP_GROUP_EVENT_V1::' || (
    jsonb_build_object(
      'event', p_event,
      'actorId', p_actor,
      'targetIds', coalesce(p_targets, '{}'::uuid[])
    ) || coalesce(p_extra, '{}'::jsonb)
  )::text;
$$;

-- 4. Triggers ------------------------------------------------------------------

create or replace function public.touch_group_chats_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_group_chats_updated_at on public.group_chats;
create trigger trg_group_chats_updated_at
before update on public.group_chats
for each row execute function public.touch_group_chats_updated_at();

/** Every new message bumps last_message_at so the inbox sorts correctly. */
create or replace function public.touch_group_chat_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.group_chats
  set last_message_at = new.created_at, updated_at = now()
  where id = new.group_id;

  return new;
end;
$$;

drop trigger if exists trg_group_chat_messages_touch on public.group_chat_messages;
create trigger trg_group_chat_messages_touch
after insert on public.group_chat_messages
for each row execute function public.touch_group_chat_on_message();

/** Members may only ever update their own last_read_at — never role/group/user. */
create or replace function public.group_chat_members_guard_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role
    or new.group_id is distinct from old.group_id
    or new.user_id is distinct from old.user_id
    or new.joined_at is distinct from old.joined_at
  then
    raise exception 'members may only update their own last_read_at';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_group_chat_members_guard_update on public.group_chat_members;
create trigger trg_group_chat_members_guard_update
before update on public.group_chat_members
for each row execute function public.group_chat_members_guard_self_update();

-- 5. Row level security ---------------------------------------------------------

alter table public.group_chats enable row level security;
alter table public.group_chat_members enable row level security;
alter table public.group_chat_messages enable row level security;

revoke all on table public.group_chats from public, anon;
revoke all on table public.group_chat_members from public, anon;
revoke all on table public.group_chat_messages from public, anon;

-- group_chats: read-only for clients — every write goes through an RPC below.
drop policy if exists "Group chats readable by members" on public.group_chats;
create policy "Group chats readable by members"
on public.group_chats for select to authenticated
using (public.is_group_chat_member(id, auth.uid()));

-- group_chat_members: read-only for clients except each member's own last_read_at.
--
-- Two SELECT policies (OR'd): the direct "own row" comparison is required so that
-- Realtime can authorize the DELETE event for a member who was just removed — by
-- the time Realtime checks, the is_group_chat_member() subquery would already
-- evaluate false for that user (their row is gone), which would silently drop the
-- very notification a removed/leaving member needs to lose access immediately.
drop policy if exists "Group members read own row" on public.group_chat_members;
create policy "Group members read own row"
on public.group_chat_members for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "Group members readable by members" on public.group_chat_members;
create policy "Group members readable by members"
on public.group_chat_members for select to authenticated
using (public.is_group_chat_member(group_id, auth.uid()));

drop policy if exists "Group members update own membership" on public.group_chat_members;
create policy "Group members update own membership"
on public.group_chat_members for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- group_chat_messages: any member can read/send; no update/delete in this version.
drop policy if exists "Group messages readable by members" on public.group_chat_messages;
create policy "Group messages readable by members"
on public.group_chat_messages for select to authenticated
using (public.is_group_chat_member(group_id, auth.uid()));

drop policy if exists "Group messages insert by member" on public.group_chat_messages;
create policy "Group messages insert by member"
on public.group_chat_messages for insert to authenticated
with check (auth.uid() = sender_id and public.is_group_chat_member(group_id, auth.uid()));

-- 6. RPC functions (the only write path for group_chats / group_chat_members) ----

create or replace function public.create_group_chat(
  p_name text,
  p_photo_url text,
  p_member_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_group_id uuid;
  v_name text := trim(coalesce(p_name, ''));
  v_member_id uuid;
  v_distinct_members uuid[];
begin
  if v_owner is null then
    raise exception 'not authenticated';
  end if;

  if v_name = '' then
    raise exception 'group name is required';
  end if;

  if length(v_name) > 80 then
    raise exception 'group name is too long';
  end if;

  select array_agg(distinct member_id) into v_distinct_members
  from unnest(p_member_ids) as member_id
  where member_id is not null and member_id <> v_owner;

  if v_distinct_members is null or array_length(v_distinct_members, 1) is null then
    raise exception 'a group requires at least one other member';
  end if;

  if (select count(*) from public.profiles where id = any(v_distinct_members))
      <> array_length(v_distinct_members, 1) then
    raise exception 'one or more invited users could not be found';
  end if;

  insert into public.group_chats (owner_id, created_by, name, photo_url)
  values (v_owner, v_owner, v_name, p_photo_url)
  returning id into v_group_id;

  insert into public.group_chat_members (group_id, user_id, role, last_read_at)
  values (v_group_id, v_owner, 'owner', now());

  foreach v_member_id in array v_distinct_members loop
    insert into public.group_chat_members (group_id, user_id, role)
    values (v_group_id, v_member_id, 'member')
    on conflict (group_id, user_id) do nothing;
  end loop;

  insert into public.group_chat_messages (group_id, sender_id, message_type, body)
  values (v_group_id, v_owner, 'system', public.build_group_system_event('created', v_owner));

  return v_group_id;
end;
$$;

create or replace function public.add_group_members(p_group_id uuid, p_member_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_member_id uuid;
  v_distinct uuid[];
begin
  if v_actor is null then
    raise exception 'not authenticated';
  end if;

  if not public.is_group_chat_moderator_or_owner(p_group_id, v_actor) then
    raise exception 'only the owner or a moderator can add members';
  end if;

  select array_agg(distinct member_id) into v_distinct
  from unnest(p_member_ids) as member_id
  where member_id is not null;

  if v_distinct is null then
    return;
  end if;

  foreach v_member_id in array v_distinct loop
    insert into public.group_chat_members (group_id, user_id, role)
    values (p_group_id, v_member_id, 'member')
    on conflict (group_id, user_id) do nothing;
  end loop;

  insert into public.group_chat_messages (group_id, sender_id, message_type, body)
  values (p_group_id, v_actor, 'system', public.build_group_system_event('added', v_actor, v_distinct));
end;
$$;

create or replace function public.remove_group_member(p_group_id uuid, p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_target_role text;
begin
  if v_actor is null then
    raise exception 'not authenticated';
  end if;

  v_actor_role := public.group_chat_member_role(p_group_id, v_actor);
  v_target_role := public.group_chat_member_role(p_group_id, p_member_id);

  if v_actor_role is null or v_actor_role not in ('owner', 'moderator') then
    raise exception 'only the owner or a moderator can remove members';
  end if;

  if v_target_role is null then
    raise exception 'user is not a member of this group';
  end if;

  if v_target_role = 'owner' then
    raise exception 'the owner cannot be removed';
  end if;

  if v_target_role = 'moderator' and v_actor_role <> 'owner' then
    raise exception 'only the owner can remove a moderator';
  end if;

  delete from public.group_chat_members where group_id = p_group_id and user_id = p_member_id;

  insert into public.group_chat_messages (group_id, sender_id, message_type, body)
  values (p_group_id, v_actor, 'system', public.build_group_system_event('removed', v_actor, array[p_member_id]));
end;
$$;

create or replace function public.leave_group_chat(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_member_count int;
  v_next_owner uuid;
begin
  if v_actor is null then
    raise exception 'not authenticated';
  end if;

  v_role := public.group_chat_member_role(p_group_id, v_actor);

  if v_role is null then
    raise exception 'you are not a member of this group';
  end if;

  select count(*) into v_member_count from public.group_chat_members where group_id = p_group_id;

  if v_role = 'owner' and v_member_count > 1 then
    select user_id into v_next_owner
    from public.group_chat_members
    where group_id = p_group_id and user_id <> v_actor
    order by (role = 'moderator') desc, joined_at asc
    limit 1;

    update public.group_chat_members set role = 'owner'
    where group_id = p_group_id and user_id = v_next_owner;

    update public.group_chats set owner_id = v_next_owner where id = p_group_id;

    insert into public.group_chat_messages (group_id, sender_id, message_type, body)
    values (
      p_group_id, v_actor, 'system',
      public.build_group_system_event('transferred', v_actor, array[v_next_owner])
    );
  end if;

  delete from public.group_chat_members where group_id = p_group_id and user_id = v_actor;

  if v_member_count <= 1 then
    delete from public.group_chats where id = p_group_id;
    return;
  end if;

  insert into public.group_chat_messages (group_id, sender_id, message_type, body)
  values (p_group_id, v_actor, 'system', public.build_group_system_event('left', v_actor));
end;
$$;

create or replace function public.promote_group_moderator(p_group_id uuid, p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'not authenticated';
  end if;

  if not public.is_group_chat_owner(p_group_id, v_actor) then
    raise exception 'only the owner can promote a moderator';
  end if;

  if public.group_chat_member_role(p_group_id, p_member_id) is distinct from 'member' then
    raise exception 'user must be a current member to be promoted';
  end if;

  update public.group_chat_members set role = 'moderator'
  where group_id = p_group_id and user_id = p_member_id;

  insert into public.group_chat_messages (group_id, sender_id, message_type, body)
  values (p_group_id, v_actor, 'system', public.build_group_system_event('promoted', v_actor, array[p_member_id]));
end;
$$;

create or replace function public.demote_group_moderator(p_group_id uuid, p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'not authenticated';
  end if;

  if not public.is_group_chat_owner(p_group_id, v_actor) then
    raise exception 'only the owner can demote a moderator';
  end if;

  if public.group_chat_member_role(p_group_id, p_member_id) is distinct from 'moderator' then
    raise exception 'user is not a moderator';
  end if;

  update public.group_chat_members set role = 'member'
  where group_id = p_group_id and user_id = p_member_id;

  insert into public.group_chat_messages (group_id, sender_id, message_type, body)
  values (p_group_id, v_actor, 'system', public.build_group_system_event('demoted', v_actor, array[p_member_id]));
end;
$$;

create or replace function public.transfer_group_ownership(p_group_id uuid, p_new_owner_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'not authenticated';
  end if;

  if not public.is_group_chat_owner(p_group_id, v_actor) then
    raise exception 'only the owner can transfer ownership';
  end if;

  if v_actor = p_new_owner_id then
    raise exception 'you are already the owner';
  end if;

  if public.group_chat_member_role(p_group_id, p_new_owner_id) is null then
    raise exception 'the new owner must be a current member';
  end if;

  update public.group_chat_members set role = 'moderator'
  where group_id = p_group_id and user_id = v_actor;

  update public.group_chat_members set role = 'owner'
  where group_id = p_group_id and user_id = p_new_owner_id;

  update public.group_chats set owner_id = p_new_owner_id where id = p_group_id;

  insert into public.group_chat_messages (group_id, sender_id, message_type, body)
  values (
    p_group_id, v_actor, 'system',
    public.build_group_system_event('transferred', v_actor, array[p_new_owner_id])
  );
end;
$$;

create or replace function public.delete_group_chat(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'not authenticated';
  end if;

  if not public.is_group_chat_owner(p_group_id, v_actor) then
    raise exception 'only the owner can delete the group';
  end if;

  delete from public.group_chats where id = p_group_id;
end;
$$;

create or replace function public.rename_group_chat(p_group_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_name text := trim(coalesce(p_name, ''));
begin
  if v_actor is null then
    raise exception 'not authenticated';
  end if;

  if v_name = '' then
    raise exception 'group name is required';
  end if;

  if length(v_name) > 80 then
    raise exception 'group name is too long';
  end if;

  if not public.is_group_chat_moderator_or_owner(p_group_id, v_actor) then
    raise exception 'only the owner or a moderator can rename the group';
  end if;

  update public.group_chats set name = v_name where id = p_group_id;

  insert into public.group_chat_messages (group_id, sender_id, message_type, body)
  values (
    p_group_id, v_actor, 'system',
    public.build_group_system_event('renamed', v_actor, null, jsonb_build_object('name', v_name))
  );
end;
$$;

create or replace function public.update_group_photo(p_group_id uuid, p_photo_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'not authenticated';
  end if;

  if not public.is_group_chat_moderator_or_owner(p_group_id, v_actor) then
    raise exception 'only the owner or a moderator can change the group photo';
  end if;

  update public.group_chats set photo_url = p_photo_url where id = p_group_id;

  insert into public.group_chat_messages (group_id, sender_id, message_type, body)
  values (p_group_id, v_actor, 'system', public.build_group_system_event('photo_changed', v_actor));
end;
$$;

/** Inbox RPC — one row per group the caller belongs to, with unread count + role. */
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

-- 7. Grants ------------------------------------------------------------------

grant select on table public.group_chats to authenticated;
grant select, update on table public.group_chat_members to authenticated;
grant select, insert on table public.group_chat_messages to authenticated;

grant execute on function public.is_group_chat_member(uuid, uuid) to authenticated;
grant execute on function public.group_chat_member_role(uuid, uuid) to authenticated;
grant execute on function public.is_group_chat_moderator_or_owner(uuid, uuid) to authenticated;
grant execute on function public.is_group_chat_owner(uuid, uuid) to authenticated;
grant execute on function public.create_group_chat(text, text, uuid[]) to authenticated;
grant execute on function public.add_group_members(uuid, uuid[]) to authenticated;
grant execute on function public.remove_group_member(uuid, uuid) to authenticated;
grant execute on function public.leave_group_chat(uuid) to authenticated;
grant execute on function public.promote_group_moderator(uuid, uuid) to authenticated;
grant execute on function public.demote_group_moderator(uuid, uuid) to authenticated;
grant execute on function public.transfer_group_ownership(uuid, uuid) to authenticated;
grant execute on function public.delete_group_chat(uuid) to authenticated;
grant execute on function public.rename_group_chat(uuid, text) to authenticated;
grant execute on function public.update_group_photo(uuid, text) to authenticated;
grant execute on function public.get_user_group_inbox(uuid) to authenticated;

-- 8. Realtime ------------------------------------------------------------------

alter table public.group_chats replica identity full;
alter table public.group_chat_members replica identity full;
alter table public.group_chat_messages replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.group_chats;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.group_chat_members;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.group_chat_messages;
exception
  when duplicate_object then null;
end $$;

-- 9. Storage bucket for group photos --------------------------------------------

insert into storage.buckets (id, name, public)
values ('group-chat-photos', 'group-chat-photos', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Group photos public read" on storage.objects;
create policy "Group photos public read" on storage.objects for select
using (bucket_id = 'group-chat-photos');

drop policy if exists "Group photos member upload" on storage.objects;
create policy "Group photos member upload" on storage.objects for insert to authenticated
with check (
  bucket_id = 'group-chat-photos'
  and public.is_group_chat_member((storage.foldername(name))[1]::uuid, auth.uid())
);

drop policy if exists "Group photos member update" on storage.objects;
create policy "Group photos member update" on storage.objects for update to authenticated
using (
  bucket_id = 'group-chat-photos'
  and public.is_group_chat_member((storage.foldername(name))[1]::uuid, auth.uid())
)
with check (
  bucket_id = 'group-chat-photos'
  and public.is_group_chat_member((storage.foldername(name))[1]::uuid, auth.uid())
);

drop policy if exists "Group photos member delete" on storage.objects;
create policy "Group photos member delete" on storage.objects for delete to authenticated
using (
  bucket_id = 'group-chat-photos'
  and public.is_group_chat_member((storage.foldername(name))[1]::uuid, auth.uid())
);

notify pgrst, 'reload schema';
