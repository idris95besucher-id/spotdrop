-- Channel creation permissions (run in Supabase SQL editor)

alter table public.profiles
  add column if not exists can_create_channels boolean not null default false;

alter table public.profiles
  add column if not exists is_verified boolean not null default false;

update public.profiles
set can_create_channels = false
where can_create_channels is null;

update public.profiles
set is_verified = false
where is_verified is null;

alter table public.profiles
  alter column can_create_channels set default false,
  alter column can_create_channels set not null;

alter table public.profiles
  alter column is_verified set default false,
  alter column is_verified set not null;

create or replace function public.prevent_profile_permission_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() = new.id
    and coalesce(auth.role(), '') <> 'service_role'
    and (
      new.can_create_channels is distinct from old.can_create_channels
      or new.is_verified is distinct from old.is_verified
    )
  then
    raise exception 'Channel creation permissions can only be changed by an administrator.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_profile_permission_self_update on public.profiles;
create trigger prevent_profile_permission_self_update
before update of can_create_channels, is_verified on public.profiles
for each row
execute function public.prevent_profile_permission_self_update();

alter table public.cities enable row level security;

drop policy if exists "Cities readable by authenticated users" on public.cities;
drop policy if exists "Verified users can create city channels" on public.cities;
drop policy if exists "Authenticated users can create city channels" on public.cities;

create policy "Cities readable by authenticated users"
on public.cities
for select
to authenticated
using (true);
