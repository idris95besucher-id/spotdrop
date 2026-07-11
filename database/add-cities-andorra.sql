-- Andorra: all 7 official parishes (parròquies).
-- Safe to re-run — skips existing slugs; backfills geolocation on all Andorra rows.

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
select c.id, v.name, v.slug, 'AD', 'andorra', v.latitude, v.longitude
from public.countries c
cross join (values
  ('Andorra la Vella', 'andorra-la-vella', 42.5078, 1.5211),
  ('Canillo', 'canillo', 42.5677, 1.5976),
  ('Encamp', 'encamp', 42.5347, 1.5801),
  ('Escaldes-Engordany', 'escaldes-engordany', 42.5078, 1.5341),
  ('La Massana', 'la-massana', 42.5450, 1.5148),
  ('Ordino', 'ordino', 42.5562, 1.5332),
  ('Sant Julià de Lòria', 'sant-julia-de-loria', 42.4637, 1.4913)
) as v(name, slug, latitude, longitude)
where c.slug = 'andorra'
on conflict (country_id, slug) do nothing;

update public.cities ci
set
  country_code = 'AD',
  country_slug = 'andorra',
  latitude = v.latitude,
  longitude = v.longitude
from public.countries co
cross join (values
  ('andorra-la-vella', 42.5078, 1.5211),
  ('canillo', 42.5677, 1.5976),
  ('encamp', 42.5347, 1.5801),
  ('escaldes-engordany', 42.5078, 1.5341),
  ('la-massana', 42.5450, 1.5148),
  ('ordino', 42.5562, 1.5332),
  ('sant-julia-de-loria', 42.4637, 1.4913)
) as v(slug, latitude, longitude)
where co.slug = 'andorra'
  and ci.country_id = co.id
  and ci.slug = v.slug;

-- Verify:
-- select count(*) from cities
-- where country_id = (select id from countries where slug = 'andorra');
