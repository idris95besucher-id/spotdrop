-- Cyprus: 20 municipalities (2024 local government reform).
-- Safe to re-run — skips existing slugs; backfills geolocation on all Cyprus rows.

alter table if exists public.cities add column if not exists country_code text;
alter table if exists public.cities add column if not exists country_slug text;
alter table if exists public.cities add column if not exists latitude numeric;
alter table if exists public.cities add column if not exists longitude numeric;

do $$
begin
  alter table public.cities
    add constraint cities_country_id_slug_key unique (country_id, slug);
exception
  when duplicate_object then null;
end $$;

insert into public.cities (country_id, name, slug, country_code, country_slug, latitude, longitude)
select c.id, v.name, v.slug, 'CY', 'cyprus', v.latitude, v.longitude
from public.countries c
cross join (values
  ('Agia Napa', 'agia-napa', 34.9879, 33.9977),
  ('Akamas', 'akamas', 34.9167, 32.3500),
  ('Amathounta', 'amathounta', 34.7200, 33.1300),
  ('Aradippou', 'aradippou', 34.9477, 33.5881),
  ('Athienou', 'athienou', 35.0618, 33.5415),
  ('Dromolaxia-Meneou', 'dromolaxia-meneou', 34.8220, 33.5830),
  ('Ierokipia', 'ierokipia', 34.7500, 32.4167),
  ('Kourion', 'kourion', 34.6720, 32.8840),
  ('Lakatameia', 'lakatameia', 35.1131, 33.3133),
  ('Larnaca', 'larnaca', 34.9229, 33.6233),
  ('Latsia-Geri', 'latsia-geri', 35.1019, 33.3731),
  ('Lefkara', 'lefkara', 34.8689, 33.3042),
  ('Limassol', 'limassol', 34.6841, 33.0379),
  ('Nicosia', 'nicosia', 35.1753, 33.3642),
  ('Paphos', 'paphos', 34.7768, 32.4245),
  ('Paralimni-Deryneia', 'paralimni-deryneia', 35.0395, 33.9818),
  ('Polemidia', 'polemidia', 34.6932, 32.9976),
  ('Polis Chrysochous', 'polis-chrysochous', 35.0364, 32.4275),
  ('South Nicosia-Idalion', 'south-nicosia-idalion', 35.0200, 33.4100),
  ('Strovolos', 'strovolos', 35.1489, 33.3339)
) as v(name, slug, latitude, longitude)
where c.slug = 'cyprus'
on conflict (country_id, slug) do nothing;

update public.cities ci
set
  country_code = 'CY',
  country_slug = 'cyprus',
  latitude = v.latitude,
  longitude = v.longitude
from public.countries co
cross join (values
  ('agia-napa', 34.9879, 33.9977),
  ('akamas', 34.9167, 32.3500),
  ('amathounta', 34.7200, 33.1300),
  ('aradippou', 34.9477, 33.5881),
  ('athienou', 35.0618, 33.5415),
  ('dromolaxia-meneou', 34.8220, 33.5830),
  ('ierokipia', 34.7500, 32.4167),
  ('kourion', 34.6720, 32.8840),
  ('lakatameia', 35.1131, 33.3133),
  ('larnaca', 34.9229, 33.6233),
  ('latsia-geri', 35.1019, 33.3731),
  ('lefkara', 34.8689, 33.3042),
  ('limassol', 34.6841, 33.0379),
  ('nicosia', 35.1753, 33.3642),
  ('paphos', 34.7768, 32.4245),
  ('paralimni-deryneia', 35.0395, 33.9818),
  ('polemidia', 34.6932, 32.9976),
  ('polis-chrysochous', 35.0364, 32.4275),
  ('south-nicosia-idalion', 35.0200, 33.4100),
  ('strovolos', 35.1489, 33.3339)
) as v(slug, latitude, longitude)
where co.slug = 'cyprus'
  and ci.country_id = co.id
  and ci.slug = v.slug;

-- Verify:
-- select count(*) from cities
-- where country_id = (select id from countries where slug = 'cyprus');
