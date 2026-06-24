-- FCM device tokens + room mention push + automatic push dispatch (safe to re-run).

-- Extend notification types for @mentions in city rooms.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('direct_message', 'new_follower', 'post_comment', 'room_message', 'room_mention'));

-- Native push tokens (FCM — APNs on iOS via Firebase).
create table if not exists public.fcm_device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  fcm_token text not null,
  platform text not null check (platform in ('ios', 'android', 'web')),
  device_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, fcm_token)
);

create index if not exists idx_fcm_device_tokens_user
  on public.fcm_device_tokens (user_id);

alter table public.fcm_device_tokens enable row level security;

drop policy if exists "Users read own fcm tokens" on public.fcm_device_tokens;
create policy "Users read own fcm tokens"
on public.fcm_device_tokens for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users insert own fcm tokens" on public.fcm_device_tokens;
create policy "Users insert own fcm tokens"
on public.fcm_device_tokens for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users update own fcm tokens" on public.fcm_device_tokens;
create policy "Users update own fcm tokens"
on public.fcm_device_tokens for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users delete own fcm tokens" on public.fcm_device_tokens;
create policy "Users delete own fcm tokens"
on public.fcm_device_tokens for delete
to authenticated
using (auth.uid() = user_id);

grant select, insert, update, delete on table public.fcm_device_tokens to authenticated;

-- @mention notifications in city rooms (respects membership; works when room is muted).
create or replace function public.notify_room_mention()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_city record;
  v_sender_username text;
  v_mentioned record;
begin
  select c.slug as city_slug, c.name as city_name, co.slug as country_slug
  into v_city
  from public.cities c
  join public.countries co on co.id = c.country_id
  where c.id = new.city_id;

  if v_city.city_slug is null or new.content is null or btrim(new.content) = '' then
    return new;
  end if;

  select username into v_sender_username from public.profiles where id = new.user_id;

  for v_mentioned in
    select p.id as user_id, p.username
    from public.profiles p
    where p.username is not null
      and btrim(p.username) <> ''
      and p.id <> new.user_id
      and position(lower('@' || p.username) in lower(new.content)) > 0
  loop
    insert into public.notifications (user_id, type, actor_id, href, source_id, metadata)
    select
      v_mentioned.user_id,
      'room_mention',
      new.user_id,
      '/rooms/' || v_city.country_slug || '/' || v_city.city_slug,
      new.id::text || ':mention:' || v_mentioned.user_id::text,
      jsonb_build_object(
        'cityName', v_city.city_name,
        'countrySlug', v_city.country_slug,
        'citySlug', v_city.city_slug,
        'senderUsername', coalesce(v_sender_username, 'someone'),
        'preview', left(btrim(new.content), 120)
      )
    where exists (
      select 1
      from public.room_memberships rm
      where rm.user_id = v_mentioned.user_id
        and rm.country_slug = v_city.country_slug
        and rm.city_slug = v_city.city_slug
        and coalesce(rm.is_hidden, false) = false
    )
    on conflict (user_id, type, source_id) do nothing;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_notify_room_mention on public.city_messages;
create trigger trg_notify_room_mention
after insert on public.city_messages
for each row execute function public.notify_room_mention();

-- Use query-param DM links for Capacitor static export compatibility.
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
    '/dm?id=' || new.sender_id::text,
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

-- Dispatch push via pg_net when configured (set in Supabase Dashboard → Database → Settings):
--   app.push_webhook_url  = https://YOUR_DOMAIN/api/push/send
--   app.push_webhook_secret = YOUR_PUSH_WEBHOOK_SECRET
create or replace function public.dispatch_push_for_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_secret text;
begin
  if new.type not in ('direct_message', 'room_mention', 'new_follower') then
    return new;
  end if;

  begin
    v_url := current_setting('app.push_webhook_url', true);
    v_secret := current_setting('app.push_webhook_secret', true);
  exception when others then
    return new;
  end;

  if v_url is null or v_url = '' or v_secret is null or v_secret = '' then
    return new;
  end if;

  begin
    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_secret
      ),
      body := jsonb_build_object('notificationId', new.id::text)
    );
  exception when others then
    null;
  end;

  return new;
end;
$$;

drop trigger if exists trg_dispatch_push_for_notification on public.notifications;
create trigger trg_dispatch_push_for_notification
after insert on public.notifications
for each row execute function public.dispatch_push_for_notification();

notify pgrst, 'reload schema';
