-- Native push tokens for FCM/APNs (iOS via Firebase).
-- Safe to re-run. Migrates legacy fcm_device_tokens rows when present.

create table if not exists public.user_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null,
  platform text not null check (platform in ('ios', 'android', 'web')),
  device_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, token)
);

create index if not exists idx_user_push_tokens_user
  on public.user_push_tokens (user_id);

create index if not exists idx_user_push_tokens_platform
  on public.user_push_tokens (platform);

alter table public.user_push_tokens enable row level security;

drop policy if exists "Users read own push tokens" on public.user_push_tokens;
create policy "Users read own push tokens"
on public.user_push_tokens for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users insert own push tokens" on public.user_push_tokens;
create policy "Users insert own push tokens"
on public.user_push_tokens for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users update own push tokens" on public.user_push_tokens;
create policy "Users update own push tokens"
on public.user_push_tokens for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users delete own push tokens" on public.user_push_tokens;
create policy "Users delete own push tokens"
on public.user_push_tokens for delete
to authenticated
using (auth.uid() = user_id);

grant select, insert, update, delete on table public.user_push_tokens to authenticated;

-- Backfill from legacy table (add-fcm-push.sql).
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'fcm_device_tokens'
  ) then
    insert into public.user_push_tokens (user_id, token, platform, device_id, created_at, updated_at)
    select user_id, fcm_token, platform, device_id, created_at, updated_at
    from public.fcm_device_tokens
    on conflict (user_id, token) do update
      set platform = excluded.platform,
          device_id = coalesce(excluded.device_id, public.user_push_tokens.device_id),
          updated_at = excluded.updated_at;
  end if;
end $$;

notify pgrst, 'reload schema';
