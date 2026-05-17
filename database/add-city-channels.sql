-- City channels (run in Supabase SQL editor)

create table if not exists public.city_channels (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(city_id, slug)
);

alter table public.city_channels add column if not exists city_id uuid references public.cities(id) on delete cascade;
alter table public.city_channels add column if not exists created_by uuid references public.profiles(id) on delete cascade;
alter table public.city_channels add column if not exists name text;
alter table public.city_channels add column if not exists slug text;
alter table public.city_channels add column if not exists description text;
alter table public.city_channels add column if not exists visibility text not null default 'public';
alter table public.city_channels add column if not exists created_at timestamptz not null default now();
alter table public.city_channels add column if not exists updated_at timestamptz not null default now();

alter table public.city_channels drop constraint if exists city_channels_visibility_check;
alter table public.city_channels
  add constraint city_channels_visibility_check
  check (visibility in ('public', 'private'));

alter table public.city_channels enable row level security;

drop policy if exists "City channels readable by authenticated users" on public.city_channels;
drop policy if exists "Authenticated users can create city channels" on public.city_channels;

create policy "City channels readable by authenticated users"
on public.city_channels
for select
to authenticated
using (auth.role() = 'authenticated');

create policy "Authenticated users can create city channels"
on public.city_channels
for insert
to authenticated
with check (auth.uid() = created_by);

create table if not exists public.city_channel_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.city_channels(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.city_channel_messages add column if not exists channel_id uuid references public.city_channels(id) on delete cascade;
alter table public.city_channel_messages add column if not exists user_id uuid references public.profiles(id) on delete cascade;
alter table public.city_channel_messages add column if not exists content text;
alter table public.city_channel_messages add column if not exists created_at timestamptz not null default now();

alter table public.city_channel_messages enable row level security;

drop policy if exists "City channel messages readable by authenticated users" on public.city_channel_messages;
drop policy if exists "Authenticated users can send city channel messages" on public.city_channel_messages;

create policy "City channel messages readable by authenticated users"
on public.city_channel_messages
for select
to authenticated
using (auth.role() = 'authenticated');

create policy "Authenticated users can send city channel messages"
on public.city_channel_messages
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Authenticated users can create city channels" on public.cities;
