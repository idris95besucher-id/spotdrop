-- Profile Gallery privacy: everyone | followers | friends | selected
-- Safe to re-run. Does not assume gallery_visibility already exists.
--
-- Order:
--   1. Add column
--   2. Backfill / migrate values
--   3. Add check constraint
--   4. Allowlist table, indexes, RLS
--   5. Posts read policy for gallery privacy

-- ---------------------------------------------------------------------------
-- 1. Column on profiles
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists gallery_visibility text;

update public.profiles
set gallery_visibility = 'everyone'
where gallery_visibility is null;

alter table public.profiles
  alter column gallery_visibility set default 'everyone';

alter table public.profiles
  alter column gallery_visibility set not null;

-- ---------------------------------------------------------------------------
-- 2. Migrate legacy / invalid values before adding the new check constraint
-- ---------------------------------------------------------------------------

update public.profiles
set gallery_visibility = 'selected'
where gallery_visibility = 'only_me';

update public.profiles
set gallery_visibility = 'everyone'
where gallery_visibility is not null
  and gallery_visibility not in ('everyone', 'followers', 'friends', 'selected');

-- ---------------------------------------------------------------------------
-- 3. Check constraint
-- ---------------------------------------------------------------------------

alter table public.profiles
  drop constraint if exists profiles_gallery_visibility_check;

alter table public.profiles
  add constraint profiles_gallery_visibility_check
  check (gallery_visibility in ('everyone', 'followers', 'friends', 'selected'));

-- ---------------------------------------------------------------------------
-- 4. Selected-people allowlist table
-- ---------------------------------------------------------------------------

create table if not exists public.profile_gallery_allowed_viewers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profile_gallery_allowed_viewers_no_self'
      and conrelid = 'public.profile_gallery_allowed_viewers'::regclass
  ) then
    alter table public.profile_gallery_allowed_viewers
      add constraint profile_gallery_allowed_viewers_no_self
      check (owner_id <> viewer_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profile_gallery_allowed_viewers_unique'
      and conrelid = 'public.profile_gallery_allowed_viewers'::regclass
  ) then
    alter table public.profile_gallery_allowed_viewers
      add constraint profile_gallery_allowed_viewers_unique
      unique (owner_id, viewer_id);
  end if;
end $$;

create index if not exists idx_profile_gallery_allowed_viewers_owner
  on public.profile_gallery_allowed_viewers(owner_id, created_at desc);

create index if not exists idx_profile_gallery_allowed_viewers_viewer
  on public.profile_gallery_allowed_viewers(viewer_id);

-- ---------------------------------------------------------------------------
-- 5. Allowlist RLS
-- ---------------------------------------------------------------------------

alter table public.profile_gallery_allowed_viewers enable row level security;

drop policy if exists "Gallery allowlist owner manage" on public.profile_gallery_allowed_viewers;
drop policy if exists "Gallery allowlist select" on public.profile_gallery_allowed_viewers;
drop policy if exists "Gallery allowlist owner insert" on public.profile_gallery_allowed_viewers;
drop policy if exists "Gallery allowlist owner update" on public.profile_gallery_allowed_viewers;
drop policy if exists "Gallery allowlist owner delete" on public.profile_gallery_allowed_viewers;

create policy "Gallery allowlist select"
on public.profile_gallery_allowed_viewers
for select
to authenticated
using (auth.uid() = owner_id or auth.uid() = viewer_id);

create policy "Gallery allowlist owner insert"
on public.profile_gallery_allowed_viewers
for insert
to authenticated
with check (auth.uid() = owner_id);

create policy "Gallery allowlist owner update"
on public.profile_gallery_allowed_viewers
for update
to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

create policy "Gallery allowlist owner delete"
on public.profile_gallery_allowed_viewers
for delete
to authenticated
using (auth.uid() = owner_id);

-- ---------------------------------------------------------------------------
-- 6. Posts RLS — enforce gallery privacy server-side
-- ---------------------------------------------------------------------------

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
          and coalesce(p.gallery_visibility, 'everyone') = 'followers'
          and exists (
            select 1
            from public.follows f
            where f.follower_id = auth.uid()
              and f.following_id = posts.user_id
          )
        )
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
        or (
          auth.uid() is not null
          and coalesce(p.gallery_visibility, 'everyone') = 'selected'
          and exists (
            select 1
            from public.profile_gallery_allowed_viewers gav
            where gav.owner_id = posts.user_id
              and gav.viewer_id = auth.uid()
          )
        )
      )
  )
);

notify pgrst, 'reload schema';
