-- Estonia: all municipalities (omavalitsused).
-- Safe to re-run — skips existing slugs; backfills geolocation on all Estonia rows.

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
select c.id, v.name, v.slug, 'EE', 'estonia', v.latitude, v.longitude
from public.countries c
cross join (values
  ('Alutaguse vald', 'alutaguse-vald', 59.1379, 27.3839),
  ('Anija vald', 'anija-vald', 59.2764, 25.4817),
  ('Antsla vald', 'antsla-vald', 57.7774, 26.5952),
  ('Elva vald', 'elva-vald', 58.2456, 26.2726),
  ('Haapsalu linn', 'haapsalu-linn', 58.9358, 23.5300),
  ('Haljala vald', 'haljala-vald', 59.4543, 26.2202),
  ('Harku vald', 'harku-vald', 59.3916, 24.4621),
  ('Hiiumaa vald', 'hiiumaa-vald', 58.8880, 22.6361),
  ('Häädemeeste vald', 'haademeeste-vald', 58.0500, 24.5383),
  ('Järva vald', 'jarva-vald', 58.9841, 25.8230),
  ('Jõelähtme vald', 'joelahtme-vald', 59.4400, 25.1353),
  ('Jõgeva vald', 'jogeva-vald', 58.7873, 26.3812),
  ('Jõhvi vald', 'johvi-vald', 59.3565, 27.3930),
  ('Kadrina vald', 'kadrina-vald', 59.3746, 26.0415),
  ('Kambja vald', 'kambja-vald', 58.2026, 26.6900),
  ('Kanepi vald', 'kanepi-vald', 57.9806, 26.7615),
  ('Kastre vald', 'kastre-vald', 58.3126, 27.0771),
  ('Kehtna vald', 'kehtna-vald', 58.8427, 24.8900),
  ('Keila linn', 'keila-linn', 59.3113, 24.3865),
  ('Kihnu vald', 'kihnu-vald', 58.1300, 23.9900),
  ('Kiili vald', 'kiili-vald', 59.2967, 24.8529),
  ('Kohila vald', 'kohila-vald', 59.1528, 24.7334),
  ('Kohtla-Järve linn', 'kohtla-jarve-linn', 59.3954, 27.2811),
  ('Kose vald', 'kose-vald', 59.1859, 25.1114),
  ('Kuusalu vald', 'kuusalu-vald', 59.4785, 25.5964),
  ('Loksa linn', 'loksa-linn', 59.5784, 25.7167),
  ('Luunja vald', 'luunja-vald', 58.3918, 26.9557),
  ('Lääne-Harju vald', 'laane-harju-vald', 59.2593, 24.0889),
  ('Lääne-Nigula vald', 'laane-nigula-vald', 58.9605, 23.7449),
  ('Lääneranna vald', 'laaneranna-vald', 58.5891, 23.8963),
  ('Lüganuse vald', 'luganuse-vald', 59.3926, 27.0764),
  ('Maardu linn', 'maardu-linn', 59.4639, 24.9735),
  ('Muhu vald', 'muhu-vald', 58.5849, 23.2561),
  ('Mulgi vald', 'mulgi-vald', 58.1282, 25.4244),
  ('Mustvee vald', 'mustvee-vald', 58.8561, 26.8744),
  ('Märjamaa vald', 'marjamaa-vald', 58.9026, 24.3942),
  ('Narva linn', 'narva-linn', 59.3695, 28.1102),
  ('Narva-Jõesuu linn', 'narva-joesuu-linn', 59.4413, 28.0214),
  ('Nõo vald', 'noo-vald', 58.2420, 26.5250),
  ('Otepää vald', 'otepaa-vald', 58.0218, 26.4531),
  ('Paide linn', 'paide-linn', 58.8850, 25.5602),
  ('Peipsiääre vald', 'peipsiaare-vald', 58.5156, 27.1844),
  ('Pärnu linn', 'parnu-linn', 58.3790, 24.5278),
  ('Põhja-Pärnumaa vald', 'pohja-parnumaa-vald', 58.6346, 24.7919),
  ('Põhja-Sakala vald', 'pohja-sakala-vald', 58.4855, 25.3804),
  ('Põltsamaa vald', 'poltsamaa-vald', 58.6407, 26.0096),
  ('Põlva vald', 'polva-vald', 58.0837, 26.9824),
  ('Raasiku vald', 'raasiku-vald', 59.3235, 25.1473),
  ('Rae vald', 'rae-vald', 59.3320, 24.9393),
  ('Rakvere linn', 'rakvere-linn', 59.3453, 26.3616),
  ('Rakvere vald', 'rakvere-vald', 59.3246, 26.2976),
  ('Rapla vald', 'rapla-vald', 59.0331, 24.7179),
  ('Ruhnu vald', 'ruhnu-vald', 57.8031, 23.2425),
  ('Räpina vald', 'rapina-vald', 58.1078, 27.3858),
  ('Rõuge vald', 'rouge-vald', 57.7278, 26.8803),
  ('Saarde vald', 'saarde-vald', 58.1380, 24.9556),
  ('Saaremaa vald', 'saaremaa-vald', 58.3781, 22.4935),
  ('Saku vald', 'saku-vald', 59.2807, 24.7165),
  ('Saue vald', 'saue-vald', 59.2925, 24.5250),
  ('Setomaa vald', 'setomaa-vald', 57.8842, 27.6196),
  ('Sillamäe linn', 'sillamae-linn', 59.3956, 27.7642),
  ('Tallinn', 'tallinn', 59.4344, 24.7646),
  ('Tapa vald', 'tapa-vald', 59.2382, 25.8457),
  ('Tartu linn', 'tartu-linn', 58.3750, 26.7326),
  ('Tartu vald', 'tartu-vald', 58.4780, 26.7496),
  ('Toila vald', 'toila-vald', 59.3482, 27.5626),
  ('Tori vald', 'tori-vald', 58.4866, 24.8896),
  ('Tõrva vald', 'torva-vald', 57.9842, 25.8874),
  ('Türi vald', 'turi-vald', 58.7414, 25.4644),
  ('Valga vald', 'valga-vald', 57.7791, 26.2715),
  ('Viimsi vald', 'viimsi-vald', 59.5020, 24.8483),
  ('Viljandi linn', 'viljandi-linn', 58.3563, 25.5937),
  ('Viljandi vald', 'viljandi-vald', 58.3639, 25.4910),
  ('Vinni vald', 'vinni-vald', 59.2374, 26.6226),
  ('Viru-Nigula vald', 'viru-nigula-vald', 59.4639, 26.5859),
  ('Vormsi vald', 'vormsi-vald', 58.9999, 23.2341),
  ('Väike-Maarja vald', 'vaike-maarja-vald', 59.0656, 26.3142),
  ('Võru linn', 'voru-linn', 57.8355, 27.0012),
  ('Võru vald', 'voru-vald', 57.8662, 26.9742)
) as v(name, slug, latitude, longitude)
where c.slug = 'estonia'
on conflict (country_id, slug) do nothing;

update public.cities ci
set
  country_code = 'EE',
  country_slug = 'estonia',
  latitude = v.latitude,
  longitude = v.longitude
from public.countries co
cross join (values
  ('alutaguse-vald', 59.1379, 27.3839),
  ('anija-vald', 59.2764, 25.4817),
  ('antsla-vald', 57.7774, 26.5952),
  ('elva-vald', 58.2456, 26.2726),
  ('haapsalu-linn', 58.9358, 23.5300),
  ('haljala-vald', 59.4543, 26.2202),
  ('harku-vald', 59.3916, 24.4621),
  ('hiiumaa-vald', 58.8880, 22.6361),
  ('haademeeste-vald', 58.0500, 24.5383),
  ('jarva-vald', 58.9841, 25.8230),
  ('joelahtme-vald', 59.4400, 25.1353),
  ('jogeva-vald', 58.7873, 26.3812),
  ('johvi-vald', 59.3565, 27.3930),
  ('kadrina-vald', 59.3746, 26.0415),
  ('kambja-vald', 58.2026, 26.6900),
  ('kanepi-vald', 57.9806, 26.7615),
  ('kastre-vald', 58.3126, 27.0771),
  ('kehtna-vald', 58.8427, 24.8900),
  ('keila-linn', 59.3113, 24.3865),
  ('kihnu-vald', 58.1300, 23.9900),
  ('kiili-vald', 59.2967, 24.8529),
  ('kohila-vald', 59.1528, 24.7334),
  ('kohtla-jarve-linn', 59.3954, 27.2811),
  ('kose-vald', 59.1859, 25.1114),
  ('kuusalu-vald', 59.4785, 25.5964),
  ('loksa-linn', 59.5784, 25.7167),
  ('luunja-vald', 58.3918, 26.9557),
  ('laane-harju-vald', 59.2593, 24.0889),
  ('laane-nigula-vald', 58.9605, 23.7449),
  ('laaneranna-vald', 58.5891, 23.8963),
  ('luganuse-vald', 59.3926, 27.0764),
  ('maardu-linn', 59.4639, 24.9735),
  ('muhu-vald', 58.5849, 23.2561),
  ('mulgi-vald', 58.1282, 25.4244),
  ('mustvee-vald', 58.8561, 26.8744),
  ('marjamaa-vald', 58.9026, 24.3942),
  ('narva-linn', 59.3695, 28.1102),
  ('narva-joesuu-linn', 59.4413, 28.0214),
  ('noo-vald', 58.2420, 26.5250),
  ('otepaa-vald', 58.0218, 26.4531),
  ('paide-linn', 58.8850, 25.5602),
  ('peipsiaare-vald', 58.5156, 27.1844),
  ('parnu-linn', 58.3790, 24.5278),
  ('pohja-parnumaa-vald', 58.6346, 24.7919),
  ('pohja-sakala-vald', 58.4855, 25.3804),
  ('poltsamaa-vald', 58.6407, 26.0096),
  ('polva-vald', 58.0837, 26.9824),
  ('raasiku-vald', 59.3235, 25.1473),
  ('rae-vald', 59.3320, 24.9393),
  ('rakvere-linn', 59.3453, 26.3616),
  ('rakvere-vald', 59.3246, 26.2976),
  ('rapla-vald', 59.0331, 24.7179),
  ('ruhnu-vald', 57.8031, 23.2425),
  ('rapina-vald', 58.1078, 27.3858),
  ('rouge-vald', 57.7278, 26.8803),
  ('saarde-vald', 58.1380, 24.9556),
  ('saaremaa-vald', 58.3781, 22.4935),
  ('saku-vald', 59.2807, 24.7165),
  ('saue-vald', 59.2925, 24.5250),
  ('setomaa-vald', 57.8842, 27.6196),
  ('sillamae-linn', 59.3956, 27.7642),
  ('tallinn', 59.4344, 24.7646),
  ('tapa-vald', 59.2382, 25.8457),
  ('tartu-linn', 58.3750, 26.7326),
  ('tartu-vald', 58.4780, 26.7496),
  ('toila-vald', 59.3482, 27.5626),
  ('tori-vald', 58.4866, 24.8896),
  ('torva-vald', 57.9842, 25.8874),
  ('turi-vald', 58.7414, 25.4644),
  ('valga-vald', 57.7791, 26.2715),
  ('viimsi-vald', 59.5020, 24.8483),
  ('viljandi-linn', 58.3563, 25.5937),
  ('viljandi-vald', 58.3639, 25.4910),
  ('vinni-vald', 59.2374, 26.6226),
  ('viru-nigula-vald', 59.4639, 26.5859),
  ('vormsi-vald', 58.9999, 23.2341),
  ('vaike-maarja-vald', 59.0656, 26.3142),
  ('voru-linn', 57.8355, 27.0012),
  ('voru-vald', 57.8662, 26.9742)
) as v(slug, latitude, longitude)
where co.slug = 'estonia'
  and ci.country_id = co.id
  and ci.slug = v.slug;

-- Verify:
-- select count(*) from cities
-- where country_id = (select id from countries where slug = 'estonia');
