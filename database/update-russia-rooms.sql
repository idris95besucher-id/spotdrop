-- Safe Russia room migration: insert missing rooms only.
-- Does NOT delete cities, messages, channels, or touch profiles.city_id.
-- No ON CONFLICT — skips rows when slug already exists for Russia.

insert into cities (country_id, name, slug)
select c.id, v.name, v.slug
from countries c
cross join (values
  ('Chechen Republic', 'chechen-republic'),
  ('Dagestan', 'dagestan'),
  ('Ingushetia', 'ingushetia'),
  ('Krasnodar', 'krasnodar'),
  ('Moscow', 'moscow'),
  ('Saint Petersburg', 'saint-petersburg'),
  ('Tatarstan', 'tatarstan')
) as v(name, slug)
where c.slug = 'russia'
  and not exists (
    select 1
    from cities existing
    where existing.country_id = c.id
      and existing.slug = v.slug
  );

-- Verify target rooms (existing + newly inserted):
-- select name, slug from cities
-- where country_id = (select id from countries where slug = 'russia')
--   and slug in (
--     'chechen-republic',
--     'dagestan',
--     'ingushetia',
--     'tatarstan',
--     'moscow',
--     'saint-petersburg',
--     'krasnodar'
--   )
-- order by name;
