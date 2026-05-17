-- Profile avatars storage bucket + RLS (run in Supabase SQL editor)

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update
set public = excluded.public;

drop policy if exists "Avatars public read" on storage.objects;
drop policy if exists "Avatars owner upload" on storage.objects;
drop policy if exists "Avatars owner update" on storage.objects;
drop policy if exists "Avatars owner delete" on storage.objects;

create policy "Avatars public read"
on storage.objects
for select
using (bucket_id = 'avatars');

create policy "Avatars owner upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "Avatars owner update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "Avatars owner delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
);
