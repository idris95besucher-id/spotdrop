-- United States: major cities for Visit rooms.
-- Matches the live SpotDrop schema (probed via PostgREST):
--   countries: id, name, slug, emoji
--   cities: id, country_id, name, slug, country_code, country_slug, latitude, longitude
-- Pattern: same as Switzerland/Russia city inserts (join countries by slug + skip existing),
-- with optional city geo columns used by add-cities-*.sql migrations.
-- Idempotent — safe to re-run. Does not recreate constraints.

-- Ensure optional city geo columns exist (no-op when already present).
alter table if exists public.cities add column if not exists country_code text;
alter table if exists public.cities add column if not exists country_slug text;
alter table if exists public.cities add column if not exists latitude numeric;
alter table if exists public.cities add column if not exists longitude numeric;

-- Insert country only if missing (live countries has no `code` column).
insert into public.countries (name, slug, emoji)
select 'United States', 'united-states', '🇺🇸'
where not exists (
  select 1
  from public.countries
  where slug = 'united-states'
);

-- Keep the Visit flag correct if the row already existed with a placeholder emoji.
update public.countries
set
  name = 'United States',
  emoji = '🇺🇸'
where slug = 'united-states'
  and (
    name is distinct from 'United States'
    or emoji is distinct from '🇺🇸'
  );

-- Insert the 25 major cities (alphabetical). Skip slugs that already exist for the US.
insert into public.cities (country_id, name, slug, country_code, country_slug, latitude, longitude)
select c.id, v.name, v.slug, 'US', 'united-states', v.latitude, v.longitude
from public.countries c
cross join (values
  ('Atlanta', 'atlanta', 33.7490, -84.3880),
  ('Austin', 'austin', 30.2672, -97.7431),
  ('Boston', 'boston', 42.3601, -71.0589),
  ('Charlotte', 'charlotte', 35.2271, -80.8431),
  ('Chicago', 'chicago', 41.8781, -87.6298),
  ('Columbus', 'columbus', 39.9612, -82.9988),
  ('Dallas', 'dallas', 32.7767, -96.7970),
  ('Denver', 'denver', 39.7392, -104.9903),
  ('Houston', 'houston', 29.7604, -95.3698),
  ('Indianapolis', 'indianapolis', 39.7684, -86.1581),
  ('Jacksonville', 'jacksonville', 30.3322, -81.6557),
  ('Las Vegas', 'las-vegas', 36.1699, -115.1398),
  ('Los Angeles', 'los-angeles', 34.0522, -118.2437),
  ('Miami', 'miami', 25.7617, -80.1918),
  ('Nashville', 'nashville', 36.1627, -86.7816),
  ('New York', 'new-york', 40.7128, -74.0060),
  ('Philadelphia', 'philadelphia', 39.9526, -75.1652),
  ('Phoenix', 'phoenix', 33.4484, -112.0740),
  ('Portland', 'portland', 45.5152, -122.6784),
  ('San Antonio', 'san-antonio', 29.4241, -98.4936),
  ('San Diego', 'san-diego', 32.7157, -117.1611),
  ('San Francisco', 'san-francisco', 37.7749, -122.4194),
  ('San Jose', 'san-jose', 37.3382, -121.8863),
  ('Seattle', 'seattle', 47.6062, -122.3321),
  ('Washington, D.C.', 'washington-dc', 38.9072, -77.0369)
) as v(name, slug, latitude, longitude)
where c.slug = 'united-states'
  and not exists (
    select 1
    from public.cities existing
    where existing.country_id = c.id
      and existing.slug = v.slug
  );

-- Backfill geo fields on any pre-existing United States rows for these slugs.
update public.cities ci
set
  country_code = 'US',
  country_slug = 'united-states',
  latitude = v.latitude,
  longitude = v.longitude
from public.countries co
cross join (values
  ('atlanta', 33.7490, -84.3880),
  ('austin', 30.2672, -97.7431),
  ('boston', 42.3601, -71.0589),
  ('charlotte', 35.2271, -80.8431),
  ('chicago', 41.8781, -87.6298),
  ('columbus', 39.9612, -82.9988),
  ('dallas', 32.7767, -96.7970),
  ('denver', 39.7392, -104.9903),
  ('houston', 29.7604, -95.3698),
  ('indianapolis', 39.7684, -86.1581),
  ('jacksonville', 30.3322, -81.6557),
  ('las-vegas', 36.1699, -115.1398),
  ('los-angeles', 34.0522, -118.2437),
  ('miami', 25.7617, -80.1918),
  ('nashville', 36.1627, -86.7816),
  ('new-york', 40.7128, -74.0060),
  ('philadelphia', 39.9526, -75.1652),
  ('phoenix', 33.4484, -112.0740),
  ('portland', 45.5152, -122.6784),
  ('san-antonio', 29.4241, -98.4936),
  ('san-diego', 32.7157, -117.1611),
  ('san-francisco', 37.7749, -122.4194),
  ('san-jose', 37.3382, -121.8863),
  ('seattle', 47.6062, -122.3321),
  ('washington-dc', 38.9072, -77.0369)
) as v(slug, latitude, longitude)
where co.slug = 'united-states'
  and ci.country_id = co.id
  and ci.slug = v.slug;

-- Verification (expect country row + 25 cities):
select
  co.name as country_name,
  co.slug as country_slug,
  co.emoji,
  count(ci.id) as city_count
from public.countries co
left join public.cities ci on ci.country_id = co.id
where co.slug = 'united-states'
group by co.id, co.name, co.slug, co.emoji;

select ci.name, ci.slug, ci.latitude, ci.longitude
from public.cities ci
join public.countries co on co.id = ci.country_id
where co.slug = 'united-states'
order by ci.name;
