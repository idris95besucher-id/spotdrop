-- Profile edit fields (run in Supabase SQL editor)

alter table public.profiles add column if not exists name text;
alter table public.profiles add column if not exists gender text;
alter table public.profiles add column if not exists city_slug text;

alter table public.profiles drop constraint if exists profiles_gender_check;
alter table public.profiles
  add constraint profiles_gender_check
  check (gender is null or gender in ('male', 'female', 'prefer_not_to_say'));
