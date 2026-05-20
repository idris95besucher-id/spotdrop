-- Stories: 24h profile highlights, archive, optional map/city sharing

create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  city_id uuid references public.cities(id) on delete set null,
  place_id uuid references public.discovery_places(id) on delete set null,
  media_url text not null,
  media_type text not null check (media_type in ('image', 'video')),
  caption text not null default '',
  visibility text not null default 'public' check (visibility in ('public', 'friends', 'private')),
  shared_to_room boolean not null default false,
  expires_at timestamptz not null,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_stories_user_active on public.stories(user_id, expires_at desc);
create index if not exists idx_stories_place_history on public.stories(place_id, created_at desc) where place_id is not null;
create index if not exists idx_stories_city_history on public.stories(city_id, created_at desc) where city_id is not null;

alter table public.stories enable row level security;

drop policy if exists "Public stories readable" on public.stories;
create policy "Public stories readable"
on public.stories for select
to anon, authenticated
using (
  visibility = 'public'
  or user_id = auth.uid()
);

drop policy if exists "Users create own stories" on public.stories;
create policy "Users create own stories"
on public.stories for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Users update own stories" on public.stories;
create policy "Users update own stories"
on public.stories for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users delete own stories" on public.stories;
create policy "Users delete own stories"
on public.stories for delete
to authenticated
using (user_id = auth.uid());
