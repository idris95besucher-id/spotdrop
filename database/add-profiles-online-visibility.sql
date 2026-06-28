-- Who can see online / last seen status (safe to re-run).

alter table public.profiles
  add column if not exists online_visibility text not null default 'everyone';

alter table public.profiles
  drop constraint if exists profiles_online_visibility_check;

alter table public.profiles
  add constraint profiles_online_visibility_check
  check (online_visibility in ('nobody', 'friends', 'everyone'));

notify pgrst, 'reload schema';
