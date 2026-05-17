-- Inserts missing cities only (safe to re-run).
-- Resolves country_id from countries.slug; skips rows that already exist.

-- Switzerland (full list, alphabetical by name)
insert into cities (country_id, name, slug)
select c.id, v.name, v.slug
from countries c
cross join (values
  ('Aarau', 'aarau'),
  ('Baden', 'baden'),
  ('Basel', 'basel'),
  ('Bellinzona', 'bellinzona'),
  ('Bern', 'bern'),
  ('Biel/Bienne', 'biel-bienne'),
  ('Chur', 'chur'),
  ('Fribourg', 'fribourg'),
  ('Geneva', 'geneva'),
  ('Interlaken', 'interlaken'),
  ('Lausanne', 'lausanne'),
  ('Locarno', 'locarno'),
  ('Lucerne', 'lucerne'),
  ('Lugano', 'lugano'),
  ('Montreux', 'montreux'),
  ('Murten', 'murten'),
  ('Neuchâtel', 'neuchatel'),
  ('Sion', 'sion'),
  ('St. Gallen', 'st-gallen'),
  ('Thun', 'thun'),
  ('Winterthur', 'winterthur'),
  ('Zug', 'zug'),
  ('Zurich', 'zurich')
) as v(name, slug)
where c.slug = 'switzerland'
on conflict (country_id, slug) do nothing;

-- Germany
insert into cities (country_id, name, slug)
select c.id, v.name, v.slug
from countries c
cross join (values
  ('Aachen', 'aachen'),
  ('Augsburg', 'augsburg'),
  ('Berlin', 'berlin'),
  ('Bonn', 'bonn'),
  ('Bremen', 'bremen'),
  ('Cologne', 'cologne'),
  ('Dortmund', 'dortmund'),
  ('Dresden', 'dresden'),
  ('Düsseldorf', 'dusseldorf'),
  ('Essen', 'essen'),
  ('Frankfurt', 'frankfurt'),
  ('Freiburg', 'freiburg'),
  ('Hamburg', 'hamburg'),
  ('Hanover', 'hanover'),
  ('Heidelberg', 'heidelberg'),
  ('Karlsruhe', 'karlsruhe'),
  ('Kiel', 'kiel'),
  ('Leipzig', 'leipzig'),
  ('Mannheim', 'mannheim'),
  ('Munich', 'munich'),
  ('Münster', 'munster'),
  ('Nuremberg', 'nuremberg'),
  ('Potsdam', 'potsdam'),
  ('Rostock', 'rostock'),
  ('Stuttgart', 'stuttgart'),
  ('Wiesbaden', 'wiesbaden'),
  ('Würzburg', 'wurzburg')
) as v(name, slug)
where c.slug = 'germany'
on conflict (country_id, slug) do nothing;

-- France
insert into cities (country_id, name, slug)
select c.id, v.name, v.slug
from countries c
cross join (values
  ('Annecy', 'annecy'),
  ('Avignon', 'avignon'),
  ('Bordeaux', 'bordeaux'),
  ('Cannes', 'cannes'),
  ('Clermont-Ferrand', 'clermont-ferrand'),
  ('Dijon', 'dijon'),
  ('Grenoble', 'grenoble'),
  ('Lille', 'lille'),
  ('Lyon', 'lyon'),
  ('Marseille', 'marseille'),
  ('Metz', 'metz'),
  ('Montpellier', 'montpellier'),
  ('Nancy', 'nancy'),
  ('Nantes', 'nantes'),
  ('Nice', 'nice'),
  ('Paris', 'paris'),
  ('Reims', 'reims'),
  ('Rennes', 'rennes'),
  ('Saint-Étienne', 'saint-etienne'),
  ('Strasbourg', 'strasbourg'),
  ('Toulon', 'toulon'),
  ('Toulouse', 'toulouse')
) as v(name, slug)
where c.slug = 'france'
on conflict (country_id, slug) do nothing;

-- Italy
insert into cities (country_id, name, slug)
select c.id, v.name, v.slug
from countries c
cross join (values
  ('Bari', 'bari'),
  ('Bergamo', 'bergamo'),
  ('Bologna', 'bologna'),
  ('Catania', 'catania'),
  ('Como', 'como'),
  ('Florence', 'florence'),
  ('Genoa', 'genoa'),
  ('Milan', 'milan'),
  ('Naples', 'naples'),
  ('Padua', 'padua'),
  ('Palermo', 'palermo'),
  ('Pisa', 'pisa'),
  ('Rimini', 'rimini'),
  ('Rome', 'rome'),
  ('Siena', 'siena'),
  ('Trieste', 'trieste'),
  ('Turin', 'turin'),
  ('Venice', 'venice'),
  ('Verona', 'verona')
) as v(name, slug)
where c.slug = 'italy'
on conflict (country_id, slug) do nothing;

-- Spain
insert into cities (country_id, name, slug)
select c.id, v.name, v.slug
from countries c
cross join (values
  ('Alicante', 'alicante'),
  ('Barcelona', 'barcelona'),
  ('Bilbao', 'bilbao'),
  ('Granada', 'granada'),
  ('Las Palmas', 'las-palmas'),
  ('Madrid', 'madrid'),
  ('Malaga', 'malaga'),
  ('Murcia', 'murcia'),
  ('Palma', 'palma'),
  ('Salamanca', 'salamanca'),
  ('San Sebastián', 'san-sebastian'),
  ('Santiago de Compostela', 'santiago-de-compostela'),
  ('Seville', 'seville'),
  ('Valencia', 'valencia'),
  ('Zaragoza', 'zaragoza')
) as v(name, slug)
where c.slug = 'spain'
on conflict (country_id, slug) do nothing;

-- United Kingdom
insert into cities (country_id, name, slug)
select c.id, v.name, v.slug
from countries c
cross join (values
  ('Bath', 'bath'),
  ('Belfast', 'belfast'),
  ('Birmingham', 'birmingham'),
  ('Brighton', 'brighton'),
  ('Bristol', 'bristol'),
  ('Cambridge', 'cambridge'),
  ('Cardiff', 'cardiff'),
  ('Edinburgh', 'edinburgh'),
  ('Glasgow', 'glasgow'),
  ('Leeds', 'leeds'),
  ('Liverpool', 'liverpool'),
  ('London', 'london'),
  ('Manchester', 'manchester'),
  ('Newcastle', 'newcastle'),
  ('Nottingham', 'nottingham'),
  ('Oxford', 'oxford'),
  ('Sheffield', 'sheffield'),
  ('York', 'york')
) as v(name, slug)
where c.slug = 'united-kingdom'
on conflict (country_id, slug) do nothing;

-- Netherlands
insert into cities (country_id, name, slug)
select c.id, v.name, v.slug
from countries c
cross join (values
  ('Amsterdam', 'amsterdam'),
  ('Delft', 'delft'),
  ('Eindhoven', 'eindhoven'),
  ('Groningen', 'groningen'),
  ('Haarlem', 'haarlem'),
  ('Leiden', 'leiden'),
  ('Maastricht', 'maastricht'),
  ('Nijmegen', 'nijmegen'),
  ('Rotterdam', 'rotterdam'),
  ('The Hague', 'the-hague'),
  ('Tilburg', 'tilburg'),
  ('Utrecht', 'utrecht')
) as v(name, slug)
where c.slug = 'netherlands'
on conflict (country_id, slug) do nothing;

-- Belgium
insert into cities (country_id, name, slug)
select c.id, v.name, v.slug
from countries c
cross join (values
  ('Antwerp', 'antwerp'),
  ('Bruges', 'bruges'),
  ('Brussels', 'brussels'),
  ('Charleroi', 'charleroi'),
  ('Ghent', 'ghent'),
  ('Leuven', 'leuven'),
  ('Liège', 'liege'),
  ('Mechelen', 'mechelen'),
  ('Namur', 'namur'),
  ('Ostend', 'ostend')
) as v(name, slug)
where c.slug = 'belgium'
on conflict (country_id, slug) do nothing;

-- Austria
insert into cities (country_id, name, slug)
select c.id, v.name, v.slug
from countries c
cross join (values
  ('Graz', 'graz'),
  ('Hallstatt', 'hallstatt'),
  ('Innsbruck', 'innsbruck'),
  ('Klagenfurt', 'klagenfurt'),
  ('Linz', 'linz'),
  ('Salzburg', 'salzburg'),
  ('Vienna', 'vienna'),
  ('Villach', 'villach'),
  ('Wels', 'wels')
) as v(name, slug)
where c.slug = 'austria'
on conflict (country_id, slug) do nothing;

-- Sweden
insert into cities (country_id, name, slug)
select c.id, v.name, v.slug
from countries c
cross join (values
  ('Gothenburg', 'gothenburg'),
  ('Helsingborg', 'helsingborg'),
  ('Jönköping', 'jonkoping'),
  ('Linköping', 'linkoping'),
  ('Lund', 'lund'),
  ('Malmö', 'malmo'),
  ('Stockholm', 'stockholm'),
  ('Uppsala', 'uppsala'),
  ('Visby', 'visby')
) as v(name, slug)
where c.slug = 'sweden'
on conflict (country_id, slug) do nothing;

-- Norway
insert into cities (country_id, name, slug)
select c.id, v.name, v.slug
from countries c
cross join (values
  ('Bergen', 'bergen'),
  ('Drammen', 'drammen'),
  ('Kristiansand', 'kristiansand'),
  ('Oslo', 'oslo'),
  ('Stavanger', 'stavanger'),
  ('Tromsø', 'tromso'),
  ('Trondheim', 'trondheim')
) as v(name, slug)
where c.slug = 'norway'
on conflict (country_id, slug) do nothing;

-- Denmark
insert into cities (country_id, name, slug)
select c.id, v.name, v.slug
from countries c
cross join (values
  ('Aalborg', 'aalborg'),
  ('Aarhus', 'aarhus'),
  ('Copenhagen', 'copenhagen'),
  ('Esbjerg', 'esbjerg'),
  ('Odense', 'odense'),
  ('Roskilde', 'roskilde')
) as v(name, slug)
where c.slug = 'denmark'
on conflict (country_id, slug) do nothing;

-- Finland
insert into cities (country_id, name, slug)
select c.id, v.name, v.slug
from countries c
cross join (values
  ('Espoo', 'espoo'),
  ('Helsinki', 'helsinki'),
  ('Jyväskylä', 'jyvaskyla'),
  ('Oulu', 'oulu'),
  ('Rovaniemi', 'rovaniemi'),
  ('Tampere', 'tampere'),
  ('Turku', 'turku'),
  ('Vaasa', 'vaasa')
) as v(name, slug)
where c.slug = 'finland'
on conflict (country_id, slug) do nothing;

-- Poland
insert into cities (country_id, name, slug)
select c.id, v.name, v.slug
from countries c
cross join (values
  ('Białystok', 'bialystok'),
  ('Bydgoszcz', 'bydgoszcz'),
  ('Gdańsk', 'gdansk'),
  ('Katowice', 'katowice'),
  ('Kraków', 'krakow'),
  ('Lublin', 'lublin'),
  ('Łódź', 'lodz'),
  ('Poznań', 'poznan'),
  ('Szczecin', 'szczecin'),
  ('Warsaw', 'warsaw'),
  ('Wrocław', 'wroclaw')
) as v(name, slug)
where c.slug = 'poland'
on conflict (country_id, slug) do nothing;

-- Czech Republic
insert into cities (country_id, name, slug)
select c.id, v.name, v.slug
from countries c
cross join (values
  ('Brno', 'brno'),
  ('České Budějovice', 'ceske-budejovice'),
  ('Karlovy Vary', 'karlovy-vary'),
  ('Liberec', 'liberec'),
  ('Olomouc', 'olomouc'),
  ('Ostrava', 'ostrava'),
  ('Pilsen', 'plzen'),
  ('Prague', 'prague')
) as v(name, slug)
where c.slug = 'czech-republic'
on conflict (country_id, slug) do nothing;

-- Hungary
insert into cities (country_id, name, slug)
select c.id, v.name, v.slug
from countries c
cross join (values
  ('Budapest', 'budapest'),
  ('Debrecen', 'debrecen'),
  ('Eger', 'eger'),
  ('Győr', 'gyor'),
  ('Miskolc', 'miskolc'),
  ('Pécs', 'pecs'),
  ('Szeged', 'szeged'),
  ('Székesfehérvár', 'szekesfehervar')
) as v(name, slug)
where c.slug = 'hungary'
on conflict (country_id, slug) do nothing;

-- Greece
insert into cities (country_id, name, slug)
select c.id, v.name, v.slug
from countries c
cross join (values
  ('Athens', 'athens'),
  ('Chania', 'chania'),
  ('Heraklion', 'heraklion'),
  ('Larissa', 'larissa'),
  ('Patras', 'patras'),
  ('Rhodes', 'rhodes'),
  ('Santorini', 'santorini'),
  ('Thessaloniki', 'thessaloniki')
) as v(name, slug)
where c.slug = 'greece'
on conflict (country_id, slug) do nothing;

-- Portugal
insert into cities (country_id, name, slug)
select c.id, v.name, v.slug
from countries c
cross join (values
  ('Aveiro', 'aveiro'),
  ('Braga', 'braga'),
  ('Coimbra', 'coimbra'),
  ('Faro', 'faro'),
  ('Funchal', 'funchal'),
  ('Lisbon', 'lisbon'),
  ('Porto', 'porto'),
  ('Sintra', 'sintra')
) as v(name, slug)
where c.slug = 'portugal'
on conflict (country_id, slug) do nothing;

-- Ireland
insert into cities (country_id, name, slug)
select c.id, v.name, v.slug
from countries c
cross join (values
  ('Cork', 'cork'),
  ('Dublin', 'dublin'),
  ('Galway', 'galway'),
  ('Kilkenny', 'kilkenny'),
  ('Limerick', 'limerick'),
  ('Waterford', 'waterford')
) as v(name, slug)
where c.slug = 'ireland'
on conflict (country_id, slug) do nothing;

-- Romania
insert into cities (country_id, name, slug)
select c.id, v.name, v.slug
from countries c
cross join (values
  ('Brașov', 'brasov'),
  ('Bucharest', 'bucharest'),
  ('Cluj-Napoca', 'cluj-napoca'),
  ('Constanța', 'constanta'),
  ('Iași', 'iasi'),
  ('Sibiu', 'sibiu'),
  ('Timișoara', 'timisoara')
) as v(name, slug)
where c.slug = 'romania'
on conflict (country_id, slug) do nothing;

-- Bulgaria
insert into cities (country_id, name, slug)
select c.id, v.name, v.slug
from countries c
cross join (values
  ('Burgas', 'burgas'),
  ('Plovdiv', 'plovdiv'),
  ('Ruse', 'ruse'),
  ('Sofia', 'sofia'),
  ('Varna', 'varna')
) as v(name, slug)
where c.slug = 'bulgaria'
on conflict (country_id, slug) do nothing;

-- Serbia
insert into cities (country_id, name, slug)
select c.id, v.name, v.slug
from countries c
cross join (values
  ('Belgrade', 'belgrade'),
  ('Kragujevac', 'kragujevac'),
  ('Niš', 'nis'),
  ('Novi Sad', 'novi-sad'),
  ('Subotica', 'subotica')
) as v(name, slug)
where c.slug = 'serbia'
on conflict (country_id, slug) do nothing;

-- Croatia
insert into cities (country_id, name, slug)
select c.id, v.name, v.slug
from countries c
cross join (values
  ('Dubrovnik', 'dubrovnik'),
  ('Osijek', 'osijek'),
  ('Pula', 'pula'),
  ('Rijeka', 'rijeka'),
  ('Split', 'split'),
  ('Zadar', 'zadar'),
  ('Zagreb', 'zagreb')
) as v(name, slug)
where c.slug = 'croatia'
on conflict (country_id, slug) do nothing;

-- Slovenia
insert into cities (country_id, name, slug)
select c.id, v.name, v.slug
from countries c
cross join (values
  ('Celje', 'celje'),
  ('Koper', 'koper'),
  ('Kranj', 'kranj'),
  ('Ljubljana', 'ljubljana'),
  ('Maribor', 'maribor'),
  ('Novo Mesto', 'novo-mesto')
) as v(name, slug)
where c.slug = 'slovenia'
on conflict (country_id, slug) do nothing;

-- Slovakia
insert into cities (country_id, name, slug)
select c.id, v.name, v.slug
from countries c
cross join (values
  ('Bratislava', 'bratislava'),
  ('Košice', 'kosice'),
  ('Nitra', 'nitra'),
  ('Prešov', 'presov'),
  ('Žilina', 'zilina')
) as v(name, slug)
where c.slug = 'slovakia'
on conflict (country_id, slug) do nothing;

-- Bosnia and Herzegovina
insert into cities (country_id, name, slug)
select c.id, v.name, v.slug
from countries c
cross join (values
  ('Banja Luka', 'banja-luka'),
  ('Mostar', 'mostar'),
  ('Sarajevo', 'sarajevo'),
  ('Tuzla', 'tuzla'),
  ('Zenica', 'zenica')
) as v(name, slug)
where c.slug = 'bosnia-and-herzegovina'
on conflict (country_id, slug) do nothing;

-- Montenegro
insert into cities (country_id, name, slug)
select c.id, v.name, v.slug
from countries c
cross join (values
  ('Bar', 'bar'),
  ('Budva', 'budva'),
  ('Herceg Novi', 'herceg-novi'),
  ('Kotor', 'kotor'),
  ('Nikšić', 'niksic'),
  ('Podgorica', 'podgorica')
) as v(name, slug)
where c.slug = 'montenegro'
on conflict (country_id, slug) do nothing;

-- North Macedonia
insert into cities (country_id, name, slug)
select c.id, v.name, v.slug
from countries c
cross join (values
  ('Bitola', 'bitola'),
  ('Kumanovo', 'kumanovo'),
  ('Ohrid', 'ohrid'),
  ('Skopje', 'skopje'),
  ('Tetovo', 'tetovo')
) as v(name, slug)
where c.slug = 'north-macedonia'
on conflict (country_id, slug) do nothing;

-- Albania
insert into cities (country_id, name, slug)
select c.id, v.name, v.slug
from countries c
cross join (values
  ('Durrës', 'durres'),
  ('Elbasan', 'elbasan'),
  ('Shkodër', 'shkoder'),
  ('Tirana', 'tirana'),
  ('Vlorë', 'vlore')
) as v(name, slug)
where c.slug = 'albania'
on conflict (country_id, slug) do nothing;

-- Cyprus
insert into cities (country_id, name, slug)
select c.id, v.name, v.slug
from countries c
cross join (values
  ('Famagusta', 'famagusta'),
  ('Larnaca', 'larnaca'),
  ('Limassol', 'limassol'),
  ('Nicosia', 'nicosia'),
  ('Paphos', 'paphos')
) as v(name, slug)
where c.slug = 'cyprus'
on conflict (country_id, slug) do nothing;

-- Malta
insert into cities (country_id, name, slug)
select c.id, v.name, v.slug
from countries c
cross join (values
  ('Birkirkara', 'birkirkara'),
  ('Mdina', 'mdina'),
  ('Mosta', 'mosta'),
  ('Sliema', 'sliema'),
  ('St Julian''s', 'st-julians'),
  ('Valletta', 'valletta')
) as v(name, slug)
where c.slug = 'malta'
on conflict (country_id, slug) do nothing;

-- Iceland
insert into cities (country_id, name, slug)
select c.id, v.name, v.slug
from countries c
cross join (values
  ('Akureyri', 'akureyri'),
  ('Hafnarfjörður', 'hafnarfjordur'),
  ('Keflavík', 'keflavik'),
  ('Reykjavík', 'reykjavik'),
  ('Selfoss', 'selfoss')
) as v(name, slug)
where c.slug = 'iceland'
on conflict (country_id, slug) do nothing;

-- Luxembourg
insert into cities (country_id, name, slug)
select c.id, v.name, v.slug
from countries c
cross join (values
  ('Differdange', 'differdange'),
  ('Dudelange', 'dudelange'),
  ('Esch-sur-Alzette', 'esch-sur-alzette'),
  ('Ettelbruck', 'ettelbruck'),
  ('Luxembourg', 'luxembourg')
) as v(name, slug)
where c.slug = 'luxembourg'
on conflict (country_id, slug) do nothing;

-- Monaco
insert into cities (country_id, name, slug)
select c.id, v.name, v.slug
from countries c
cross join (values
  ('Fontvieille', 'fontvieille'),
  ('La Condamine', 'la-condamine'),
  ('Monaco', 'monaco'),
  ('Monte Carlo', 'monte-carlo')
) as v(name, slug)
where c.slug = 'monaco'
on conflict (country_id, slug) do nothing;

-- Andorra
insert into cities (country_id, name, slug)
select c.id, v.name, v.slug
from countries c
cross join (values
  ('Andorra la Vella', 'andorra-la-vella'),
  ('Encamp', 'encamp'),
  ('Escaldes-Engordany', 'escaldes-engordany'),
  ('Sant Julià de Lòria', 'sant-julia-de-loria')
) as v(name, slug)
where c.slug = 'andorra'
on conflict (country_id, slug) do nothing;

-- San Marino
insert into cities (country_id, name, slug)
select c.id, v.name, v.slug
from countries c
cross join (values
  ('Borgo Maggiore', 'borgo-maggiore'),
  ('Domagnano', 'domagnano'),
  ('San Marino', 'san-marino'),
  ('Serravalle', 'serravalle')
) as v(name, slug)
where c.slug = 'san-marino'
on conflict (country_id, slug) do nothing;

-- Liechtenstein
insert into cities (country_id, name, slug)
select c.id, v.name, v.slug
from countries c
cross join (values
  ('Balzers', 'balzers'),
  ('Eschen', 'eschen'),
  ('Schaan', 'schaan'),
  ('Triesen', 'triesen'),
  ('Vaduz', 'vaduz')
) as v(name, slug)
where c.slug = 'liechtenstein'
on conflict (country_id, slug) do nothing;

-- Vatican City
insert into cities (country_id, name, slug)
select c.id, v.name, v.slug
from countries c
cross join (values
  ('Vatican City', 'vatican-city')
) as v(name, slug)
where c.slug = 'vatican-city'
on conflict (country_id, slug) do nothing;

-- Russia
insert into cities (country_id, name, slug)
select c.id, v.name, v.slug
from countries c
cross join (values
  ('Kazan', 'kazan'),
  ('Moscow', 'moscow'),
  ('Nizhny Novgorod', 'nizhny-novgorod'),
  ('Novosibirsk', 'novosibirsk'),
  ('Rostov-on-Don', 'rostov-on-don'),
  ('Saint Petersburg', 'saint-petersburg'),
  ('Sochi', 'sochi'),
  ('Yekaterinburg', 'yekaterinburg')
) as v(name, slug)
where c.slug = 'russia'
on conflict (country_id, slug) do nothing;

-- Ukraine
insert into cities (country_id, name, slug)
select c.id, v.name, v.slug
from countries c
cross join (values
  ('Dnipro', 'dnipro'),
  ('Kharkiv', 'kharkiv'),
  ('Kyiv', 'kyiv'),
  ('Lviv', 'lviv'),
  ('Odesa', 'odesa'),
  ('Zaporizhzhia', 'zaporizhzhia')
) as v(name, slug)
where c.slug = 'ukraine'
on conflict (country_id, slug) do nothing;

-- Belarus
insert into cities (country_id, name, slug)
select c.id, v.name, v.slug
from countries c
cross join (values
  ('Brest', 'brest'),
  ('Gomel', 'gomel'),
  ('Grodno', 'grodno'),
  ('Minsk', 'minsk'),
  ('Mogilev', 'mogilev')
) as v(name, slug)
where c.slug = 'belarus'
on conflict (country_id, slug) do nothing;

-- Latvia
insert into cities (country_id, name, slug)
select c.id, v.name, v.slug
from countries c
cross join (values
  ('Daugavpils', 'daugavpils'),
  ('Jelgava', 'jelgava'),
  ('Jūrmala', 'jurmala'),
  ('Liepāja', 'liepaja'),
  ('Riga', 'riga')
) as v(name, slug)
where c.slug = 'latvia'
on conflict (country_id, slug) do nothing;

-- Lithuania
insert into cities (country_id, name, slug)
select c.id, v.name, v.slug
from countries c
cross join (values
  ('Kaunas', 'kaunas'),
  ('Klaipėda', 'klaipeda'),
  ('Panevėžys', 'panevezys'),
  ('Šiauliai', 'siauliai'),
  ('Vilnius', 'vilnius')
) as v(name, slug)
where c.slug = 'lithuania'
on conflict (country_id, slug) do nothing;

-- Estonia
insert into cities (country_id, name, slug)
select c.id, v.name, v.slug
from countries c
cross join (values
  ('Narva', 'narva'),
  ('Pärnu', 'parnu'),
  ('Tallinn', 'tallinn'),
  ('Tartu', 'tartu'),
  ('Viljandi', 'viljandi')
) as v(name, slug)
where c.slug = 'estonia'
on conflict (country_id, slug) do nothing;

-- Moldova
insert into cities (country_id, name, slug)
select c.id, v.name, v.slug
from countries c
cross join (values
  ('Bălți', 'balti'),
  ('Cahul', 'cahul'),
  ('Chișinău', 'chisinau'),
  ('Orhei', 'orhei'),
  ('Tiraspol', 'tiraspol')
) as v(name, slug)
where c.slug = 'moldova'
on conflict (country_id, slug) do nothing;

-- Georgia
insert into cities (country_id, name, slug)
select c.id, v.name, v.slug
from countries c
cross join (values
  ('Batumi', 'batumi'),
  ('Kutaisi', 'kutaisi'),
  ('Rustavi', 'rustavi'),
  ('Tbilisi', 'tbilisi'),
  ('Zugdidi', 'zugdidi')
) as v(name, slug)
where c.slug = 'georgia'
on conflict (country_id, slug) do nothing;

-- Armenia
insert into cities (country_id, name, slug)
select c.id, v.name, v.slug
from countries c
cross join (values
  ('Gyumri', 'gyumri'),
  ('Hrazdan', 'hrazdan'),
  ('Vagharshapat', 'vagharshapat'),
  ('Vanadzor', 'vanadzor'),
  ('Yerevan', 'yerevan')
) as v(name, slug)
where c.slug = 'armenia'
on conflict (country_id, slug) do nothing;

-- Azerbaijan
insert into cities (country_id, name, slug)
select c.id, v.name, v.slug
from countries c
cross join (values
  ('Baku', 'baku'),
  ('Ganja', 'ganja'),
  ('Lankaran', 'lankaran'),
  ('Mingachevir', 'mingachevir'),
  ('Sumqayit', 'sumqayit')
) as v(name, slug)
where c.slug = 'azerbaijan'
on conflict (country_id, slug) do nothing;

-- Kazakhstan
insert into cities (country_id, name, slug)
select c.id, v.name, v.slug
from countries c
cross join (values
  ('Aktobe', 'aktobe'),
  ('Almaty', 'almaty'),
  ('Nur-Sultan', 'nur-sultan'),
  ('Karaganda', 'karaganda'),
  ('Shymkent', 'shymkent')
) as v(name, slug)
where c.slug = 'kazakhstan'
on conflict (country_id, slug) do nothing;

-- Kyrgyzstan
insert into cities (country_id, name, slug)
select c.id, v.name, v.slug
from countries c
cross join (values
  ('Bishkek', 'bishkek'),
  ('Jalal-Abad', 'jalal-abad'),
  ('Karakol', 'karakol'),
  ('Naryn', 'naryn'),
  ('Osh', 'osh')
) as v(name, slug)
where c.slug = 'kyrgyzstan'
on conflict (country_id, slug) do nothing;

-- Tajikistan
insert into cities (country_id, name, slug)
select c.id, v.name, v.slug
from countries c
cross join (values
  ('Dushanbe', 'dushanbe'),
  ('Istaravshan', 'istaravshan'),
  ('Khujand', 'khujand'),
  ('Kulob', 'kulob'),
  ('Qurghonteppa', 'qurghonteppa')
) as v(name, slug)
where c.slug = 'tajikistan'
on conflict (country_id, slug) do nothing;

-- Turkmenistan
insert into cities (country_id, name, slug)
select c.id, v.name, v.slug
from countries c
cross join (values
  ('Ashgabat', 'ashgabat'),
  ('Balkanabat', 'balkanabat'),
  ('Dashoguz', 'dashoguz'),
  ('Mary', 'mary'),
  ('Turkmenabat', 'turkmenabat')
) as v(name, slug)
where c.slug = 'turkmenistan'
on conflict (country_id, slug) do nothing;

-- Uzbekistan
insert into cities (country_id, name, slug)
select c.id, v.name, v.slug
from countries c
cross join (values
  ('Andijan', 'andijan'),
  ('Bukhara', 'bukhara'),
  ('Namangan', 'namangan'),
  ('Samarkand', 'samarkand'),
  ('Tashkent', 'tashkent')
) as v(name, slug)
where c.slug = 'uzbekistan'
on conflict (country_id, slug) do nothing;
