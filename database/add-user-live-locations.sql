-- Live map user locations (safe to re-run).

create table if not exists public.user_live_locations (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  city text,
  country text,
  is_live boolean not null default false,
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_live_locations_live_updated
  on public.user_live_locations (is_live, updated_at desc);

alter table public.user_live_locations enable row level security;

drop policy if exists "Authenticated users can read live locations" on public.user_live_locations;
create policy "Authenticated users can read live locations"
on public.user_live_locations for select
to authenticated
using (true);

drop policy if exists "Users can insert own live location" on public.user_live_locations;
create policy "Users can insert own live location"
on public.user_live_locations for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own live location" on public.user_live_locations;
create policy "Users can update own live location"
on public.user_live_locations for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own live location" on public.user_live_locations;
create policy "Users can delete own live location"
on public.user_live_locations for delete
to authenticated
using (auth.uid() = user_id);

grant select, insert, update, delete on table public.user_live_locations to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.user_live_locations;
exception
  when duplicate_object then null;
end $$;
