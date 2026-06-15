-- Who can send direct messages / CheckSpot / Send Spot (safe to re-run).

alter table public.profiles
  add column if not exists message_privacy text not null default 'everyone';

alter table public.profiles
  drop constraint if exists profiles_message_privacy_check;

alter table public.profiles
  add constraint profiles_message_privacy_check
  check (message_privacy in ('everyone', 'followers', 'friends', 'nobody'));

notify pgrst, 'reload schema';
