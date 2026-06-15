-- In-app notifications + Web Push subscriptions (safe to re-run).

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('direct_message', 'new_follower', 'post_comment', 'room_message')),
  actor_id uuid references public.profiles(id) on delete set null,
  href text not null default '/notifications',
  source_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, type, source_id)
);

create index if not exists idx_notifications_user_created
  on public.notifications (user_id, created_at desc);

create index if not exists idx_notifications_user_unread
  on public.notifications (user_id, read_at)
  where read_at is null;

alter table public.notifications enable row level security;

drop policy if exists "Users can read own notifications" on public.notifications;
create policy "Users can read own notifications"
on public.notifications for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can update own notifications" on public.notifications;
create policy "Users can update own notifications"
on public.notifications for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

grant select, update on table public.notifications to authenticated;

-- Web Push subscriptions (iOS Safari 16.4+, Android Chrome, desktop).
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  platform text not null default 'web',
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index if not exists idx_push_subscriptions_user
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "Users can read own push subscriptions" on public.push_subscriptions;
create policy "Users can read own push subscriptions"
on public.push_subscriptions for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert own push subscriptions" on public.push_subscriptions;
create policy "Users can insert own push subscriptions"
on public.push_subscriptions for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own push subscriptions" on public.push_subscriptions;
create policy "Users can update own push subscriptions"
on public.push_subscriptions for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own push subscriptions" on public.push_subscriptions;
create policy "Users can delete own push subscriptions"
on public.push_subscriptions for delete
to authenticated
using (auth.uid() = user_id);

grant select, insert, update, delete on table public.push_subscriptions to authenticated;

-- Trigger helpers (security definer — inserts for other users).
create or replace function public.notify_direct_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
begin
  if new.recipient_id = new.sender_id then
    return new;
  end if;

  select username into v_username from public.profiles where id = new.sender_id;

  insert into public.notifications (user_id, type, actor_id, href, source_id, metadata)
  values (
    new.recipient_id,
    'direct_message',
    new.sender_id,
    '/dm/' || new.sender_id::text,
    new.id::text,
    jsonb_build_object(
      'messageType', coalesce(new.message_type, 'text'),
      'senderUsername', coalesce(v_username, 'someone')
    )
  )
  on conflict (user_id, type, source_id) do nothing;

  return new;
end;
$$;

create or replace function public.notify_new_follower()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
begin
  select username into v_username from public.profiles where id = new.follower_id;

  insert into public.notifications (user_id, type, actor_id, href, source_id, metadata)
  values (
    new.following_id,
    'new_follower',
    new.follower_id,
    case
      when v_username is not null and btrim(v_username) <> '' then '/users/' || v_username
      else '/user/' || new.follower_id::text
    end,
    new.id::text,
    jsonb_build_object('followerUsername', coalesce(v_username, 'someone'))
  )
  on conflict (user_id, type, source_id) do nothing;

  return new;
end;
$$;

create or replace function public.notify_post_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post_owner uuid;
  v_username text;
  v_preview text;
begin
  select user_id into v_post_owner from public.posts where id = new.post_id;

  if v_post_owner is null or v_post_owner = new.user_id then
    return new;
  end if;

  select username into v_username from public.profiles where id = new.user_id;
  v_preview := left(btrim(new.content), 120);

  insert into public.notifications (user_id, type, actor_id, href, source_id, metadata)
  values (
    v_post_owner,
    'post_comment',
    new.user_id,
    '/posts/' || new.post_id::text,
    new.id::text,
    jsonb_build_object(
      'commenterUsername', coalesce(v_username, 'someone'),
      'postId', new.post_id::text,
      'preview', coalesce(v_preview, '')
    )
  )
  on conflict (user_id, type, source_id) do nothing;

  return new;
end;
$$;

create or replace function public.notify_room_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_city record;
begin
  select c.slug as city_slug, c.name as city_name, co.slug as country_slug
  into v_city
  from public.cities c
  join public.countries co on co.id = c.country_id
  where c.id = new.city_id;

  if v_city.city_slug is null then
    return new;
  end if;

  insert into public.notifications (user_id, type, actor_id, href, source_id, metadata)
  select
    rm.user_id,
    'room_message',
    new.user_id,
    '/rooms/' || v_city.country_slug || '/' || v_city.city_slug,
    new.id::text || ':' || rm.user_id::text,
    jsonb_build_object(
      'cityName', v_city.city_name,
      'countrySlug', v_city.country_slug,
      'citySlug', v_city.city_slug
    )
  from public.room_memberships rm
  where rm.country_slug = v_city.country_slug
    and rm.city_slug = v_city.city_slug
    and rm.user_id <> new.user_id
    and coalesce(rm.is_muted, false) = false
    and coalesce(rm.is_hidden, false) = false
  on conflict (user_id, type, source_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_notify_direct_message on public.direct_messages;
create trigger trg_notify_direct_message
after insert on public.direct_messages
for each row execute function public.notify_direct_message();

drop trigger if exists trg_notify_new_follower on public.follows;
create trigger trg_notify_new_follower
after insert on public.follows
for each row execute function public.notify_new_follower();

drop trigger if exists trg_notify_post_comment on public.post_comments;
create trigger trg_notify_post_comment
after insert on public.post_comments
for each row execute function public.notify_post_comment();

drop trigger if exists trg_notify_room_message on public.city_messages;
create trigger trg_notify_room_message
after insert on public.city_messages
for each row execute function public.notify_room_message();

do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception
  when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
