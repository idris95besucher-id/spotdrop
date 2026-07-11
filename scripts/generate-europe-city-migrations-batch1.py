#!/usr/bin/env python3
"""Generate database/add-cities-<country-slug>.sql for European countries (batch 1)."""

from __future__ import annotations

import io
import re
import unicodedata
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "database"

HEADER = """-- {title}
-- Safe to re-run — skips existing slugs; backfills geolocation on all {country_name} rows.

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
"""

INSERT_HEAD = """
insert into public.cities (country_id, name, slug, country_code, country_slug, latitude, longitude)
select c.id, v.name, v.slug, '{code}', '{slug}', v.latitude, v.longitude
from public.countries c
cross join (values
"""

UPDATE_HEAD = """
update public.cities ci
set
  country_code = '{code}',
  country_slug = '{slug}',
  latitude = v.latitude,
  longitude = v.longitude
from public.countries co
cross join (values
"""

FOOTER = """
) as v(slug, latitude, longitude)
where co.slug = '{slug}'
  and ci.country_id = co.id
  and ci.slug = v.slug;

-- Verify:
-- select count(*) from cities
-- where country_id = (select id from countries where slug = '{slug}');
"""


def slugify(name: str) -> str:
    s = unicodedata.normalize("NFKD", name)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower()
    s = re.sub(r"[''`]", "", s)
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def sql_escape(value: str) -> str:
    return value.replace("'", "''")


def format_row(name: str, slug: str, lat: float, lng: float, for_update: bool = False) -> str:
    if for_update:
        return f"  ('{sql_escape(slug)}', {lat:.4f}, {lng:.4f})"
    return f"  ('{sql_escape(name)}', '{sql_escape(slug)}', {lat:.4f}, {lng:.4f})"


def fetch_geonames(cc: str, feature: str) -> list[tuple[str, str, float, float]]:
    url = f"https://download.geonames.org/export/dump/{cc}.zip"
    data = urllib.request.urlopen(url, timeout=60).read()
    z = zipfile.ZipFile(io.BytesIO(data))
    rows: list[tuple[str, str, float, float]] = []
    seen: set[str] = set()

    for line in z.read(f"{cc}.txt").decode("utf-8").splitlines():
        parts = line.split("\t")
        if len(parts) < 19 or parts[7] != feature:
            continue
        name = parts[1].strip()
        if not name:
            continue
        slug = slugify(name)
        if slug in seen:
            continue
        seen.add(slug)
        rows.append((name, slug, float(parts[4]), float(parts[5])))

    rows.sort(key=lambda item: item[0].lower())
    return rows


def clean_name(name: str, country_slug: str | None = None) -> str:
    if country_slug == "estonia":
        return name.strip()
    if name.startswith("Grad "):
        name = name[5:]
    if name.startswith("Obshtina "):
        name = name[9:]
    if name.endswith(" Kommune"):
        name = name[: -len(" Kommune")]
    return name.strip()


def normalize_rows(
    rows: list[tuple[str, str, float, float]], country_slug: str | None = None
) -> list[tuple[str, str, float, float]]:
    out: list[tuple[str, str, float, float]] = []
    seen: set[str] = set()
    for name, _slug, lat, lng in rows:
        display = clean_name(name, country_slug)
        slug = slugify(display)
        if slug in seen:
            continue
        seen.add(slug)
        out.append((display, slug, lat, lng))
    out.sort(key=lambda item: item[0].lower())
    return out


def write_migration(
    *,
    country_slug: str,
    country_code: str,
    country_name: str,
    title: str,
    rows: list[tuple[str, str, float, float]],
) -> Path:
    path = OUT_DIR / f"add-cities-{country_slug}.sql"
    insert_lines = ",\n".join(format_row(n, s, lat, lng) for n, s, lat, lng in rows)
    update_lines = ",\n".join(format_row(n, s, lat, lng, for_update=True) for n, s, lat, lng in rows)

    content = (
        HEADER.format(title=title, country_name=country_name)
        + INSERT_HEAD.format(code=country_code, slug=country_slug)
        + insert_lines
        + "\n) as v(name, slug, latitude, longitude)\n"
        + f"where c.slug = '{country_slug}'\n"
        + "on conflict (country_id, slug) do nothing;\n"
        + UPDATE_HEAD.format(code=country_code, slug=country_slug)
        + update_lines
        + FOOTER.format(slug=country_slug)
    )
    path.write_text(content, encoding="utf-8")
    return path


# Andorra — 7 official parishes (parròquies)
ANDORRA = [
    ("Andorra la Vella", 42.50779, 1.52109),
    ("Canillo", 42.56765, 1.59756),
    ("Encamp", 42.53474, 1.58014),
    ("Escaldes-Engordany", 42.50779, 1.53414),
    ("La Massana", 42.54499, 1.51483),
    ("Ordino", 42.55623, 1.53319),
    ("Sant Julià de Lòria", 42.46372, 1.49129),
]

# Cyprus — 20 municipalities (2024 local government reform, government-controlled areas)
CYPRUS = [
    ("Agia Napa", 34.98788, 33.99774),
    ("Akamas", 34.91667, 32.35000),
    ("Amathounta", 34.72000, 33.13000),
    ("Aradippou", 34.94772, 33.58813),
    ("Athienou", 35.06183, 33.54147),
    ("Dromolaxia-Meneou", 34.82200, 33.58300),
    ("Ierokipia", 34.75000, 32.41667),
    ("Kourion", 34.67200, 32.88400),
    ("Lakatameia", 35.11309, 33.31335),
    ("Larnaca", 34.92290, 33.62330),
    ("Latsia-Geri", 35.10188, 33.37312),
    ("Lefkara", 34.86889, 33.30417),
    ("Limassol", 34.68406, 33.03794),
    ("Nicosia", 35.17531, 33.36420),
    ("Paphos", 34.77679, 32.42451),
    ("Paralimni-Deryneia", 35.03945, 33.98181),
    ("Polis Chrysochous", 35.03639, 32.42750),
    ("Polemidia", 34.69320, 32.99760),
    ("South Nicosia-Idalion", 35.02000, 33.41000),
    ("Strovolos", 35.14889, 33.33389),
]

GEONAMES_SOURCES = {
    "austria": ("AT", "ADM3", "Austria: all municipalities (Gemeinden)"),
    "belgium": ("BE", "ADM4", "Belgium: municipalities (communes/gemeenten)"),
    "bosnia-and-herzegovina": ("BA", "ADM3", "Bosnia and Herzegovina: municipalities (općine/gradovi)"),
    "bulgaria": ("BG", "ADM2", "Bulgaria: all municipalities (obshtini)"),
    "croatia": ("HR", "PPLA2", "Croatia: cities and municipalities (gradovi/općine)"),
    "czech-republic": ("CZ", "ADM3", "Czech Republic: all municipalities (obce)"),
    "denmark": ("DK", "ADM2", "Denmark: all municipalities (kommuner)"),
    "estonia": ("EE", "ADM2", "Estonia: all municipalities (omavalitsused)"),
}


def manual_rows(items: list[tuple[str, float, float]]) -> list[tuple[str, str, float, float]]:
    rows = [(name, slugify(name), lat, lng) for name, lat, lng in items]
    rows.sort(key=lambda item: item[0].lower())
    return rows


def main() -> None:
    created: list[tuple[str, int]] = []

    path = write_migration(
        country_slug="andorra",
        country_code="AD",
        country_name="Andorra",
        title="Andorra: all 7 official parishes (parròquies).",
        rows=manual_rows(ANDORRA),
    )
    created.append((path.name, len(ANDORRA)))

    for country_slug, (cc, feature, title) in GEONAMES_SOURCES.items():
        raw = fetch_geonames(cc, feature)
        rows = normalize_rows(raw, country_slug)
        country_name = title.split(":")[0]
        path = write_migration(
            country_slug=country_slug,
            country_code=cc,
            country_name=country_name,
            title=title + ".",
            rows=rows,
        )
        created.append((path.name, len(rows)))

    path = write_migration(
        country_slug="cyprus",
        country_code="CY",
        country_name="Cyprus",
        title="Cyprus: 20 municipalities (2024 local government reform).",
        rows=manual_rows(CYPRUS),
    )
    created.append((path.name, len(CYPRUS)))

    print("Created migrations:")
    for name, count in created:
        print(f"  {name}: {count} cities")


if __name__ == "__main__":
    main()
