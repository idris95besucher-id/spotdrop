-- Owner delete already exists on posts/stories. Add admin flag for future moderation.

alter table if exists public.profiles
  add column if not exists is_admin boolean not null default false;

update public.profiles set is_admin = false where is_admin is null;

alter table if exists public.profiles alter column is_admin set default false;
alter table if exists public.profiles alter column is_admin set not null;

drop policy if exists "Allow post owner delete" on public.posts;
create policy "Allow post owner or admin delete"
on public.posts
for delete
using (
  auth.uid() = user_id
  or exists (
    select 1 from public.profiles
    where id = auth.uid() and is_admin = true
  )
);

drop policy if exists "Users delete own stories" on public.stories;
create policy "Users delete own stories or admin"
on public.stories
for delete
using (
  auth.uid() = user_id
  or exists (
    select 1 from public.profiles
    where id = auth.uid() and is_admin = true
  )
);
