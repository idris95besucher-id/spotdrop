-- Personal spot collections (organize public discovery spots)
--
-- Requires: public.posts.id is bigint (SpotDrop production schema).
-- collections.id and collection_spots.collection_id are uuid.

-- Remove partial/failed runs (collection_spots may have been created with post_id uuid)
drop table if exists public.collection_members cascade;
drop table if exists public.collection_spots cascade;

create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  visibility text not null default 'private'
    check (visibility in ('public', 'friends', 'invite', 'private')),
  cover_image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_collections_user_id on public.collections(user_id);
create index if not exists idx_collections_visibility on public.collections(visibility);

create table if not exists public.collection_spots (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections(id) on delete cascade,
  post_id bigint not null references public.posts(id) on delete cascade,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (collection_id, post_id)
);

create index if not exists idx_collection_spots_collection on public.collection_spots(collection_id);
create index if not exists idx_collection_spots_post on public.collection_spots(post_id);

create table if not exists public.collection_members (
  collection_id uuid not null references public.collections(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (collection_id, user_id)
);

alter table public.collections enable row level security;
alter table public.collection_spots enable row level security;
alter table public.collection_members enable row level security;

drop policy if exists "Collections readable by owner" on public.collections;
create policy "Collections readable by owner"
on public.collections for select
using (auth.uid() = user_id);

drop policy if exists "Collections readable when public" on public.collections;
create policy "Collections readable when public"
on public.collections for select
using (visibility = 'public');

drop policy if exists "Collections insert own" on public.collections;
create policy "Collections insert own"
on public.collections for insert
with check (auth.uid() = user_id);

drop policy if exists "Collections update own" on public.collections;
create policy "Collections update own"
on public.collections for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Collections delete own" on public.collections;
create policy "Collections delete own"
on public.collections for delete
using (auth.uid() = user_id);

drop policy if exists "Collection spots readable" on public.collection_spots;
create policy "Collection spots readable"
on public.collection_spots for select
using (
  exists (
    select 1 from public.collections c
    where c.id = collection_spots.collection_id
      and (
        c.user_id = auth.uid()
        or c.visibility = 'public'
      )
  )
);

-- Explore: never expose non-public collections (defense in depth; app also filters visibility = 'public')
drop policy if exists "Collections readable friends or invite" on public.collections;

drop policy if exists "Collection spots insert own collection" on public.collection_spots;
create policy "Collection spots insert own collection"
on public.collection_spots for insert
with check (
  exists (
    select 1 from public.collections c
    where c.id = collection_spots.collection_id
      and c.user_id = auth.uid()
  )
);

drop policy if exists "Collection spots delete own collection" on public.collection_spots;
create policy "Collection spots delete own collection"
on public.collection_spots for delete
using (
  exists (
    select 1 from public.collections c
    where c.id = collection_spots.collection_id
      and c.user_id = auth.uid()
  )
);

drop policy if exists "Collection members readable" on public.collection_members;
create policy "Collection members readable"
on public.collection_members for select
using (
  exists (
    select 1 from public.collections c
    where c.id = collection_members.collection_id
      and c.user_id = auth.uid()
  )
  or user_id = auth.uid()
);

drop policy if exists "Collection members insert owner" on public.collection_members;
create policy "Collection members insert owner"
on public.collection_members for insert
with check (
  exists (
    select 1 from public.collections c
    where c.id = collection_members.collection_id
      and c.user_id = auth.uid()
  )
);
