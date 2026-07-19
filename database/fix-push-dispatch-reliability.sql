-- Reliable push dispatch: config table fallback + delivery log.
-- Safe to re-run. Apply after enable-message-push-prefs-and-groups.sql.
--
-- After applying, set the webhook once (replace URL + secret):
--   insert into public.push_webhook_config (id, url, secret)
--   values (1, 'https://YOUR_PRODUCTION_DOMAIN/api/push/send', 'YOUR_PUSH_WEBHOOK_SECRET')
--   on conflict (id) do update set url = excluded.url, secret = excluded.secret, updated_at = now();
--
-- Then verify:
--   select * from public.push_dispatch_log order by created_at desc limit 20;

create extension if not exists pg_net with schema extensions;

create table if not exists public.push_webhook_config (
  id int primary key default 1 check (id = 1),
  url text not null,
  secret text not null,
  updated_at timestamptz not null default now()
);

alter table public.push_webhook_config enable row level security;
-- No policies for authenticated — service_role / security definer only.

grant select on table public.push_webhook_config to service_role;

create table if not exists public.push_dispatch_log (
  id bigserial primary key,
  notification_id uuid,
  notification_type text,
  user_id uuid,
  stage text not null,
  detail text,
  request_id bigint,
  created_at timestamptz not null default now()
);

create index if not exists idx_push_dispatch_log_created
  on public.push_dispatch_log (created_at desc);

create index if not exists idx_push_dispatch_log_notification
  on public.push_dispatch_log (notification_id);

alter table public.push_dispatch_log enable row level security;
grant select, insert on table public.push_dispatch_log to service_role;

create table if not exists public.push_send_dedupe (
  notification_id uuid primary key,
  created_at timestamptz not null default now()
);

alter table public.push_send_dedupe enable row level security;
grant select, insert, delete on table public.push_send_dedupe to service_role;

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
    'new_follower'
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
    insert into public.push_dispatch_log (notification_id, notification_type, user_id, stage, detail)
    values (
      new.id,
      new.type,
      new.user_id,
      'skipped_no_webhook_config',
      'Set push_webhook_config or app.push_webhook_url/secret'
    );
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
    get stacked diagnostics v_err = message_text;
    insert into public.push_dispatch_log (notification_id, notification_type, user_id, stage, detail)
    values (new.id, new.type, new.user_id, 'http_post_error', left(v_err, 500));
  end;

  return new;
end;
$$;

drop trigger if exists trg_dispatch_push_for_notification on public.notifications;
create trigger trg_dispatch_push_for_notification
after insert on public.notifications
for each row execute function public.dispatch_push_for_notification();

notify pgrst, 'reload schema';
