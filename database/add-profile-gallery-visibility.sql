-- Profile Gallery visibility: who may open the personal gallery from the avatar.

alter table public.profiles
  add column if not exists gallery_visibility text not null default 'everyone';

update public.profiles
set gallery_visibility = 'everyone'
where gallery_visibility is null;

alter table public.profiles drop constraint if exists profiles_gallery_visibility_check;
alter table public.profiles
  add constraint profiles_gallery_visibility_check
  check (gallery_visibility in ('everyone', 'friends', 'only_me'));

-- Allow permitted viewers to read private Profile Gallery posts (photos/videos only).
drop policy if exists "Allow profile gallery read for permitted viewers" on public.posts;

create policy "Allow profile gallery read for permitted viewers"
on public.posts
for select
using (
  coalesce(posts.visibility, 'public') = 'private'
  and coalesce(posts.content_kind, 'post') = 'post'
  and coalesce(posts.published_to_spots, false) = false
  and posts.user_id is distinct from auth.uid()
  and exists (
    select 1
    from public.profiles p
    where p.id = posts.user_id
      and (
        coalesce(p.gallery_visibility, 'everyone') = 'everyone'
        or (
          auth.uid() is not null
          and coalesce(p.gallery_visibility, 'everyone') = 'friends'
          and exists (
            select 1
            from public.follows f_out
            join public.follows f_in
              on f_out.following_id = f_in.follower_id
             and f_out.follower_id = f_in.following_id
            where f_out.follower_id = auth.uid()
              and f_out.following_id = posts.user_id
          )
        )
      )
  )
);
