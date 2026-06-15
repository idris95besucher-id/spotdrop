-- Add app language preference to profiles (safe to re-run).

alter table if exists public.profiles
  add column if not exists language text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_language_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_language_check
      check (language is null or language in ('en', 'ru', 'de'));
  end if;
end $$;
