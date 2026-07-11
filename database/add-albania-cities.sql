-- Albania: all 61 official municipalities (bashki), Law No. 115/2014.
-- Safe to re-run — skips existing slugs; backfills geolocation on all Albania rows.

alter table if exists public.cities add column if not exists country_code text;
alter table if exists public.cities add column if not exists country_slug text;
alter table if exists public.cities add column if not exists latitude numeric;
alter table if exists public.cities add column if not exists longitude numeric;

-- Required for ON CONFLICT (country_id, slug). Safe if constraint already exists.
do $$
begin
  alter table public.cities
    add constraint cities_country_id_slug_key unique (country_id, slug);
exception
  when duplicate_object then null;
end $$;

insert into public.cities (country_id, name, slug, country_code, country_slug, latitude, longitude)
select c.id, v.name, v.slug, 'AL', 'albania', v.latitude, v.longitude
from public.countries c
cross join (values
  -- Alphabetical by name
  ('Belsh', 'belsh', 40.9830, 19.9170),
  ('Berat', 'berat', 40.7058, 19.9522),
  ('Bulqizë', 'bulqize', 41.4944, 20.2219),
  ('Cërrik', 'cerrik', 41.0333, 19.9833),
  ('Delvinë', 'delvine', 39.9511, 20.0978),
  ('Devoll', 'devoll', 40.6028, 20.6778),
  ('Dibër', 'diber', 41.5886, 20.2353),
  ('Dimal', 'dimal', 40.8756, 19.8167),
  ('Divjakë', 'divjake', 40.9961, 19.5297),
  ('Dropull', 'dropull', 39.8833, 20.1500),
  ('Durrës', 'durres', 41.3231, 19.4414),
  ('Elbasan', 'elbasan', 41.1125, 20.0822),
  ('Fier', 'fier', 40.7239, 19.5561),
  ('Finiq', 'finiq', 39.9167, 20.0500),
  ('Fushë-Arrëz', 'fushe-arrez', 42.0667, 20.0167),
  ('Gjirokastër', 'gjirokaster', 40.0758, 20.1389),
  ('Gramsh', 'gramsh', 40.8697, 20.1847),
  ('Has', 'has', 41.7042, 20.4556),
  ('Himarë', 'himare', 40.1017, 19.7447),
  ('Kamëz', 'kamez', 41.3814, 19.7603),
  ('Kavajë', 'kavaje', 41.1847, 19.5569),
  ('Këlcyrë', 'kelcyre', 40.3167, 20.1833),
  ('Klos', 'klos', 41.5069, 20.0867),
  ('Kolonjë', 'kolonje', 40.3375, 20.6792),
  ('Konispol', 'konispol', 39.8833, 20.1833),
  ('Korçë', 'korce', 40.6141, 20.7778),
  ('Krujë', 'kruje', 41.5097, 19.7928),
  ('Kuçovë', 'kucove', 40.8006, 19.9147),
  ('Kukës', 'kukes', 42.0769, 20.4219),
  ('Kurbin', 'kurbin', 41.6333, 19.7167),
  ('Lezhë', 'lezhe', 41.7836, 19.6436),
  ('Libohovë', 'libohove', 40.0333, 20.2667),
  ('Librazhd', 'librazhd', 41.1964, 20.3353),
  ('Lushnjë', 'lushnje', 40.9419, 19.7050),
  ('Maliq', 'maliq', 40.7058, 20.6997),
  ('Malësi e Madhe', 'malesi-e-madhe', 42.2081, 19.5189),
  ('Mallakastër', 'mallakaster', 40.5500, 19.7833),
  ('Mat', 'mat', 41.5947, 20.0167),
  ('Memaliaj', 'memaliaj', 40.3517, 19.9803),
  ('Mirditë', 'mirdite', 41.7667, 19.8833),
  ('Patos', 'patos', 40.6833, 19.6167),
  ('Peqin', 'peqin', 41.0461, 19.7511),
  ('Përmet', 'permet', 40.2333, 20.3500),
  ('Pogradec', 'pogradec', 40.9025, 20.6525),
  ('Poliçan', 'polican', 40.6122, 20.0983),
  ('Prrenjas', 'prrenjas', 41.0750, 20.1389),
  ('Pukë', 'puke', 42.0444, 19.8997),
  ('Pustec', 'pustec', 40.7833, 20.9167),
  ('Roskovec', 'roskovec', 40.7375, 19.7022),
  ('Rrogozhinë', 'rogozhine', 41.0764, 19.6653),
  ('Sarandë', 'sarande', 39.8747, 20.0067),
  ('Selenicë', 'selenice', 40.5306, 19.6358),
  ('Shijak', 'shijak', 41.3456, 19.5672),
  ('Shkodër', 'shkoder', 42.0683, 19.5125),
  ('Skrapar', 'skrapar', 40.5047, 20.1847),
  ('Tepelenë', 'tepelene', 40.2958, 20.0189),
  ('Tirana', 'tirana', 41.3275, 19.8189),
  ('Tropojë', 'tropoje', 42.3594, 20.0794),
  ('Vau i Dejës', 'vau-i-dejes', 42.0083, 19.6417),
  ('Vlorë', 'vlore', 40.4667, 19.4897),
  ('Vorë', 'vore', 41.3908, 19.6553)
) as v(name, slug, latitude, longitude)
where c.slug = 'albania'
on conflict (country_id, slug) do nothing;

-- Backfill country + coordinates on pre-existing Albania cities (e.g. Tirana, Durrës).
update public.cities ci
set
  country_code = 'AL',
  country_slug = 'albania',
  latitude = v.latitude,
  longitude = v.longitude
from public.countries co
cross join (values
  ('belsh', 40.9830, 19.9170),
  ('berat', 40.7058, 19.9522),
  ('bulqize', 41.4944, 20.2219),
  ('cerrik', 41.0333, 19.9833),
  ('delvine', 39.9511, 20.0978),
  ('devoll', 40.6028, 20.6778),
  ('diber', 41.5886, 20.2353),
  ('dimal', 40.8756, 19.8167),
  ('divjake', 40.9961, 19.5297),
  ('dropull', 39.8833, 20.1500),
  ('durres', 41.3231, 19.4414),
  ('elbasan', 41.1125, 20.0822),
  ('fier', 40.7239, 19.5561),
  ('finiq', 39.9167, 20.0500),
  ('fushe-arrez', 42.0667, 20.0167),
  ('gjirokaster', 40.0758, 20.1389),
  ('gramsh', 40.8697, 20.1847),
  ('has', 41.7042, 20.4556),
  ('himare', 40.1017, 19.7447),
  ('kamez', 41.3814, 19.7603),
  ('kavaje', 41.1847, 19.5569),
  ('kelcyre', 40.3167, 20.1833),
  ('klos', 41.5069, 20.0867),
  ('kolonje', 40.3375, 20.6792),
  ('konispol', 39.8833, 20.1833),
  ('korce', 40.6141, 20.7778),
  ('kruje', 41.5097, 19.7928),
  ('kucove', 40.8006, 19.9147),
  ('kukes', 42.0769, 20.4219),
  ('kurbin', 41.6333, 19.7167),
  ('lezhe', 41.7836, 19.6436),
  ('libohove', 40.0333, 20.2667),
  ('librazhd', 41.1964, 20.3353),
  ('lushnje', 40.9419, 19.7050),
  ('maliq', 40.7058, 20.6997),
  ('malesi-e-madhe', 42.2081, 19.5189),
  ('mallakaster', 40.5500, 19.7833),
  ('mat', 41.5947, 20.0167),
  ('memaliaj', 40.3517, 19.9803),
  ('mirdite', 41.7667, 19.8833),
  ('patos', 40.6833, 19.6167),
  ('peqin', 41.0461, 19.7511),
  ('permet', 40.2333, 20.3500),
  ('pogradec', 40.9025, 20.6525),
  ('polican', 40.6122, 20.0983),
  ('prrenjas', 41.0750, 20.1389),
  ('puke', 42.0444, 19.8997),
  ('pustec', 40.7833, 20.9167),
  ('roskovec', 40.7375, 19.7022),
  ('rogozhine', 41.0764, 19.6653),
  ('sarande', 39.8747, 20.0067),
  ('selenice', 40.5306, 19.6358),
  ('shijak', 41.3456, 19.5672),
  ('shkoder', 42.0683, 19.5125),
  ('skrapar', 40.5047, 20.1847),
  ('tepelene', 40.2958, 20.0189),
  ('tirana', 41.3275, 19.8189),
  ('tropoje', 42.3594, 20.0794),
  ('vau-i-dejes', 42.0083, 19.6417),
  ('vlore', 40.4667, 19.4897),
  ('vore', 41.3908, 19.6553)
) as v(slug, latitude, longitude)
where co.slug = 'albania'
  and ci.country_id = co.id
  and ci.slug = v.slug;

-- Verify (expect 61):
-- select count(*) from cities
-- where country_id = (select id from countries where slug = 'albania');
--
-- select name, slug, latitude, longitude from cities
-- where country_id = (select id from countries where slug = 'albania')
-- order by name;
