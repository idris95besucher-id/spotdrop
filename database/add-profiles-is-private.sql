-- Public feed: profiles privacy + post read policy

alter table if exists profiles add column if not exists is_private boolean not null default false;

update profiles set is_private = false where is_private is null;

drop policy if exists "Allow post read" on posts;
drop policy if exists "Allow post read from public profiles" on posts;

create policy "Allow post read from public profiles"
on posts
for select
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = posts.user_id
      and (
        coalesce(profiles.is_private, false) = false
        or profiles.id = auth.uid()
      )
  )
);
