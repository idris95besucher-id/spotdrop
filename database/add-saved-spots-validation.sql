-- Saved tab (bookmarks) — reuses the existing public.spot_collection_saves table
-- (created in add-spot-ranking.sql, hardened in simplify-saved-posts.sql). No new join
-- table was created: this repo already has one, it is structurally correct, and this file
-- only (a) re-asserts its schema/RLS idempotently so it's guaranteed correct regardless of
-- what's actually live, and (b) adds one genuinely new piece: a DB-level check that the
-- post being saved is actually a Spot, which did not previously exist (only client-side
-- gating via the Save button only rendering on spot viewers).
--
-- Unrelated to "My Spots" (a user's own privately-published Spots) — that feature reads
-- directly from posts.visibility/published_to_spots and needs no table of its own; see
-- lib/mySpots.ts.
--
-- Safe to re-run.

-- 1) Table + indexes (idempotent — already created by add-spot-ranking.sql / simplify-saved-posts.sql)
create table if not exists public.spot_collection_saves (
  post_id bigint not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists idx_spot_collection_saves_post on public.spot_collection_saves(post_id);
create index if not exists idx_spot_collection_saves_user_created
  on public.spot_collection_saves (user_id, created_at desc);

-- 2) New — validate the referenced post is actually a Spot before it can be saved.
-- security definer so this check isn't itself gated by posts RLS (a save should be
-- rejected for "this isn't a Spot", not silently rejected because of an unrelated
-- visibility rule the trigger's invoker happens to be subject to).
create or replace function public.validate_spot_collection_save()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.posts
    where id = new.post_id
      and coalesce(content_kind, 'spot') = 'spot'
  ) then
    raise exception 'Only Spot posts can be saved.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_spot_collection_save on public.spot_collection_saves;
create trigger trg_validate_spot_collection_save
before insert on public.spot_collection_saves
for each row execute function public.validate_spot_collection_save();

-- 3) Strict RLS — only the owner can read/write their own saves (re-asserted idempotently;
-- this matches simplify-saved-posts.sql exactly, just guaranteed-current here too).
alter table public.spot_collection_saves enable row level security;

drop policy if exists "Spot collection saves readable" on public.spot_collection_saves;
drop policy if exists "Users read own spot saves" on public.spot_collection_saves;
drop policy if exists "Users insert own spot saves" on public.spot_collection_saves;
drop policy if exists "Users delete own spot saves" on public.spot_collection_saves;

create policy "Users read own spot saves"
on public.spot_collection_saves for select
to authenticated
using (auth.uid() = user_id);

create policy "Users insert own spot saves"
on public.spot_collection_saves for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users delete own spot saves"
on public.spot_collection_saves for delete
to authenticated
using (auth.uid() = user_id);

grant select, insert, delete on table public.spot_collection_saves to authenticated;

notify pgrst, 'reload schema';
