-- Post media storage bucket + posts media columns migration

alter table if exists posts add column if not exists image_url text;
alter table if exists posts add column if not exists video_url text;
alter table if exists posts add column if not exists media_url text;
alter table if exists posts add column if not exists media_type text;
alter table if exists posts alter column content set default '';

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'posts'
      and column_name = 'image_url'
  ) then
    execute $sql$
      update posts
      set media_url = image_url,
          media_type = 'image'
      where image_url is not null
        and media_url is null
    $sql$;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'posts_media_type_check'
  ) then
    alter table public.posts
      add constraint posts_media_type_check
      check (media_type is null or media_type in ('image', 'video'));
  end if;
end $$;

insert into storage.buckets (id, name, public)
values ('post-media', 'post-media', true)
on conflict (id) do update
set public = excluded.public;

drop policy if exists "Post media public read" on storage.objects;
drop policy if exists "Post media owner upload" on storage.objects;
drop policy if exists "Post media owner update" on storage.objects;
drop policy if exists "Post media owner delete" on storage.objects;

create policy "Post media public read"
on storage.objects
for select
using (bucket_id = 'post-media');

create policy "Post media owner upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'post-media'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "Post media owner update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'post-media'
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'post-media'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "Post media owner delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'post-media'
  and auth.uid()::text = (storage.foldername(name))[1]
);
