-- =============================================================================
-- Spot comment notifications (in-app + push)
-- =============================================================================
-- Reuses public.notifications + notify_post_comment.
--
-- Dedupe: unique (user_id, type, source_id) with source_id = comment id
-- (one notification per comment). postId + commentId also stored in metadata.
--
-- Skips self-comments. on conflict do nothing for duplicate processing.
-- Adds post_comment to the push dispatch allowlist (was missing).
-- iOS app-icon badge remains chat-unread only (server push path).
--
-- Safe to re-run. Based on fix-push-dispatch-reliability.sql dispatch body.
-- =============================================================================

-- Ensure post_comment remains an allowed notification type.
alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (type in (
    'direct_message',
    'new_follower',
    'post_comment',
    'room_message',
    'room_mention',
    'group_message'
  ));

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
  v_thumb text;
begin
  select
    p.user_id,
    nullif(btrim(coalesce(p.video_cover_url, p.thumbnail_url, p.image_url, p.media_url)), '')
  into v_post_owner, v_thumb
  from public.posts p
  where p.id = new.post_id;

  -- Missing post, or owner commenting on their own Spot → no notification.
  if v_post_owner is null or v_post_owner = new.user_id then
    return new;
  end if;

  select username into v_username from public.profiles where id = new.user_id;
  v_preview := left(btrim(coalesce(new.content, '')), 120);

  insert into public.notifications (user_id, type, actor_id, href, source_id, metadata)
  values (
    v_post_owner,
    'post_comment',
    new.user_id,
    '/posts/' || new.post_id::text || '?comments=1&commentId=' || new.id::text,
    new.id::text, -- source_id = comment id → unique (user_id, type, source_id) dedupe
    jsonb_build_object(
      'commentId', new.id::text,
      'postId', new.post_id::text,
      'commenterUsername', coalesce(v_username, 'someone'),
      'preview', coalesce(v_preview, ''),
      'postThumbnailUrl', coalesce(v_thumb, '')
    )
  )
  on conflict (user_id, type, source_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_notify_post_comment on public.post_comments;
create trigger trg_notify_post_comment
after insert on public.post_comments
for each row execute function public.notify_post_comment();

-- Same dispatch body as fix-push-dispatch-reliability.sql, plus post_comment.
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
  if new.type not in (
    'direct_message',
    'room_message',
    'room_mention',
    'group_message',
    'new_follower',
    'post_comment'
  ) then
    return new;
  end if;

  -- Prefer config table (survives pooler / unset GUCs), then database settings.
  select c.url, c.secret into v_url, v_secret
  from public.push_webhook_config c
  where c.id = 1;

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
    exception when others then
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
    exception when others then
      null;
    end;
  exception when others then
    get stacked diagnostics v_err = message_text;
    begin
      insert into public.push_dispatch_log (notification_id, notification_type, user_id, stage, detail)
      values (new.id, new.type, new.user_id, 'http_post_error', left(v_err, 500));
    exception when others then
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
