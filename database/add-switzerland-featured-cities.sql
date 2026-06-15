-- Add missing Switzerland canton/region and tourist room cities (safe — no deletes).
-- UI picker allowlist: lib/switzerlandRoomPicker.ts
-- Skips any slug that already exists for Switzerland.

insert into cities (country_id, name, slug)
select c.id, v.name, v.slug
from countries c
cross join (values
  -- Cantons / regions
  ('Aargau', 'aargau'),
  ('Appenzell', 'appenzell'),
  ('Graubünden', 'graubunden'),
  ('Jura', 'jura'),
  ('Schaffhausen', 'schaffhausen'),
  ('Schwyz', 'schwyz'),
  ('Ticino', 'ticino'),
  ('Thurgau', 'thurgau'),
  ('Valais', 'valais'),
  ('Vaud', 'vaud'),
  -- Tourist cities
  ('Davos', 'davos'),
  ('Grindelwald', 'grindelwald'),
  ('St. Moritz', 'st-moritz'),
  ('Zermatt', 'zermatt')
) as v(name, slug)
where c.slug = 'switzerland'
  and not exists (
    select 1
    from cities existing
    where existing.country_id = c.id
      and existing.slug = v.slug
  );
