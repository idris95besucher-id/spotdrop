-- Message push: group chats + server-readable notification prefs (sound / categories).
-- Safe to re-run. Apply after database/enable-ios-message-push.sql.

-- 1) Per-user notification preferences (synced from device Settings)
create table if not exists public.user_notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  all_enabled boolean not null default true,
  direct_messages boolean not null default true,
  group_messages boolean not null default true,
  room_messages boolean not null default true,
  likes boolean not null default true,
  comments boolean not null default true,
  new_followers boolean not null default true,
  sound boolean not null default true,
  vibration boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.user_notification_preferences enable row level security;

drop policy if exists "Users read own notification prefs" on public.user_notification_preferences;
create policy "Users read own notification prefs"
on public.user_notification_preferences for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users upsert own notification prefs" on public.user_notification_preferences;
create policy "Users upsert own notification prefs"
on public.user_notification_preferences for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users update own notification prefs" on public.user_notification_preferences;
create policy "Users update own notification prefs"
on public.user_notification_preferences for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

grant select, insert, update on public.user_notification_preferences to authenticated;
grant select on public.user_notification_preferences to service_role;

-- 2) Notification types include group_message
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'direct_message',
    'new_follower',
    'post_comment',
    'room_message',
    'room_mention',
    'group_message'
  ));

-- 3) Group message → notifications for other members (skip system events)
create or replace function public.notify_group_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
  v_group_name text;
  v_preview text;
begin
  if new.sender_id is null then
    return new;
  end if;

  -- System events (SPOTDROP_GROUP_EVENT_V1::…) should not push
  if coalesce(new.message_type, 'text') = 'system'
     or coalesce(new.body, '') like 'SPOTDROP_GROUP_EVENT_V1::%' then
    return new;
  end if;

  select username into v_username from public.profiles where id = new.sender_id;
  select name into v_group_name from public.group_chats where id = new.group_id;

  v_preview := left(btrim(coalesce(new.body, '')), 120);

  if v_preview = '' and coalesce(new.message_type, 'text') = 'voice' then
    v_preview := 'Sent a voice message';
  elsif v_preview = '' then
    v_preview := 'Sent a message';
  end if;

  insert into public.notifications (user_id, type, actor_id, href, source_id, metadata)
  select
    m.user_id,
    'group_message',
    new.sender_id,
    '/group?id=' || new.group_id::text,
    new.id::text || ':' || m.user_id::text,
    jsonb_build_object(
      'groupId', new.group_id::text,
      'groupName', coalesce(v_group_name, 'Group'),
      'senderUsername', coalesce(v_username, 'someone'),
      'preview', v_preview,
      'messageType', coalesce(new.message_type, 'text')
    )
  from public.group_chat_members m
  where m.group_id = new.group_id
    and m.user_id <> new.sender_id
  on conflict (user_id, type, source_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_notify_group_message on public.group_chat_messages;
create trigger trg_notify_group_message
after insert on public.group_chat_messages
for each row execute function public.notify_group_message();

-- 4) Dispatch webhook includes group_message
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
  if new.type not in (
    'direct_message',
    'room_message',
    'room_mention',
    'group_message',
    'new_follower'
  ) then
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
