-- Adds official AI guide trust fields to profiles.
-- Run this before using the Bern guide seed script.

alter table if exists public.profiles add column if not exists is_ai_guide boolean not null default false;
alter table if exists public.profiles add column if not exists is_official boolean not null default false;

update public.profiles set is_ai_guide = false where is_ai_guide is null;
update public.profiles set is_official = false where is_official is null;

alter table if exists public.profiles alter column is_ai_guide set default false;
alter table if exists public.profiles alter column is_ai_guide set not null;
alter table if exists public.profiles alter column is_official set default false;
alter table if exists public.profiles alter column is_official set not null;

create or replace function public.prevent_profile_permission_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() = new.id and coalesce(auth.role(), '') <> 'service_role' then
    if tg_op = 'INSERT'
      and (
        coalesce(new.can_create_channels, false)
        or coalesce(new.is_verified, false)
        or coalesce(new.is_ai_guide, false)
        or coalesce(new.is_official, false)
      )
    then
      raise exception 'Profile trust badges can only be changed by an administrator.';
    end if;

    if tg_op = 'UPDATE'
      and (
        new.can_create_channels is distinct from old.can_create_channels
        or new.is_verified is distinct from old.is_verified
        or new.is_ai_guide is distinct from old.is_ai_guide
        or new.is_official is distinct from old.is_official
      )
    then
      raise exception 'Profile trust badges can only be changed by an administrator.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_profile_permission_self_update on public.profiles;
create trigger prevent_profile_permission_self_update
before insert or update of can_create_channels, is_verified, is_ai_guide, is_official on public.profiles
for each row
execute function public.prevent_profile_permission_self_update();
