-- Post visibility for public/private profile sections (run in Supabase SQL editor)

alter table public.posts
  add column if not exists visibility text not null default 'public';

update public.posts
set visibility = 'public'
where visibility is null;

alter table public.posts drop constraint if exists posts_visibility_check;
alter table public.posts
  add constraint posts_visibility_check
  check (visibility in ('public', 'private'));

drop policy if exists "Allow post read" on public.posts;
drop policy if exists "Allow post read from public profiles" on public.posts;

create policy "Allow post read from public profiles"
on public.posts
for select
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = posts.user_id
      and (
        posts.user_id = auth.uid()
        or (
          coalesce(posts.visibility, 'public') = 'public'
          and coalesce(profiles.is_private, false) = false
        )
      )
  )
);

drop policy if exists "Post comments readable" on public.post_comments;
drop policy if exists "Users can create own comments" on public.post_comments;

create policy "Post comments readable"
on public.post_comments
for select
to authenticated
using (
  exists (
    select 1
    from public.posts
    join public.profiles on profiles.id = posts.user_id
    where posts.id = post_comments.post_id
      and (
        posts.user_id = auth.uid()
        or (
          coalesce(posts.visibility, 'public') = 'public'
          and coalesce(profiles.is_private, false) = false
        )
      )
  )
);

create policy "Users can create own comments"
on public.post_comments
for insert
to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.posts
    join public.profiles on profiles.id = posts.user_id
    where posts.id = post_comments.post_id
      and (
        posts.user_id = auth.uid()
        or (
          coalesce(posts.visibility, 'public') = 'public'
          and coalesce(profiles.is_private, false) = false
        )
      )
  )
);

drop policy if exists "Post reactions readable" on public.post_reactions;
drop policy if exists "Users can add own reactions" on public.post_reactions;

create policy "Post reactions readable"
on public.post_reactions
for select
to authenticated
using (
  exists (
    select 1
    from public.posts
    join public.profiles on profiles.id = posts.user_id
    where posts.id = post_reactions.post_id
      and (
        posts.user_id = auth.uid()
        or (
          coalesce(posts.visibility, 'public') = 'public'
          and coalesce(profiles.is_private, false) = false
        )
      )
  )
);

create policy "Users can add own reactions"
on public.post_reactions
for insert
to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.posts
    join public.profiles on profiles.id = posts.user_id
    where posts.id = post_reactions.post_id
      and (
        posts.user_id = auth.uid()
        or (
          coalesce(posts.visibility, 'public') = 'public'
          and coalesce(profiles.is_private, false) = false
        )
      )
  )
);
