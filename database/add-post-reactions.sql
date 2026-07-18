-- Post reactions: like + useful (run in Supabase SQL editor)
--
-- Real schema (confirmed against this file and database/schema.sql): public.post_reactions has
-- exactly id (bigint identity, PK), post_id (uuid, FK -> posts.id), user_id (uuid, FK ->
-- profiles.id), reaction_type (text, checked 'like'/'useful'), created_at (timestamptz).
-- There is no table named "posts_reactions" (plural) anywhere in this schema.

create table if not exists public.post_reactions (
  id bigint generated always as identity primary key,
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction_type text not null check (reaction_type in ('like', 'useful')),
  created_at timestamp with time zone default now()
);

-- Keep existing databases on the same column name as the app code.
-- Older copies may have created this column as "type"; migrate it to reaction_type.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'post_reactions'
      and column_name = 'type'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'post_reactions'
      and column_name = 'reaction_type'
  ) then
    alter table public.post_reactions rename column "type" to reaction_type;
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'post_reactions'
      and column_name = 'type'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'post_reactions'
      and column_name = 'reaction_type'
  ) then
    update public.post_reactions
    set reaction_type = coalesce(reaction_type, "type")
    where reaction_type is null;

    alter table public.post_reactions drop column "type";
  end if;
end $$;

alter table public.post_reactions add column if not exists reaction_type text;
delete from public.post_reactions where reaction_type is null;
alter table public.post_reactions alter column reaction_type set not null;
alter table public.post_reactions drop constraint if exists post_reactions_reaction_type_check;
alter table public.post_reactions
  add constraint post_reactions_reaction_type_check
  check (reaction_type in ('like', 'useful'));

-- Drop any uniqueness enforcer a previous (possibly partially-failed) run of this migration may
-- have left behind, whether it ended up as a table constraint or a plain index, under either the
-- current name or the older "..._type_key" name from before the type -> reaction_type rename.
-- This is what makes step 5 below safe to run repeatedly.
alter table public.post_reactions drop constraint if exists post_reactions_post_id_user_id_type_key;
alter table public.post_reactions drop constraint if exists post_reactions_post_id_user_id_reaction_type_key;
drop index if exists public.post_reactions_post_id_user_id_type_key;
drop index if exists public.post_reactions_post_id_user_id_reaction_type_key;
drop index if exists public.idx_post_reactions_unique_post_user_reaction;

-- Deduplicate before enforcing uniqueness. This table can already contain more than one row for
-- the same (post_id, user_id, reaction_type) — e.g. from before this constraint existed, or a
-- race between two concurrent inserts — which is exactly why "create unique index/constraint"
-- previously failed with 23505 ("could not create unique index ... Key (post_id, user_id,
-- reaction_type) is duplicated"). For every duplicate group, rank rows oldest-first by
-- created_at, then by id as a stable tie-breaker (covers equal or NULL created_at values), keep
-- only the oldest (row_number = 1), and delete the rest. The PARTITION BY scopes this strictly
-- within each exact (post_id, user_id, reaction_type) group, so a row is only ever deleted in
-- favor of another row from the *same* user, the *same* post, and the *same* reaction type —
-- never across different users or posts.
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

-- Safe to re-run: only creates the index if it isn't already there (and step above already
-- guarantees no duplicate keys remain, so this can never fail with 23505 again).
create unique index if not exists idx_post_reactions_unique_post_user_reaction
  on public.post_reactions (post_id, user_id, reaction_type);

create index if not exists idx_post_reactions_post_id on public.post_reactions(post_id);

alter table public.post_reactions enable row level security;

drop policy if exists "Post reactions readable" on public.post_reactions;
drop policy if exists "Users can add own reactions" on public.post_reactions;
drop policy if exists "Users can remove own reactions" on public.post_reactions;

create policy "Post reactions readable"
on public.post_reactions
for select
to authenticated
using (true);

create policy "Users can add own reactions"
on public.post_reactions
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can remove own reactions"
on public.post_reactions
for delete
to authenticated
using (auth.uid() = user_id);
