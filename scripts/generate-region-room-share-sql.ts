/**
 * Regenerates database/add-map-mark-global-region-room-share.sql from the TS catalog.
 * Run: npx --yes tsx scripts/generate-region-room-share-sql.ts
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  REGION_HUB_ROOMS_TO_ENSURE,
  REGION_ROOM_MAPPINGS,
} from "../lib/regionRoomMappings";

function sqlString(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

const COUNTRIES_TO_ENSURE = [
  { slug: "united-states", name: "United States", code: "US", emoji: "🇺🇸" },
  { slug: "canada", name: "Canada", code: "CA", emoji: "🇨🇦" },
] as const;

const hubValues = REGION_HUB_ROOMS_TO_ENSURE.map(
  (row) =>
    `  (${sqlString(row.countrySlug)}, ${sqlString(row.name)}, ${sqlString(row.slug)})`
).join(",\n");

const mappingValues = REGION_ROOM_MAPPINGS.map(
  (row) =>
    `  (${sqlString(row.countrySlug)}, ${sqlString(row.countryCode)}, ${sqlString(row.subdivisionCode)}, ${sqlString(row.regionNameEn)}, ${sqlString(row.roomCitySlug)})`
).join(",\n");

const ensureCountryBlocks = COUNTRIES_TO_ENSURE.map(
  (c) => `do $$
begin
  if not exists (select 1 from public.countries where slug = ${sqlString(c.slug)}) then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'countries' and column_name = 'code'
    ) then
      insert into public.countries (name, code, slug, emoji)
      values (${sqlString(c.name)}, ${sqlString(c.code)}, ${sqlString(c.slug)}, ${sqlString(c.emoji)});
    else
      insert into public.countries (name, slug, emoji)
      values (${sqlString(c.name)}, ${sqlString(c.slug)}, ${sqlString(c.emoji)});
    end if;
  end if;
end $$;`
).join("\n\n");

const sql = `-- Global Map Mark → region room auto-share.
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
${ensureCountryBlocks}

-- 4) Ensure regional hub city rooms exist (no duplicates)
insert into public.cities (country_id, name, slug)
select c.id, v.name, v.slug
from (
  values
${hubValues}
) as v(country_slug, name, slug)
join public.countries c on c.slug = v.country_slug
where not exists (
  select 1 from public.cities existing
  where existing.country_id = c.id and existing.slug = v.slug
);

-- 5) Seed mappings
insert into public.region_room_mappings (country_slug, country_code, subdivision_code, region_name, room_city_slug)
values
${mappingValues}
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
`;

const outPath = join(process.cwd(), "database/add-map-mark-global-region-room-share.sql");
writeFileSync(outPath, sql);
console.log(`Wrote ${outPath}`);
console.log(`Mappings: ${REGION_ROOM_MAPPINGS.length}, hub rooms: ${REGION_HUB_ROOMS_TO_ENSURE.length}`);
