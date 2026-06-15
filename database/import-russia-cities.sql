-- Import missing Russia city/region rooms (safe — no deletes, no ON CONFLICT).
-- UI reads public.cities via app/rooms/[country]/page.tsx.
-- Skips any slug that already exists for Russia.

insert into cities (country_id, name, slug)
select c.id, v.name, v.slug
from countries c
cross join (values
  -- Republic / region rooms
  ('Chechen Republic', 'chechen-republic'),
  ('Dagestan', 'dagestan'),
  ('Ingushetia', 'ingushetia'),
  ('Tatarstan', 'tatarstan'),
  -- Major cities
  ('Astrakhan', 'astrakhan'),
  ('Barnaul', 'barnaul'),
  ('Irkutsk', 'irkutsk'),
  ('Kaliningrad', 'kaliningrad'),
  ('Khabarovsk', 'khabarovsk'),
  ('Kemerovo', 'kemerovo'),
  ('Krasnodar', 'krasnodar'),
  ('Murmansk', 'murmansk'),
  ('Ryazan', 'ryazan'),
  ('Samara', 'samara'),
  ('Saratov', 'saratov'),
  ('Sochi', 'sochi'),
  ('Tomsk', 'tomsk'),
  ('Tula', 'tula'),
  ('Tyumen', 'tyumen'),
  ('Vladivostok', 'vladivostok'),
  ('Yaroslavl', 'yaroslavl'),
  -- North Caucasus cities
  ('Cherkessk', 'cherkessk'),
  ('Grozny', 'grozny'),
  ('Magas', 'magas'),
  ('Makhachkala', 'makhachkala'),
  ('Maykop', 'maykop'),
  ('Nalchik', 'nalchik'),
  ('Nazran', 'nazran'),
  ('Pyatigorsk', 'pyatigorsk'),
  ('Stavropol', 'stavropol'),
  ('Vladikavkaz', 'vladikavkaz')
) as v(name, slug)
where c.slug = 'russia'
  and not exists (
    select 1
    from cities existing
    where existing.country_id = c.id
      and existing.slug = v.slug
  );

-- After running, verify:
-- select count(*) from cities
-- where country_id = (select id from countries where slug = 'russia');
--
-- select name, slug from cities
-- where country_id = (select id from countries where slug = 'russia')
-- order by name;
