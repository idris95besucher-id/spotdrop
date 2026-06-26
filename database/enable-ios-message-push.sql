-- iOS/Android message push: DM + room messages + mentions (FCM/APNs via /api/push/send).
-- Safe to re-run.

-- Ensure notification types include room_mention.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('direct_message', 'new_follower', 'post_comment', 'room_message', 'room_mention'));

-- DM notification: skip muted chats, include message preview, deep link /dm?id=
create or replace function public.notify_direct_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
  v_preview text;
begin
  if new.recipient_id = new.sender_id then
    return new;
  end if;

  if exists (
    select 1
    from public.chat_inbox_preferences cip
    where cip.user_id = new.recipient_id
      and cip.chat_type = 'dm'
      and cip.chat_key = new.sender_id::text
      and cip.muted = true
  ) then
    return new;
  end if;

  select username into v_username from public.profiles where id = new.sender_id;

  v_preview := left(btrim(coalesce(new.body, '')), 120);

  if v_preview = '' and new.message_type = 'spot_share_request' then
    v_preview := 'Sent you a CheckSpot';
  elsif v_preview = '' and new.message_type = 'spot' then
    v_preview := 'Sent you a Spot';
  elsif v_preview = '' then
    v_preview := 'Sent you a message';
  end if;

  insert into public.notifications (user_id, type, actor_id, href, source_id, metadata)
  values (
    new.recipient_id,
    'direct_message',
    new.sender_id,
    '/dm?id=' || new.sender_id::text,
    new.id::text,
    jsonb_build_object(
      'messageType', coalesce(new.message_type, 'text'),
      'senderUsername', coalesce(v_username, 'someone'),
      'preview', v_preview
    )
  )
  on conflict (user_id, type, source_id) do nothing;

  return new;
end;
$$;

-- Room message notification: members except sender; skip muted/hidden rooms; include preview.
create or replace function public.notify_room_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_city record;
  v_preview text;
begin
  select c.slug as city_slug, c.name as city_name, co.slug as country_slug
  into v_city
  from public.cities c
  join public.countries co on co.id = c.country_id
  where c.id = new.city_id;

  if v_city.city_slug is null then
    return new;
  end if;

  v_preview := left(btrim(coalesce(new.content, '')), 120);

  if v_preview = '' then
    v_preview := 'New room message';
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
      'citySlug', v_city.city_slug,
      'preview', v_preview
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

-- Push dispatch webhook: DM, room messages, mentions, followers.
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
  if new.type not in ('direct_message', 'room_message', 'room_mention', 'new_follower') then
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

drop trigger if exists trg_notify_direct_message on public.direct_messages;
create trigger trg_notify_direct_message
after insert on public.direct_messages
for each row execute function public.notify_direct_message();

drop trigger if exists trg_notify_room_message on public.city_messages;
create trigger trg_notify_room_message
after insert on public.city_messages
for each row execute function public.notify_room_message();

notify pgrst, 'reload schema';
