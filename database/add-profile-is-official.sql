-- Official profile status (Stage 1 of SpotDrop Official).
--
-- Adds profiles.is_official, protected by the existing
-- prevent_profile_permission_self_update trigger (same mechanism already
-- guarding can_create_channels / is_verified — see database/schema.sql and
-- database/add-channel-creation-permissions.sql). This migration extends
-- that single existing function/trigger rather than creating a second one.
--
-- Safe to re-run.

alter table public.profiles
  add column if not exists is_official boolean not null default false;

update public.profiles
set is_official = false
where is_official is null;

alter table public.profiles
  alter column is_official set default false,
  alter column is_official set not null;

-- Extend the existing trust-badge guard to also cover is_official.
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
        or coalesce(new.is_official, false)
      )
    then
      raise exception 'Profile trust badges can only be changed by an administrator.';
    end if;

    if tg_op = 'UPDATE'
      and (
        new.can_create_channels is distinct from old.can_create_channels
        or new.is_verified is distinct from old.is_verified
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
before insert or update of can_create_channels, is_verified, is_official on public.profiles
for each row
execute function public.prevent_profile_permission_self_update();

-- Grant official status only to the existing "spotdrop" profile. All other
-- profiles keep is_official = false (the column default).
update public.profiles
set is_official = true
where username = 'spotdrop'
  and is_official is distinct from true;
