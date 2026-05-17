-- Post reactions: like + useful (run in Supabase SQL editor)

create table if not exists public.post_reactions (
  id bigint generated always as identity primary key,
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction_type text not null check (reaction_type in ('like', 'useful')),
  created_at timestamp with time zone default now(),
  unique (post_id, user_id, reaction_type)
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

alter table public.post_reactions drop constraint if exists post_reactions_post_id_user_id_type_key;
alter table public.post_reactions drop constraint if exists post_reactions_post_id_user_id_reaction_type_key;
delete from public.post_reactions a
using public.post_reactions b
where a.id > b.id
  and a.post_id = b.post_id
  and a.user_id = b.user_id
  and a.reaction_type = b.reaction_type;
alter table public.post_reactions
  add constraint post_reactions_post_id_user_id_reaction_type_key
  unique (post_id, user_id, reaction_type);

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
