-- Additive: message_request push + server-side user_blocks.
-- Safe to re-run. Does not require re-running older push migrations.
--
-- Apply this single file in Supabase SQL editor / migration runner.

-- ---------------------------------------------------------------------------
-- 1) Server-side blocks
-- ---------------------------------------------------------------------------

create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index if not exists idx_user_blocks_blocked_id
  on public.user_blocks (blocked_id);

alter table public.user_blocks enable row level security;

drop policy if exists "Users can read own blocks" on public.user_blocks;
create policy "Users can read own blocks"
on public.user_blocks for select
to authenticated
using (auth.uid() = blocker_id);

drop policy if exists "Users can insert own blocks" on public.user_blocks;
create policy "Users can insert own blocks"
on public.user_blocks for insert
to authenticated
with check (auth.uid() = blocker_id and auth.uid() <> blocked_id);

drop policy if exists "Users can delete own blocks" on public.user_blocks;
create policy "Users can delete own blocks"
on public.user_blocks for delete
to authenticated
using (auth.uid() = blocker_id);

grant select, insert, delete on table public.user_blocks to authenticated;

-- Block either direction from creating a new conversation row.
create or replace function public.enforce_user_blocks_on_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.user_blocks ub
    where (ub.blocker_id = new.user_one_id and ub.blocked_id = new.user_two_id)
       or (ub.blocker_id = new.user_two_id and ub.blocked_id = new.user_one_id)
  ) then
    raise exception 'messaging_blocked'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_user_blocks_on_conversation on public.direct_conversations;
create trigger trg_enforce_user_blocks_on_conversation
before insert on public.direct_conversations
for each row execute function public.enforce_user_blocks_on_conversation();

-- ---------------------------------------------------------------------------
-- 2) Allow notification type message_request
--    (keeps existing types: group_message included for production compatibility)
-- ---------------------------------------------------------------------------

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'direct_message',
    'new_follower',
    'post_comment',
    'room_message',
    'room_mention',
    'group_message',
    'message_request'
  ));

-- Existing unique (user_id, type, source_id) is the idempotency key for
-- message_request rows (source_id = conversation.id). Do not recreate it.

-- ---------------------------------------------------------------------------
-- 3) First pending Message Request → one notification → existing push dispatch
-- ---------------------------------------------------------------------------

create or replace function public.notify_message_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient_id uuid;
  v_sender_id uuid;
  v_display_name text;
  v_username text;
begin
  if new.status is distinct from 'pending' then
    return new;
  end if;

  v_sender_id := new.requested_by;

  if v_sender_id is null then
    return new;
  end if;

  if v_sender_id = new.user_one_id then
    v_recipient_id := new.user_two_id;
  elsif v_sender_id = new.user_two_id then
    v_recipient_id := new.user_one_id;
  else
    return new;
  end if;

  if v_recipient_id is null or v_recipient_id = v_sender_id then
    return new;
  end if;

  if not exists (select 1 from public.profiles p where p.id = v_sender_id) then
    return new;
  end if;

  if not exists (select 1 from public.profiles p where p.id = v_recipient_id) then
    return new;
  end if;

  -- Re-check blocks at push time (defense in depth).
  if exists (
    select 1
    from public.user_blocks ub
    where (ub.blocker_id = v_recipient_id and ub.blocked_id = v_sender_id)
       or (ub.blocker_id = v_sender_id and ub.blocked_id = v_recipient_id)
  ) then
    return new;
  end if;

  if exists (
    select 1
    from public.chat_inbox_preferences cip
    where cip.user_id = v_recipient_id
      and cip.chat_type = 'dm'
      and cip.chat_key = v_sender_id::text
      and cip.muted = true
  ) then
    return new;
  end if;

  select
    coalesce(nullif(btrim(p.name), ''), nullif(btrim(p.username), ''), 'Someone'),
    coalesce(nullif(btrim(p.username), ''), 'someone')
  into v_display_name, v_username
  from public.profiles p
  where p.id = v_sender_id;

  -- Insert as security definer (no authenticated INSERT policy on notifications).
  insert into public.notifications (user_id, type, actor_id, href, source_id, metadata)
  values (
    v_recipient_id,
    'message_request',
    v_sender_id,
    '/chats/requests?requestId=' || new.id::text,
    new.id::text,
    jsonb_build_object(
      'requestId', new.id::text,
      'conversationId', new.id::text,
      'senderId', v_sender_id::text,
      'senderDisplayName', v_display_name,
      'senderUsername', v_username
    )
  )
  on conflict (user_id, type, source_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_notify_message_request on public.direct_conversations;
create trigger trg_notify_message_request
after insert on public.direct_conversations
for each row execute function public.notify_message_request();

-- ---------------------------------------------------------------------------
-- 4) While conversation is pending, suppress normal direct_message pushes.
--    After Accept (status=accepted), notify_direct_message works as before.
-- ---------------------------------------------------------------------------

create or replace function public.notify_direct_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
  v_preview text;
  v_user_one uuid;
  v_user_two uuid;
begin
  if new.recipient_id = new.sender_id then
    return new;
  end if;

  v_user_one := least(new.sender_id, new.recipient_id);
  v_user_two := greatest(new.sender_id, new.recipient_id);

  if exists (
    select 1
    from public.direct_conversations dc
    where dc.user_one_id = v_user_one
      and dc.user_two_id = v_user_two
      and dc.status = 'pending'
  ) then
    return new;
  end if;

  if exists (
    select 1
    from public.user_blocks ub
    where (ub.blocker_id = new.recipient_id and ub.blocked_id = new.sender_id)
       or (ub.blocker_id = new.sender_id and ub.blocked_id = new.recipient_id)
  ) then
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

-- Keep DM trigger attached (idempotent).
drop trigger if exists trg_notify_direct_message on public.direct_messages;
create trigger trg_notify_direct_message
after insert on public.direct_messages
for each row execute function public.notify_direct_message();

-- ---------------------------------------------------------------------------
-- 5) Existing push dispatch — add message_request to the allow-list.
--    Webhook URL/secret still come from push_webhook_config / DB settings
--    (never hardcoded in SQL).
-- ---------------------------------------------------------------------------

create or replace function public.dispatch_push_for_notification()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url text;
  v_secret text;
  v_request_id bigint;
  v_err text;
begin
  -- Allow-list from enable-post-comment-notifications.sql (latest complete
  -- dispatch) plus message_request. Must keep post_comment / group_message.
  if new.type not in (
    'direct_message',
    'room_message',
    'room_mention',
    'group_message',
    'new_follower',
    'post_comment',
    'message_request'
  ) then
    return new;
  end if;

  begin
    select c.url, c.secret into v_url, v_secret
    from public.push_webhook_config c
    where c.id = 1;
  exception when undefined_table then
    v_url := null;
    v_secret := null;
  end;

  if v_url is null or v_url = '' or v_secret is null or v_secret = '' then
    begin
      v_url := current_setting('app.push_webhook_url', true);
      v_secret := current_setting('app.push_webhook_secret', true);
    exception when others then
      v_url := null;
      v_secret := null;
    end;
  end if;

  if v_url is null or btrim(v_url) = '' or v_secret is null or btrim(v_secret) = '' then
    begin
      insert into public.push_dispatch_log (notification_id, notification_type, user_id, stage, detail)
      values (
        new.id,
        new.type,
        new.user_id,
        'skipped_no_webhook_config',
        'Set push_webhook_config or app.push_webhook_url/secret'
      );
    exception when undefined_table then
      null;
    end;
    return new;
  end if;

  begin
    v_request_id := net.http_post(
      url := btrim(v_url),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || btrim(v_secret)
      ),
      body := jsonb_build_object('notificationId', new.id::text)
    );

    begin
      insert into public.push_dispatch_log (
        notification_id, notification_type, user_id, stage, detail, request_id
      )
      values (
        new.id,
        new.type,
        new.user_id,
        'http_post_queued',
        left(btrim(v_url), 200),
        v_request_id
      );
    exception when undefined_table then
      null;
    end;
  exception when others then
    get stacked diagnostics v_err = message_text;
    begin
      insert into public.push_dispatch_log (notification_id, notification_type, user_id, stage, detail)
      values (new.id, new.type, new.user_id, 'http_post_error', left(v_err, 500));
    exception when undefined_table then
      null;
    end;
  end;

  return new;
end;
$$;

drop trigger if exists trg_dispatch_push_for_notification on public.notifications;
create trigger trg_dispatch_push_for_notification
after insert on public.notifications
for each row execute function public.dispatch_push_for_notification();

notify pgrst, 'reload schema';
