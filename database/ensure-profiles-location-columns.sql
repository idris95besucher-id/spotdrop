-- Confirmed present on production profiles:
--   country_slug text
--   city_slug text
--   city_id (matches public.cities.id)
-- Safe guards only; no type guesses for city_id.
alter table if exists public.profiles add column if not exists country_slug text;
alter table if exists public.profiles add column if not exists city_slug text;

create index if not exists idx_profiles_country_slug on public.profiles (country_slug);
create index if not exists idx_profiles_city_id on public.profiles (city_id);
