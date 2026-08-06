-- Stage B: SpotDrop official channel posts, reads, push-job stub, media bucket.
-- Additive / safe to re-run. Does not send push or create per-user notifications.
--
-- Apply this single file in Supabase SQL editor / migration runner.

-- ---------------------------------------------------------------------------
-- A) official_channel_posts
-- ---------------------------------------------------------------------------

create table if not exists public.official_channel_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete restrict,
  status text not null check (status in ('draft', 'published')),
  -- Locale the admin originally wrote (en/ru/de). Display fills body_*/title_* once.
  source_locale text not null default 'en' check (source_locale in ('en', 'ru', 'de')),
  title_en text null,
  body_en text not null,
  title_ru text null,
  body_ru text null,
  title_de text null,
  body_de text null,
  image_path text null,
  link_url text null,
  link_label_en text null,
  link_label_ru text null,
  link_label_de text null,
  client_request_id uuid null,
  published_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(body_en) >= 1),
  check (link_url is null or link_url ~* '^https://')
);

create unique index if not exists official_channel_posts_author_client_request_uidx
  on public.official_channel_posts (author_id, client_request_id)
  where client_request_id is not null;

create index if not exists official_channel_posts_published_at_idx
  on public.official_channel_posts (published_at desc nulls last)
  where status = 'published';

create index if not exists official_channel_posts_image_path_idx
  on public.official_channel_posts (image_path)
  where image_path is not null;

-- If the table already existed from an earlier Stage B draft without the
-- published_at guard, add it idempotently (no-op when already present).
do $$
begin
  alter table public.official_channel_posts
    add constraint official_channel_posts_published_at_required
    check (status <> 'published' or published_at is not null);
exception
  when duplicate_object then null;
  when check_violation then
    raise exception
      'official_channel_posts has published rows without published_at; fix data before re-applying';
end $$;

alter table public.official_channel_posts enable row level security;

drop policy if exists "Official channel posts published read" on public.official_channel_posts;
create policy "Official channel posts published read"
on public.official_channel_posts for select
to authenticated
using (status = 'published');

-- No INSERT / UPDATE / DELETE policies for authenticated/anon — writes are service_role only.
revoke all on table public.official_channel_posts from public;
revoke all on table public.official_channel_posts from anon;
revoke all on table public.official_channel_posts from authenticated;
grant select on table public.official_channel_posts to authenticated;
grant all on table public.official_channel_posts to service_role;

-- ---------------------------------------------------------------------------
-- B) official_channel_reads
-- ---------------------------------------------------------------------------

create table if not exists public.official_channel_reads (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default 'epoch'::timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.official_channel_reads enable row level security;

drop policy if exists "Official channel reads select own" on public.official_channel_reads;
create policy "Official channel reads select own"
on public.official_channel_reads for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Official channel reads insert own" on public.official_channel_reads;
create policy "Official channel reads insert own"
on public.official_channel_reads for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Official channel reads update own" on public.official_channel_reads;
create policy "Official channel reads update own"
on public.official_channel_reads for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

revoke all on table public.official_channel_reads from public;
revoke all on table public.official_channel_reads from anon;
revoke all on table public.official_channel_reads from authenticated;
grant select, insert, update on table public.official_channel_reads to authenticated;
grant all on table public.official_channel_reads to service_role;

-- ---------------------------------------------------------------------------
-- C) official_channel_push_jobs (Stage C will fan-out; Stage B only creates pending)
-- ---------------------------------------------------------------------------

create table if not exists public.official_channel_push_jobs (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null unique references public.official_channel_posts(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'partial', 'failed')),
  cursor_user_id uuid null references public.profiles(id) on delete set null,
  total_recipients integer not null default 0 check (total_recipients >= 0),
  sent_count integer not null default 0 check (sent_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text null,
  created_at timestamptz not null default now(),
  started_at timestamptz null,
  finished_at timestamptz null,
  updated_at timestamptz not null default now()
);

create index if not exists official_channel_push_jobs_status_idx
  on public.official_channel_push_jobs (status, created_at);

alter table public.official_channel_push_jobs enable row level security;

-- No policies for authenticated/anon — service_role only. Jobs are created by
-- the publish API (one pending row per post via UNIQUE post_id); no SQL fan-out.
revoke all on table public.official_channel_push_jobs from public;
revoke all on table public.official_channel_push_jobs from anon;
revoke all on table public.official_channel_push_jobs from authenticated;
grant all on table public.official_channel_push_jobs to service_role;

-- ---------------------------------------------------------------------------
-- D) Storage bucket official-channel-media (private; no client write/delete/list)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'official-channel-media',
  'official-channel-media',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Remove any Stage B draft policies if present; do not create client policies.
drop policy if exists "Official channel media authenticated read" on storage.objects;
drop policy if exists "Official channel media owner upload" on storage.objects;
drop policy if exists "Official channel media owner update" on storage.objects;
drop policy if exists "Official channel media owner delete" on storage.objects;
drop policy if exists "Official channel media public read" on storage.objects;

-- Intentionally no authenticated/anon storage.objects policies for this bucket.
-- Upload/delete/read go through server routes using the service role + signed URLs.

-- ---------------------------------------------------------------------------
-- E) Realtime
-- ---------------------------------------------------------------------------

alter table public.official_channel_posts replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.official_channel_posts;
exception
  when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
