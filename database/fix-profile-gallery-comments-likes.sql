-- Fix per-photo comment/like separation for Profile Gallery (and every other screen that
-- renders through PostCommentsSection / postComments.ts / postReactions.ts).
--
-- Gallery photo table : public.posts        (real per-photo primary key: posts.id, uuid)
-- Comments table       : public.post_comments  (foreign key: post_comments.post_id -> posts.id)
-- Likes/reactions table: public.post_reactions  (foreign key: post_reactions.post_id -> posts.id)
--
-- Every profile-gallery photo is its own row in posts (inserted one row per upload — never a
-- shared "gallery" row or an array of media). Comments and reactions already carry a real
-- post_id foreign key to that exact row, so this migration only needs to ensure the tables,
-- columns, constraints, indexes and RLS policies backing that relationship are all present and
-- correct — it does not introduce any new identifier scheme.
--
-- Safe to run more than once (every statement is idempotent). Run this whole file once in the
-- Supabase SQL Editor.

-- 1) post_comments ------------------------------------------------------------------------------

create table if not exists public.post_comments (
  id bigint generated always as identity primary key,
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamp with time zone not null default now(),
  edited_at timestamp with time zone
);

alter table public.post_comments add column if not exists edited_at timestamptz;

create index if not exists idx_post_comments_post_id_created_at
  on public.post_comments (post_id, created_at asc);
create index if not exists idx_post_comments_user_id
  on public.post_comments (user_id);

-- 2) post_reactions (likes) ----------------------------------------------------------------------

create table if not exists public.post_reactions (
  id bigint generated always as identity primary key,
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction_type text not null check (reaction_type in ('like', 'useful')),
  created_at timestamp with time zone not null default now()
);

-- One user can react to one photo with a given reaction type only once.
--
-- This table can already contain duplicate (post_id, user_id, reaction_type) rows (e.g. from
-- before this constraint existed, or a race between two concurrent inserts) — that's exactly
-- what makes "add constraint ... unique (...)" below fail with 23505 ("could not create unique
-- index ... Key (post_id, user_id, reaction_type) is duplicated"). Deduplicate first: for every
-- duplicate group, rank oldest-first by created_at (id as a stable tie-breaker for equal/NULL
-- timestamps) and keep only the oldest row. PARTITION BY scopes this strictly within each exact
-- (post_id, user_id, reaction_type) group, so a row is only ever removed in favor of another row
-- from the same user, same post, and same reaction type — never across different users or posts.
with ranked_reactions as (
  select
    id,
    row_number() over (
      partition by post_id, user_id, reaction_type
      order by created_at asc, id asc
    ) as row_number
  from public.post_reactions
)
delete from public.post_reactions
where id in (
  select id
  from ranked_reactions
  where row_number > 1
);

alter table public.post_reactions drop constraint if exists post_reactions_post_id_user_id_reaction_type_key;
drop index if exists public.post_reactions_post_id_user_id_reaction_type_key;
drop index if exists public.idx_post_reactions_unique_post_user_reaction;
alter table public.post_reactions
  add constraint post_reactions_post_id_user_id_reaction_type_key
  unique (post_id, user_id, reaction_type);

create index if not exists idx_post_reactions_post_id on public.post_reactions (post_id);
create index if not exists idx_post_reactions_user_id on public.post_reactions (user_id);

-- 3) RLS: post_comments ---------------------------------------------------------------------------

alter table public.post_comments enable row level security;

drop policy if exists "Post comments readable" on public.post_comments;
drop policy if exists "Users can create own comments" on public.post_comments;
drop policy if exists "Users can update own comments" on public.post_comments;
drop policy if exists "Users can delete own comments" on public.post_comments;

-- Readable by the photo's owner always, or by anyone else when the photo is public and the
-- owner's profile isn't private. Profile Gallery uploads are always private, so only the owner
-- can read/write comments on their own gallery photos — exactly matching gallery access rules.
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

create policy "Users can update own comments"
on public.post_comments
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own comments"
on public.post_comments
for delete
to authenticated
using (auth.uid() = user_id);

-- Server-side 15-minute edit window + author-only + locks down which columns an edit may touch
-- (content + edited_at only). Deleting has no time limit, so there is no equivalent delete guard.
create or replace function public.post_comments_guard_owner_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.post_id is distinct from old.post_id
    or new.user_id is distinct from old.user_id
    or new.created_at is distinct from old.created_at
  then
    raise exception 'cannot change comment identity fields';
  end if;

  if auth.uid() is distinct from old.user_id then
    raise exception 'only the comment author can edit this comment';
  end if;

  if old.created_at < now() - interval '15 minutes' then
    raise exception 'edit window has expired';
  end if;

  return new;
end;
$$;

drop trigger if exists post_comments_guard_owner_edit on public.post_comments;
create trigger post_comments_guard_owner_edit
before update on public.post_comments
for each row
execute function public.post_comments_guard_owner_edit();

-- 4) RLS: post_reactions (likes) --------------------------------------------------------------

alter table public.post_reactions enable row level security;

drop policy if exists "Post reactions readable" on public.post_reactions;
drop policy if exists "Users can add own reactions" on public.post_reactions;
drop policy if exists "Users can remove own reactions" on public.post_reactions;

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

create policy "Users can remove own reactions"
on public.post_reactions
for delete
to authenticated
using (auth.uid() = user_id);

-- 5) Let PostgREST pick up the new column/policies immediately -----------------------------------

notify pgrst, 'reload schema';
