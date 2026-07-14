-- Global Map Mark → region room auto-share.
-- REQUIRED: run in Supabase SQL editor. Replaces Switzerland-only sharing.
-- Do NOT run database/add-map-mark-swiss-room-share.sql.
-- Safe to re-run (idempotent).
-- Generated from lib/regionRoomMappings.ts — regenerate via:
--   npx --yes tsx scripts/generate-region-room-share-sql.ts

-- 1) Mark routing metadata
alter table if exists public.map_marks add column if not exists category text;
alter table if exists public.map_marks add column if not exists municipality text;
alter table if exists public.map_marks add column if not exists region_code text;
alter table if exists public.map_marks add column if not exists region_name text;
alter table if exists public.map_marks add column if not exists country_slug text;
alter table if exists public.map_marks add column if not exists country_code text;
alter table if exists public.map_marks add column if not exists hub_city_slug text;
-- Legacy Swiss column names (kept for older clients / rows)
alter table if exists public.map_marks add column if not exists canton_code text;
alter table if exists public.map_marks add column if not exists canton_name text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'map_marks_category_check'
      and conrelid = 'public.map_marks'::regclass
  ) then
    alter table public.map_marks
      add constraint map_marks_category_check
      check (
        category is null or category in (
          'traffic', 'road_closed', 'police', 'parking', 'danger',
          'event', 'viewpoint', 'restaurant', 'cafe', 'question', 'general'
        )
      );
  end if;
end $$;

update public.map_marks set category = 'general' where category is null;
alter table public.map_marks alter column category set default 'general';

create index if not exists idx_map_marks_category on public.map_marks (category);
create index if not exists idx_map_marks_region_code on public.map_marks (region_code);
create index if not exists idx_map_marks_country_slug on public.map_marks (country_slug);

-- 2) Unique link room message → mark
alter table if exists public.city_messages add column if not exists map_mark_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'city_messages_map_mark_id_fkey'
      and conrelid = 'public.city_messages'::regclass
  ) then
    alter table public.city_messages
      add constraint city_messages_map_mark_id_fkey
      foreign key (map_mark_id) references public.map_marks(id) on delete cascade;
  end if;
exception when duplicate_object then null;
end $$;

create unique index if not exists idx_city_messages_map_mark_id_unique
  on public.city_messages (map_mark_id) where map_mark_id is not null;
create index if not exists idx_city_messages_map_mark_id
  on public.city_messages (map_mark_id) where map_mark_id is not null;

-- 3) Global mapping table
create table if not exists public.region_room_mappings (
  id uuid primary key default gen_random_uuid(),
  country_slug text not null,
  country_code text not null,
  subdivision_code text not null,
  region_name text not null,
  room_city_slug text not null,
  created_at timestamptz not null default now(),
  unique (country_slug, subdivision_code)
);

create index if not exists idx_region_room_mappings_country
  on public.region_room_mappings (country_slug);
create index if not exists idx_region_room_mappings_subdivision
  on public.region_room_mappings (subdivision_code);

alter table public.region_room_mappings enable row level security;
drop policy if exists "Authenticated users can read region room mappings" on public.region_room_mappings;
create policy "Authenticated users can read region room mappings"
on public.region_room_mappings for select to authenticated using (true);
grant select on table public.region_room_mappings to authenticated;

-- Ensure countries that may be missing on older DBs
do $$
begin
  if not exists (select 1 from public.countries where slug = 'united-states') then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'countries' and column_name = 'code'
    ) then
      insert into public.countries (name, code, slug, emoji)
      values ('United States', 'US', 'united-states', '🇺🇸');
    else
      insert into public.countries (name, slug, emoji)
      values ('United States', 'united-states', '🇺🇸');
    end if;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from public.countries where slug = 'canada') then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'countries' and column_name = 'code'
    ) then
      insert into public.countries (name, code, slug, emoji)
      values ('Canada', 'CA', 'canada', '🇨🇦');
    else
      insert into public.countries (name, slug, emoji)
      values ('Canada', 'canada', '🇨🇦');
    end if;
  end if;
end $$;

-- 4) Ensure regional hub city rooms exist (no duplicates)
insert into public.cities (country_id, name, slug)
select c.id, v.name, v.slug
from (
  values
  ('united-states', 'California', 'california'),
  ('united-states', 'Alabama', 'alabama'),
  ('united-states', 'Alaska', 'alaska'),
  ('united-states', 'Arkansas', 'arkansas'),
  ('united-states', 'Connecticut', 'connecticut'),
  ('united-states', 'Delaware', 'delaware'),
  ('united-states', 'Hawaii', 'hawaii'),
  ('united-states', 'Idaho', 'idaho'),
  ('united-states', 'Iowa', 'iowa'),
  ('united-states', 'Kansas', 'kansas'),
  ('united-states', 'Kentucky', 'kentucky'),
  ('united-states', 'Louisiana', 'louisiana'),
  ('united-states', 'Maine', 'maine'),
  ('united-states', 'Maryland', 'maryland'),
  ('united-states', 'Michigan', 'michigan'),
  ('united-states', 'Minnesota', 'minnesota'),
  ('united-states', 'Mississippi', 'mississippi'),
  ('united-states', 'Missouri', 'missouri'),
  ('united-states', 'Montana', 'montana'),
  ('united-states', 'Nebraska', 'nebraska'),
  ('united-states', 'New Hampshire', 'new-hampshire'),
  ('united-states', 'New Jersey', 'new-jersey'),
  ('united-states', 'New Mexico', 'new-mexico'),
  ('united-states', 'North Dakota', 'north-dakota'),
  ('united-states', 'Oklahoma', 'oklahoma'),
  ('united-states', 'Rhode Island', 'rhode-island'),
  ('united-states', 'South Carolina', 'south-carolina'),
  ('united-states', 'South Dakota', 'south-dakota'),
  ('united-states', 'Utah', 'utah'),
  ('united-states', 'Vermont', 'vermont'),
  ('united-states', 'Virginia', 'virginia'),
  ('united-states', 'West Virginia', 'west-virginia'),
  ('united-states', 'Wisconsin', 'wisconsin'),
  ('united-states', 'Wyoming', 'wyoming'),
  ('germany', 'Bayern', 'bayern'),
  ('germany', 'Rheinland-Pfalz', 'rheinland-pfalz'),
  ('germany', 'Saarland', 'saarland'),
  ('germany', 'Sachsen-Anhalt', 'sachsen-anhalt'),
  ('germany', 'Thüringen', 'thuringen'),
  ('france', 'Provence-Alpes-Côte d''Azur', 'provence-alpes-cote-dazur'),
  ('france', 'Centre-Val de Loire', 'centre-val-de-loire'),
  ('france', 'Corse', 'corse'),
  ('france', 'Normandie', 'normandie'),
  ('italy', 'Lombardia', 'lombardia'),
  ('italy', 'Abruzzo', 'abruzzo'),
  ('italy', 'Basilicata', 'basilicata'),
  ('italy', 'Calabria', 'calabria'),
  ('italy', 'Marche', 'marche'),
  ('italy', 'Molise', 'molise'),
  ('italy', 'Sardegna', 'sardegna'),
  ('italy', 'Umbria', 'umbria'),
  ('italy', 'Trentino-Alto Adige', 'trentino-alto-adige'),
  ('italy', 'Valle d''Aosta', 'valle-daosta'),
  ('austria', 'Burgenland', 'burgenland'),
  ('austria', 'Niederösterreich', 'niederosterreich'),
  ('austria', 'Vorarlberg', 'vorarlberg'),
  ('spain', 'Asturias', 'asturias'),
  ('spain', 'Cantabria', 'cantabria'),
  ('spain', 'Castilla-La Mancha', 'castilla-la-mancha'),
  ('spain', 'Extremadura', 'extremadura'),
  ('spain', 'Navarra', 'navarra'),
  ('spain', 'La Rioja', 'la-rioja'),
  ('russia', 'Yekaterinburg', 'yekaterinburg'),
  ('canada', 'Alberta', 'alberta'),
  ('canada', 'British Columbia', 'british-columbia'),
  ('canada', 'Manitoba', 'manitoba'),
  ('canada', 'New Brunswick', 'new-brunswick'),
  ('canada', 'Newfoundland and Labrador', 'newfoundland-and-labrador'),
  ('canada', 'Nova Scotia', 'nova-scotia'),
  ('canada', 'Northwest Territories', 'northwest-territories'),
  ('canada', 'Nunavut', 'nunavut'),
  ('canada', 'Ontario', 'ontario'),
  ('canada', 'Prince Edward Island', 'prince-edward-island'),
  ('canada', 'Quebec', 'quebec'),
  ('canada', 'Saskatchewan', 'saskatchewan'),
  ('canada', 'Yukon', 'yukon')
) as v(country_slug, name, slug)
join public.countries c on c.slug = v.country_slug
where not exists (
  select 1 from public.cities existing
  where existing.country_id = c.id and existing.slug = v.slug
);

-- 5) Seed mappings
insert into public.region_room_mappings (country_slug, country_code, subdivision_code, region_name, room_city_slug)
values
  ('switzerland', 'CH', 'CH-AG', 'Aargau', 'aargau'),
  ('switzerland', 'CH', 'CH-AI', 'Appenzell Innerrhoden', 'appenzell'),
  ('switzerland', 'CH', 'CH-AR', 'Appenzell Ausserrhoden', 'appenzell'),
  ('switzerland', 'CH', 'CH-BE', 'Bern', 'bern'),
  ('switzerland', 'CH', 'CH-BL', 'Basel-Landschaft', 'basel'),
  ('switzerland', 'CH', 'CH-BS', 'Basel-Stadt', 'basel'),
  ('switzerland', 'CH', 'CH-FR', 'Fribourg', 'fribourg'),
  ('switzerland', 'CH', 'CH-GE', 'Geneva', 'geneva'),
  ('switzerland', 'CH', 'CH-GL', 'Glarus', 'schwyz'),
  ('switzerland', 'CH', 'CH-GR', 'Graubünden', 'chur'),
  ('switzerland', 'CH', 'CH-JU', 'Jura', 'jura'),
  ('switzerland', 'CH', 'CH-LU', 'Lucerne', 'lucerne'),
  ('switzerland', 'CH', 'CH-NE', 'Neuchâtel', 'neuchatel'),
  ('switzerland', 'CH', 'CH-NW', 'Nidwalden', 'lucerne'),
  ('switzerland', 'CH', 'CH-OW', 'Obwalden', 'lucerne'),
  ('switzerland', 'CH', 'CH-SG', 'St. Gallen', 'st-gallen'),
  ('switzerland', 'CH', 'CH-SH', 'Schaffhausen', 'schaffhausen'),
  ('switzerland', 'CH', 'CH-SO', 'Solothurn', 'basel'),
  ('switzerland', 'CH', 'CH-SZ', 'Schwyz', 'schwyz'),
  ('switzerland', 'CH', 'CH-TG', 'Thurgau', 'thurgau'),
  ('switzerland', 'CH', 'CH-TI', 'Ticino', 'lugano'),
  ('switzerland', 'CH', 'CH-UR', 'Uri', 'lucerne'),
  ('switzerland', 'CH', 'CH-VD', 'Vaud', 'lausanne'),
  ('switzerland', 'CH', 'CH-VS', 'Valais', 'sion'),
  ('switzerland', 'CH', 'CH-ZG', 'Zug', 'zug'),
  ('switzerland', 'CH', 'CH-ZH', 'Zurich', 'zurich'),
  ('united-states', 'US', 'US-AL', 'Alabama', 'alabama'),
  ('united-states', 'US', 'US-AK', 'Alaska', 'alaska'),
  ('united-states', 'US', 'US-AZ', 'Arizona', 'phoenix'),
  ('united-states', 'US', 'US-AR', 'Arkansas', 'arkansas'),
  ('united-states', 'US', 'US-CA', 'California', 'california'),
  ('united-states', 'US', 'US-CO', 'Colorado', 'denver'),
  ('united-states', 'US', 'US-CT', 'Connecticut', 'connecticut'),
  ('united-states', 'US', 'US-DE', 'Delaware', 'delaware'),
  ('united-states', 'US', 'US-DC', 'District of Columbia', 'washington-dc'),
  ('united-states', 'US', 'US-FL', 'Florida', 'miami'),
  ('united-states', 'US', 'US-GA', 'Georgia', 'atlanta'),
  ('united-states', 'US', 'US-HI', 'Hawaii', 'hawaii'),
  ('united-states', 'US', 'US-ID', 'Idaho', 'idaho'),
  ('united-states', 'US', 'US-IL', 'Illinois', 'chicago'),
  ('united-states', 'US', 'US-IN', 'Indiana', 'indianapolis'),
  ('united-states', 'US', 'US-IA', 'Iowa', 'iowa'),
  ('united-states', 'US', 'US-KS', 'Kansas', 'kansas'),
  ('united-states', 'US', 'US-KY', 'Kentucky', 'kentucky'),
  ('united-states', 'US', 'US-LA', 'Louisiana', 'louisiana'),
  ('united-states', 'US', 'US-ME', 'Maine', 'maine'),
  ('united-states', 'US', 'US-MD', 'Maryland', 'maryland'),
  ('united-states', 'US', 'US-MA', 'Massachusetts', 'boston'),
  ('united-states', 'US', 'US-MI', 'Michigan', 'michigan'),
  ('united-states', 'US', 'US-MN', 'Minnesota', 'minnesota'),
  ('united-states', 'US', 'US-MS', 'Mississippi', 'mississippi'),
  ('united-states', 'US', 'US-MO', 'Missouri', 'missouri'),
  ('united-states', 'US', 'US-MT', 'Montana', 'montana'),
  ('united-states', 'US', 'US-NE', 'Nebraska', 'nebraska'),
  ('united-states', 'US', 'US-NV', 'Nevada', 'las-vegas'),
  ('united-states', 'US', 'US-NH', 'New Hampshire', 'new-hampshire'),
  ('united-states', 'US', 'US-NJ', 'New Jersey', 'new-jersey'),
  ('united-states', 'US', 'US-NM', 'New Mexico', 'new-mexico'),
  ('united-states', 'US', 'US-NY', 'New York', 'new-york'),
  ('united-states', 'US', 'US-NC', 'North Carolina', 'charlotte'),
  ('united-states', 'US', 'US-ND', 'North Dakota', 'north-dakota'),
  ('united-states', 'US', 'US-OH', 'Ohio', 'columbus'),
  ('united-states', 'US', 'US-OK', 'Oklahoma', 'oklahoma'),
  ('united-states', 'US', 'US-OR', 'Oregon', 'portland'),
  ('united-states', 'US', 'US-PA', 'Pennsylvania', 'philadelphia'),
  ('united-states', 'US', 'US-RI', 'Rhode Island', 'rhode-island'),
  ('united-states', 'US', 'US-SC', 'South Carolina', 'south-carolina'),
  ('united-states', 'US', 'US-SD', 'South Dakota', 'south-dakota'),
  ('united-states', 'US', 'US-TN', 'Tennessee', 'nashville'),
  ('united-states', 'US', 'US-TX', 'Texas', 'houston'),
  ('united-states', 'US', 'US-UT', 'Utah', 'utah'),
  ('united-states', 'US', 'US-VT', 'Vermont', 'vermont'),
  ('united-states', 'US', 'US-VA', 'Virginia', 'virginia'),
  ('united-states', 'US', 'US-WA', 'Washington', 'seattle'),
  ('united-states', 'US', 'US-WV', 'West Virginia', 'west-virginia'),
  ('united-states', 'US', 'US-WI', 'Wisconsin', 'wisconsin'),
  ('united-states', 'US', 'US-WY', 'Wyoming', 'wyoming'),
  ('germany', 'DE', 'DE-BW', 'Baden-Württemberg', 'stuttgart'),
  ('germany', 'DE', 'DE-BY', 'Bayern', 'bayern'),
  ('germany', 'DE', 'DE-BE', 'Berlin', 'berlin'),
  ('germany', 'DE', 'DE-BB', 'Brandenburg', 'potsdam'),
  ('germany', 'DE', 'DE-HB', 'Bremen', 'bremen'),
  ('germany', 'DE', 'DE-HH', 'Hamburg', 'hamburg'),
  ('germany', 'DE', 'DE-HE', 'Hessen', 'frankfurt'),
  ('germany', 'DE', 'DE-MV', 'Mecklenburg-Vorpommern', 'rostock'),
  ('germany', 'DE', 'DE-NI', 'Niedersachsen', 'hanover'),
  ('germany', 'DE', 'DE-NW', 'Nordrhein-Westfalen', 'cologne'),
  ('germany', 'DE', 'DE-RP', 'Rheinland-Pfalz', 'rheinland-pfalz'),
  ('germany', 'DE', 'DE-SL', 'Saarland', 'saarland'),
  ('germany', 'DE', 'DE-SN', 'Sachsen', 'leipzig'),
  ('germany', 'DE', 'DE-ST', 'Sachsen-Anhalt', 'sachsen-anhalt'),
  ('germany', 'DE', 'DE-SH', 'Schleswig-Holstein', 'kiel'),
  ('germany', 'DE', 'DE-TH', 'Thüringen', 'thuringen'),
  ('france', 'FR', 'FR-ARA', 'Auvergne-Rhône-Alpes', 'lyon'),
  ('france', 'FR', 'FR-BFC', 'Bourgogne-Franche-Comté', 'dijon'),
  ('france', 'FR', 'FR-BRE', 'Bretagne', 'rennes'),
  ('france', 'FR', 'FR-CVL', 'Centre-Val de Loire', 'centre-val-de-loire'),
  ('france', 'FR', 'FR-20R', 'Corse', 'corse'),
  ('france', 'FR', 'FR-GES', 'Grand Est', 'strasbourg'),
  ('france', 'FR', 'FR-HDF', 'Hauts-de-France', 'lille'),
  ('france', 'FR', 'FR-IDF', 'Île-de-France', 'paris'),
  ('france', 'FR', 'FR-NOR', 'Normandie', 'normandie'),
  ('france', 'FR', 'FR-NAQ', 'Nouvelle-Aquitaine', 'bordeaux'),
  ('france', 'FR', 'FR-OCC', 'Occitanie', 'toulouse'),
  ('france', 'FR', 'FR-PDL', 'Pays de la Loire', 'nantes'),
  ('france', 'FR', 'FR-PAC', 'Provence-Alpes-Côte d''Azur', 'provence-alpes-cote-dazur'),
  ('italy', 'IT', 'IT-65', 'Abruzzo', 'abruzzo'),
  ('italy', 'IT', 'IT-77', 'Basilicata', 'basilicata'),
  ('italy', 'IT', 'IT-78', 'Calabria', 'calabria'),
  ('italy', 'IT', 'IT-72', 'Campania', 'naples'),
  ('italy', 'IT', 'IT-45', 'Emilia-Romagna', 'bologna'),
  ('italy', 'IT', 'IT-36', 'Friuli-Venezia Giulia', 'trieste'),
  ('italy', 'IT', 'IT-62', 'Lazio', 'rome'),
  ('italy', 'IT', 'IT-42', 'Liguria', 'genoa'),
  ('italy', 'IT', 'IT-25', 'Lombardia', 'lombardia'),
  ('italy', 'IT', 'IT-57', 'Marche', 'marche'),
  ('italy', 'IT', 'IT-67', 'Molise', 'molise'),
  ('italy', 'IT', 'IT-21', 'Piemonte', 'turin'),
  ('italy', 'IT', 'IT-75', 'Puglia', 'bari'),
  ('italy', 'IT', 'IT-88', 'Sardegna', 'sardegna'),
  ('italy', 'IT', 'IT-82', 'Sicilia', 'palermo'),
  ('italy', 'IT', 'IT-52', 'Toscana', 'florence'),
  ('italy', 'IT', 'IT-32', 'Trentino-Alto Adige', 'trentino-alto-adige'),
  ('italy', 'IT', 'IT-55', 'Umbria', 'umbria'),
  ('italy', 'IT', 'IT-23', 'Valle d''Aosta', 'valle-daosta'),
  ('italy', 'IT', 'IT-34', 'Veneto', 'venice'),
  ('austria', 'AT', 'AT-1', 'Burgenland', 'burgenland'),
  ('austria', 'AT', 'AT-2', 'Kärnten', 'klagenfurt'),
  ('austria', 'AT', 'AT-3', 'Niederösterreich', 'niederosterreich'),
  ('austria', 'AT', 'AT-4', 'Oberösterreich', 'linz'),
  ('austria', 'AT', 'AT-5', 'Salzburg', 'salzburg'),
  ('austria', 'AT', 'AT-6', 'Steiermark', 'graz'),
  ('austria', 'AT', 'AT-7', 'Tirol', 'innsbruck'),
  ('austria', 'AT', 'AT-8', 'Vorarlberg', 'vorarlberg'),
  ('austria', 'AT', 'AT-9', 'Wien', 'vienna'),
  ('spain', 'ES', 'ES-AN', 'Andalucía', 'seville'),
  ('spain', 'ES', 'ES-AR', 'Aragón', 'zaragoza'),
  ('spain', 'ES', 'ES-AS', 'Asturias', 'asturias'),
  ('spain', 'ES', 'ES-IB', 'Illes Balears', 'palma'),
  ('spain', 'ES', 'ES-CN', 'Canarias', 'las-palmas'),
  ('spain', 'ES', 'ES-CB', 'Cantabria', 'cantabria'),
  ('spain', 'ES', 'ES-CL', 'Castilla y León', 'salamanca'),
  ('spain', 'ES', 'ES-CM', 'Castilla-La Mancha', 'castilla-la-mancha'),
  ('spain', 'ES', 'ES-CT', 'Catalunya', 'barcelona'),
  ('spain', 'ES', 'ES-EX', 'Extremadura', 'extremadura'),
  ('spain', 'ES', 'ES-GA', 'Galicia', 'santiago-de-compostela'),
  ('spain', 'ES', 'ES-MD', 'Madrid', 'madrid'),
  ('spain', 'ES', 'ES-MC', 'Murcia', 'murcia'),
  ('spain', 'ES', 'ES-NC', 'Navarra', 'navarra'),
  ('spain', 'ES', 'ES-PV', 'País Vasco', 'bilbao'),
  ('spain', 'ES', 'ES-RI', 'La Rioja', 'la-rioja'),
  ('spain', 'ES', 'ES-VC', 'Comunitat Valenciana', 'valencia'),
  ('united-kingdom', 'GB', 'GB-ENG', 'England', 'london'),
  ('united-kingdom', 'GB', 'GB-SCT', 'Scotland', 'edinburgh'),
  ('united-kingdom', 'GB', 'GB-WLS', 'Wales', 'cardiff'),
  ('united-kingdom', 'GB', 'GB-NIR', 'Northern Ireland', 'belfast'),
  ('canada', 'CA', 'CA-AB', 'Alberta', 'alberta'),
  ('canada', 'CA', 'CA-BC', 'British Columbia', 'british-columbia'),
  ('canada', 'CA', 'CA-MB', 'Manitoba', 'manitoba'),
  ('canada', 'CA', 'CA-NB', 'New Brunswick', 'new-brunswick'),
  ('canada', 'CA', 'CA-NL', 'Newfoundland and Labrador', 'newfoundland-and-labrador'),
  ('canada', 'CA', 'CA-NS', 'Nova Scotia', 'nova-scotia'),
  ('canada', 'CA', 'CA-NT', 'Northwest Territories', 'northwest-territories'),
  ('canada', 'CA', 'CA-NU', 'Nunavut', 'nunavut'),
  ('canada', 'CA', 'CA-ON', 'Ontario', 'ontario'),
  ('canada', 'CA', 'CA-PE', 'Prince Edward Island', 'prince-edward-island'),
  ('canada', 'CA', 'CA-QC', 'Quebec', 'quebec'),
  ('canada', 'CA', 'CA-SK', 'Saskatchewan', 'saskatchewan'),
  ('canada', 'CA', 'CA-YT', 'Yukon', 'yukon'),
  ('russia', 'RU', 'RU-MOW', 'Moscow', 'moscow'),
  ('russia', 'RU', 'RU-SPE', 'Saint Petersburg', 'saint-petersburg'),
  ('russia', 'RU', 'RU-TA', 'Tatarstan', 'tatarstan'),
  ('russia', 'RU', 'RU-DA', 'Dagestan', 'dagestan'),
  ('russia', 'RU', 'RU-CE', 'Chechnya', 'chechen-republic'),
  ('russia', 'RU', 'RU-IN', 'Ingushetia', 'ingushetia'),
  ('russia', 'RU', 'RU-KDA', 'Krasnodar Krai', 'krasnodar'),
  ('russia', 'RU', 'RU-SAM', 'Samara Oblast', 'samara'),
  ('russia', 'RU', 'RU-SVE', 'Sverdlovsk Oblast', 'yekaterinburg')
on conflict (country_slug, subdivision_code) do update set
  country_code = excluded.country_code,
  region_name = excluded.region_name,
  room_city_slug = excluded.room_city_slug;

-- Drop legacy Swiss-only table if present
drop table if exists public.swiss_canton_room_hubs;

-- 6) Secure share RPC (mark_id only — room from mapping table)
create or replace function public.share_map_mark_to_region_room(p_mark_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_mark public.map_marks%rowtype;
  v_map public.region_room_mappings%rowtype;
  v_country_id public.countries.id%type;
  v_city_id public.cities.id%type;
  v_message_id uuid;
  v_content text;
  v_category text;
  v_place text;
  v_region_code text;
  v_country_slug text;
  v_hub_slug text;
  v_region_name text;
  v_country_name text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_mark_id is null then
    return null;
  end if;

  select id into v_message_id from public.city_messages where map_mark_id = p_mark_id limit 1;
  if v_message_id is not null then
    return v_message_id;
  end if;

  select * into v_mark from public.map_marks where id = p_mark_id;
  if not found then
    return null;
  end if;
  if v_mark.user_id is distinct from v_uid then
    raise exception 'Not mark owner';
  end if;

  v_region_code := upper(trim(coalesce(v_mark.region_code, v_mark.canton_code, '')));
  v_country_slug := lower(trim(coalesce(v_mark.country_slug, '')));
  v_hub_slug := nullif(trim(coalesce(v_mark.hub_city_slug, '')), '');
  v_region_name := nullif(trim(coalesce(v_mark.region_name, v_mark.canton_name, '')), '');

  if v_region_code = '' or v_country_slug = '' then
    return null;
  end if;

  select * into v_map
  from public.region_room_mappings
  where country_slug = v_country_slug
    and subdivision_code = v_region_code
  limit 1;

  if not found then
    return null;
  end if;

  -- Never trust client hub_city_slug — always use mapping table
  v_hub_slug := v_map.room_city_slug;
  v_region_name := coalesce(v_region_name, v_map.region_name);

  select c.id, c.name into v_country_id, v_country_name
  from public.countries c
  where c.slug = v_map.country_slug
  limit 1;
  if v_country_id is null then
    return null;
  end if;

  select ci.id into v_city_id
  from public.cities ci
  where ci.country_id = v_country_id and ci.slug = v_hub_slug
  limit 1;
  if v_city_id is null then
    return null;
  end if;

  v_category := coalesce(nullif(trim(v_mark.category), ''), 'general');
  v_place := coalesce(nullif(trim(v_mark.municipality), ''), nullif(trim(v_mark.place_name), ''), null);

  v_content := '[[spotdrop_map_mark]]' || jsonb_build_object(
    'v', 1,
    'mapMarkId', v_mark.id,
    'category', v_category,
    'text', v_mark.text,
    'photoUrl', v_mark.photo_url,
    'municipality', v_mark.municipality,
    'regionName', v_region_name,
    'cantonName', v_region_name,
    'countryName', coalesce(v_country_name, v_map.country_slug),
    'placeName', v_place,
    'latitude', v_mark.latitude,
    'longitude', v_mark.longitude
  )::text;

  begin
    perform set_config('app.allow_map_mark_share', 'on', true);
    insert into public.city_messages (city_id, user_id, content, map_mark_id)
    values (v_city_id, v_mark.user_id, v_content, v_mark.id)
    returning id into v_message_id;
  exception when unique_violation then
    select id into v_message_id from public.city_messages where map_mark_id = p_mark_id limit 1;
  end;

  return v_message_id;
end;
$$;

revoke all on function public.share_map_mark_to_region_room(uuid) from public;
grant execute on function public.share_map_mark_to_region_room(uuid) to authenticated;

-- Back-compat alias for older clients
create or replace function public.share_map_mark_to_swiss_canton_room(p_mark_id uuid)
returns uuid
language sql
security definer
set search_path = public
as $$
  select public.share_map_mark_to_region_room(p_mark_id);
$$;
revoke all on function public.share_map_mark_to_swiss_canton_room(uuid) from public;
grant execute on function public.share_map_mark_to_swiss_canton_room(uuid) to authenticated;

create or replace function public.enforce_city_message_map_mark_link()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.map_mark_id is null then
    return new;
  end if;
  if current_setting('app.allow_map_mark_share', true) is distinct from 'on' then
    raise exception 'map_mark_id can only be set by share_map_mark_to_region_room';
  end if;
  if new.user_id is distinct from (select m.user_id from public.map_marks m where m.id = new.map_mark_id) then
    raise exception 'map mark author mismatch';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_city_message_map_mark_link on public.city_messages;
create trigger trg_enforce_city_message_map_mark_link
before insert or update of map_mark_id on public.city_messages
for each row execute function public.enforce_city_message_map_mark_link();

create or replace function public.sync_city_message_for_map_mark()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_region text;
  v_place text;
  v_category text;
  v_content text;
  v_country_name text;
begin
  if tg_op = 'UPDATE' then
    v_region := coalesce(nullif(trim(new.region_name), ''), nullif(trim(new.canton_name), ''));
    v_category := coalesce(nullif(trim(new.category), ''), 'general');
    v_place := coalesce(nullif(trim(new.municipality), ''), nullif(trim(new.place_name), ''), null);
    select c.name into v_country_name
    from public.countries c
    where c.slug = new.country_slug
    limit 1;
    v_content := '[[spotdrop_map_mark]]' || jsonb_build_object(
      'v', 1,
      'mapMarkId', new.id,
      'category', v_category,
      'text', new.text,
      'photoUrl', new.photo_url,
      'municipality', new.municipality,
      'regionName', v_region,
      'cantonName', v_region,
      'countryName', coalesce(v_country_name, new.country_slug),
      'placeName', v_place,
      'latitude', new.latitude,
      'longitude', new.longitude
    )::text;
    update public.city_messages
    set content = v_content, edited_at = now()
    where map_mark_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_city_message_for_map_mark on public.map_marks;
create trigger trg_sync_city_message_for_map_mark
after update of text, photo_url, category, municipality, region_code, region_name, canton_code, canton_name, place_name, country_slug
on public.map_marks
for each row execute function public.sync_city_message_for_map_mark();

notify pgrst, 'reload schema';
