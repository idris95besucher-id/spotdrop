-- Public map marks (reports / notes on the live map). Safe to re-run.
-- If the table already existed without a foreign key, also run
-- fix-map-marks-profiles-fk.sql (CREATE TABLE IF NOT EXISTS will not add it).

create table if not exists public.map_marks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  text text not null check (char_length(trim(text)) > 0),
  photo_url text,
  latitude double precision not null,
  longitude double precision not null,
  place_name text,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.map_marks
  drop constraint if exists map_marks_user_id_fkey;

alter table public.map_marks
  add constraint map_marks_user_id_fkey
  foreign key (user_id)
  references public.profiles(id)
  on delete cascade;

create index if not exists idx_map_marks_created_at
  on public.map_marks (created_at desc);

create index if not exists idx_map_marks_user_id
  on public.map_marks (user_id);

create index if not exists idx_map_marks_coords
  on public.map_marks (latitude, longitude);

alter table public.map_marks enable row level security;

drop policy if exists "Authenticated users can read map marks" on public.map_marks;
create policy "Authenticated users can read map marks"
on public.map_marks for select
to authenticated
using (true);

drop policy if exists "Users can insert own map marks" on public.map_marks;
create policy "Users can insert own map marks"
on public.map_marks for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own map marks" on public.map_marks;
create policy "Users can update own map marks"
on public.map_marks for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own map marks" on public.map_marks;
create policy "Users can delete own map marks"
on public.map_marks for delete
to authenticated
using (auth.uid() = user_id);

grant select, insert, update, delete on table public.map_marks to authenticated;

-- Photos reuse the existing public post-media bucket (path: {user_id}/map-mark-...).
insert into storage.buckets (id, name, public)
values ('post-media', 'post-media', true)
on conflict (id) do update
set public = excluded.public;

drop policy if exists "Post media public read" on storage.objects;
create policy "Post media public read"
on storage.objects for select
using (bucket_id = 'post-media');

drop policy if exists "Post media owner upload" on storage.objects;
create policy "Post media owner upload"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'post-media'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "Post media owner update" on storage.objects;
create policy "Post media owner update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'post-media'
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'post-media'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "Post media owner delete" on storage.objects;
create policy "Post media owner delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'post-media'
  and auth.uid()::text = (storage.foldername(name))[1]
);

notify pgrst, 'reload schema';
