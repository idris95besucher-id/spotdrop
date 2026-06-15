-- Live voice rooms for city rooms (safe to re-run).

create table if not exists public.city_voice_rooms (
  id uuid primary key default gen_random_uuid(),
  country_slug text not null,
  city_slug text not null,
  host_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'ended')),
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create index if not exists idx_city_voice_rooms_city_status
  on public.city_voice_rooms (country_slug, city_slug, status);

create unique index if not exists idx_city_voice_rooms_one_active
  on public.city_voice_rooms (country_slug, city_slug)
  where status = 'active';

create table if not exists public.city_voice_participants (
  id uuid primary key default gen_random_uuid(),
  voice_room_id uuid not null references public.city_voice_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('host', 'speaker', 'listener')),
  joined_at timestamptz not null default now(),
  left_at timestamptz
);

create index if not exists idx_city_voice_participants_room_active
  on public.city_voice_participants (voice_room_id, left_at);

create unique index if not exists idx_city_voice_participants_one_active
  on public.city_voice_participants (voice_room_id, user_id)
  where left_at is null;

alter table public.city_voice_rooms enable row level security;
alter table public.city_voice_participants enable row level security;

drop policy if exists "Authenticated users can read city voice rooms" on public.city_voice_rooms;
create policy "Authenticated users can read city voice rooms"
on public.city_voice_rooms for select
to authenticated
using (true);

drop policy if exists "Authenticated users can start city voice rooms" on public.city_voice_rooms;
create policy "Authenticated users can start city voice rooms"
on public.city_voice_rooms for insert
to authenticated
with check (auth.uid() = host_id and status = 'active');

drop policy if exists "Host can end city voice room" on public.city_voice_rooms;
create policy "Host can end city voice room"
on public.city_voice_rooms for update
to authenticated
using (auth.uid() = host_id)
with check (auth.uid() = host_id);

drop policy if exists "Authenticated users can read city voice participants" on public.city_voice_participants;
create policy "Authenticated users can read city voice participants"
on public.city_voice_participants for select
to authenticated
using (true);

drop policy if exists "Authenticated users can join city voice rooms" on public.city_voice_participants;
create policy "Authenticated users can join city voice rooms"
on public.city_voice_participants for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own voice participation" on public.city_voice_participants;
create policy "Users can update own voice participation"
on public.city_voice_participants for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

do $$
begin
  alter publication supabase_realtime add table public.city_voice_rooms;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.city_voice_participants;
exception
  when duplicate_object then null;
end $$;
