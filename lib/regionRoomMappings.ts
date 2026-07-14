/**
 * Central region → Visit room mappings (global).
 * Room city slugs must exist (or be created by the global Mark-share migration).
 * Add new countries here only — no per-country resolver forks.
 */

export type RegionRoomMapping = {
  /** SpotDrop countries.slug */
  countrySlug: string;
  /** ISO 3166-1 alpha-2 */
  countryCode: string;
  /** ISO 3166-2 (e.g. CH-BE, US-CA, DE-BY) */
  subdivisionCode: string;
  /** English display name for the region */
  regionNameEn: string;
  /** Target public.cities.slug under that country */
  roomCitySlug: string;
  /** Multilingual / alternate names for fuzzy match */
  aliases: string[];
};

function m(
  countrySlug: string,
  countryCode: string,
  subdivisionCode: string,
  regionNameEn: string,
  roomCitySlug: string,
  aliases: string[] = []
): RegionRoomMapping {
  return { countrySlug, countryCode, subdivisionCode, regionNameEn, roomCitySlug, aliases };
}

/** Switzerland — 26 cantons → existing / featured hub rooms */
const SWITZERLAND: RegionRoomMapping[] = [
  m("switzerland", "CH", "CH-AG", "Aargau", "aargau", ["aargau", "argovie", "argovia"]),
  m("switzerland", "CH", "CH-AI", "Appenzell Innerrhoden", "appenzell", ["appenzell innerrhoden", "appenzell ir"]),
  m("switzerland", "CH", "CH-AR", "Appenzell Ausserrhoden", "appenzell", ["appenzell ausserrhoden", "appenzell ar"]),
  m("switzerland", "CH", "CH-BE", "Bern", "bern", ["bern", "berne", "kanton bern", "canton de berne"]),
  m("switzerland", "CH", "CH-BL", "Basel-Landschaft", "basel", ["basel-landschaft", "baselland", "bâle-campagne"]),
  m("switzerland", "CH", "CH-BS", "Basel-Stadt", "basel", ["basel-stadt", "bâle-ville", "basel"]),
  m("switzerland", "CH", "CH-FR", "Fribourg", "fribourg", ["fribourg", "freiburg"]),
  m("switzerland", "CH", "CH-GE", "Geneva", "geneva", ["geneva", "genève", "genf"]),
  m("switzerland", "CH", "CH-GL", "Glarus", "schwyz", ["glarus", "glaris"]),
  m("switzerland", "CH", "CH-GR", "Graubünden", "chur", ["graubünden", "graubunden", "grisons", "grigioni"]),
  m("switzerland", "CH", "CH-JU", "Jura", "jura", ["jura"]),
  m("switzerland", "CH", "CH-LU", "Lucerne", "lucerne", ["lucerne", "luzern", "lucerna"]),
  m("switzerland", "CH", "CH-NE", "Neuchâtel", "neuchatel", ["neuchâtel", "neuchatel", "neuenburg"]),
  m("switzerland", "CH", "CH-NW", "Nidwalden", "lucerne", ["nidwalden", "nidwald"]),
  m("switzerland", "CH", "CH-OW", "Obwalden", "lucerne", ["obwalden", "obwald"]),
  m("switzerland", "CH", "CH-SG", "St. Gallen", "st-gallen", ["st. gallen", "st gallen", "sankt gallen", "saint-gall"]),
  m("switzerland", "CH", "CH-SH", "Schaffhausen", "schaffhausen", ["schaffhausen", "schaffhouse"]),
  m("switzerland", "CH", "CH-SO", "Solothurn", "basel", ["solothurn", "soleure"]),
  m("switzerland", "CH", "CH-SZ", "Schwyz", "schwyz", ["schwyz"]),
  m("switzerland", "CH", "CH-TG", "Thurgau", "thurgau", ["thurgau", "thurgovie"]),
  m("switzerland", "CH", "CH-TI", "Ticino", "lugano", ["ticino", "tessin"]),
  m("switzerland", "CH", "CH-UR", "Uri", "lucerne", ["uri"]),
  m("switzerland", "CH", "CH-VD", "Vaud", "lausanne", ["vaud", "waadt"]),
  m("switzerland", "CH", "CH-VS", "Valais", "sion", ["valais", "wallis"]),
  m("switzerland", "CH", "CH-ZG", "Zug", "zug", ["zug", "zoug"]),
  m("switzerland", "CH", "CH-ZH", "Zurich", "zurich", ["zurich", "zürich", "zurigo"]),
];

/**
 * United States — state rooms (created by migration when missing).
 * NYC maps to new-york (existing city room serves as NY state hub).
 */
const UNITED_STATES: RegionRoomMapping[] = [
  m("united-states", "US", "US-AL", "Alabama", "alabama", ["alabama"]),
  m("united-states", "US", "US-AK", "Alaska", "alaska", ["alaska"]),
  m("united-states", "US", "US-AZ", "Arizona", "phoenix", ["arizona"]),
  m("united-states", "US", "US-AR", "Arkansas", "arkansas", ["arkansas"]),
  m("united-states", "US", "US-CA", "California", "california", ["california", "ca"]),
  m("united-states", "US", "US-CO", "Colorado", "denver", ["colorado"]),
  m("united-states", "US", "US-CT", "Connecticut", "connecticut", ["connecticut"]),
  m("united-states", "US", "US-DE", "Delaware", "delaware", ["delaware"]),
  m("united-states", "US", "US-DC", "District of Columbia", "washington-dc", ["washington dc", "district of columbia", "washington, d.c.", "washington, dc"]),
  m("united-states", "US", "US-FL", "Florida", "miami", ["florida"]),
  m("united-states", "US", "US-GA", "Georgia", "atlanta", ["georgia"]),
  m("united-states", "US", "US-HI", "Hawaii", "hawaii", ["hawaii"]),
  m("united-states", "US", "US-ID", "Idaho", "idaho", ["idaho"]),
  m("united-states", "US", "US-IL", "Illinois", "chicago", ["illinois"]),
  m("united-states", "US", "US-IN", "Indiana", "indianapolis", ["indiana"]),
  m("united-states", "US", "US-IA", "Iowa", "iowa", ["iowa"]),
  m("united-states", "US", "US-KS", "Kansas", "kansas", ["kansas"]),
  m("united-states", "US", "US-KY", "Kentucky", "kentucky", ["kentucky"]),
  m("united-states", "US", "US-LA", "Louisiana", "louisiana", ["louisiana"]),
  m("united-states", "US", "US-ME", "Maine", "maine", ["maine"]),
  m("united-states", "US", "US-MD", "Maryland", "maryland", ["maryland"]),
  m("united-states", "US", "US-MA", "Massachusetts", "boston", ["massachusetts"]),
  m("united-states", "US", "US-MI", "Michigan", "michigan", ["michigan"]),
  m("united-states", "US", "US-MN", "Minnesota", "minnesota", ["minnesota"]),
  m("united-states", "US", "US-MS", "Mississippi", "mississippi", ["mississippi"]),
  m("united-states", "US", "US-MO", "Missouri", "missouri", ["missouri"]),
  m("united-states", "US", "US-MT", "Montana", "montana", ["montana"]),
  m("united-states", "US", "US-NE", "Nebraska", "nebraska", ["nebraska"]),
  m("united-states", "US", "US-NV", "Nevada", "las-vegas", ["nevada"]),
  m("united-states", "US", "US-NH", "New Hampshire", "new-hampshire", ["new hampshire"]),
  m("united-states", "US", "US-NJ", "New Jersey", "new-jersey", ["new jersey"]),
  m("united-states", "US", "US-NM", "New Mexico", "new-mexico", ["new mexico"]),
  m("united-states", "US", "US-NY", "New York", "new-york", ["new york", "ny"]),
  m("united-states", "US", "US-NC", "North Carolina", "charlotte", ["north carolina"]),
  m("united-states", "US", "US-ND", "North Dakota", "north-dakota", ["north dakota"]),
  m("united-states", "US", "US-OH", "Ohio", "columbus", ["ohio"]),
  m("united-states", "US", "US-OK", "Oklahoma", "oklahoma", ["oklahoma"]),
  m("united-states", "US", "US-OR", "Oregon", "portland", ["oregon"]),
  m("united-states", "US", "US-PA", "Pennsylvania", "philadelphia", ["pennsylvania"]),
  m("united-states", "US", "US-RI", "Rhode Island", "rhode-island", ["rhode island"]),
  m("united-states", "US", "US-SC", "South Carolina", "south-carolina", ["south carolina"]),
  m("united-states", "US", "US-SD", "South Dakota", "south-dakota", ["south dakota"]),
  m("united-states", "US", "US-TN", "Tennessee", "nashville", ["tennessee"]),
  m("united-states", "US", "US-TX", "Texas", "houston", ["texas"]),
  m("united-states", "US", "US-UT", "Utah", "utah", ["utah"]),
  m("united-states", "US", "US-VT", "Vermont", "vermont", ["vermont"]),
  m("united-states", "US", "US-VA", "Virginia", "virginia", ["virginia"]),
  m("united-states", "US", "US-WA", "Washington", "seattle", ["washington"]),
  m("united-states", "US", "US-WV", "West Virginia", "west-virginia", ["west virginia"]),
  m("united-states", "US", "US-WI", "Wisconsin", "wisconsin", ["wisconsin"]),
  m("united-states", "US", "US-WY", "Wyoming", "wyoming", ["wyoming"]),
];

/** Germany — Bundesländer → regional rooms (created when missing) or capital hubs */
const GERMANY: RegionRoomMapping[] = [
  m("germany", "DE", "DE-BW", "Baden-Württemberg", "stuttgart", ["baden-württemberg", "baden-wurttemberg", "baden württemberg"]),
  m("germany", "DE", "DE-BY", "Bayern", "bayern", ["bayern", "bavaria"]),
  m("germany", "DE", "DE-BE", "Berlin", "berlin", ["berlin"]),
  m("germany", "DE", "DE-BB", "Brandenburg", "potsdam", ["brandenburg"]),
  m("germany", "DE", "DE-HB", "Bremen", "bremen", ["bremen"]),
  m("germany", "DE", "DE-HH", "Hamburg", "hamburg", ["hamburg"]),
  m("germany", "DE", "DE-HE", "Hessen", "frankfurt", ["hessen", "hesse"]),
  m("germany", "DE", "DE-MV", "Mecklenburg-Vorpommern", "rostock", ["mecklenburg-vorpommern", "mecklenburg vorpommern"]),
  m("germany", "DE", "DE-NI", "Niedersachsen", "hanover", ["niedersachsen", "lower saxony"]),
  m("germany", "DE", "DE-NW", "Nordrhein-Westfalen", "cologne", ["nordrhein-westfalen", "north rhine-westphalia", "nrw"]),
  m("germany", "DE", "DE-RP", "Rheinland-Pfalz", "rheinland-pfalz", ["rheinland-pfalz", "rhineland-palatinate"]),
  m("germany", "DE", "DE-SL", "Saarland", "saarland", ["saarland"]),
  m("germany", "DE", "DE-SN", "Sachsen", "leipzig", ["sachsen", "saxony"]),
  m("germany", "DE", "DE-ST", "Sachsen-Anhalt", "sachsen-anhalt", ["sachsen-anhalt", "saxony-anhalt"]),
  m("germany", "DE", "DE-SH", "Schleswig-Holstein", "kiel", ["schleswig-holstein"]),
  m("germany", "DE", "DE-TH", "Thüringen", "thuringen", ["thüringen", "thuringia", "thuringen"]),
];

/** France — régions → regional rooms / city hubs */
const FRANCE: RegionRoomMapping[] = [
  m("france", "FR", "FR-ARA", "Auvergne-Rhône-Alpes", "lyon", ["auvergne-rhône-alpes", "auvergne-rhone-alpes"]),
  m("france", "FR", "FR-BFC", "Bourgogne-Franche-Comté", "dijon", ["bourgogne-franche-comté", "bourgogne-franche-comte"]),
  m("france", "FR", "FR-BRE", "Bretagne", "rennes", ["bretagne", "brittany"]),
  m("france", "FR", "FR-CVL", "Centre-Val de Loire", "centre-val-de-loire", ["centre-val de loire", "centre-val-de-loire"]),
  m("france", "FR", "FR-20R", "Corse", "corse", ["corse", "corsica"]),
  m("france", "FR", "FR-GES", "Grand Est", "strasbourg", ["grand est"]),
  m("france", "FR", "FR-HDF", "Hauts-de-France", "lille", ["hauts-de-france"]),
  m("france", "FR", "FR-IDF", "Île-de-France", "paris", ["île-de-france", "ile-de-france", "ile de france"]),
  m("france", "FR", "FR-NOR", "Normandie", "normandie", ["normandie", "normandy"]),
  m("france", "FR", "FR-NAQ", "Nouvelle-Aquitaine", "bordeaux", ["nouvelle-aquitaine"]),
  m("france", "FR", "FR-OCC", "Occitanie", "toulouse", ["occitanie"]),
  m("france", "FR", "FR-PDL", "Pays de la Loire", "nantes", ["pays de la loire", "pays-de-la-loire"]),
  m(
    "france",
    "FR",
    "FR-PAC",
    "Provence-Alpes-Côte d'Azur",
    "provence-alpes-cote-dazur",
    ["provence-alpes-côte d'azur", "provence-alpes-cote d'azur", "provence-alpes-cote-dazur", "paca", "provence"]
  ),
];

/** Italy — regioni */
const ITALY: RegionRoomMapping[] = [
  m("italy", "IT", "IT-65", "Abruzzo", "abruzzo", ["abruzzo"]),
  m("italy", "IT", "IT-77", "Basilicata", "basilicata", ["basilicata"]),
  m("italy", "IT", "IT-78", "Calabria", "calabria", ["calabria"]),
  m("italy", "IT", "IT-72", "Campania", "naples", ["campania"]),
  m("italy", "IT", "IT-45", "Emilia-Romagna", "bologna", ["emilia-romagna", "emilia romagna"]),
  m("italy", "IT", "IT-36", "Friuli-Venezia Giulia", "trieste", ["friuli-venezia giulia", "friuli venezia giulia"]),
  m("italy", "IT", "IT-62", "Lazio", "rome", ["lazio"]),
  m("italy", "IT", "IT-42", "Liguria", "genoa", ["liguria"]),
  m("italy", "IT", "IT-25", "Lombardia", "lombardia", ["lombardia", "lombardy", "lombardia"]),
  m("italy", "IT", "IT-57", "Marche", "marche", ["marche"]),
  m("italy", "IT", "IT-67", "Molise", "molise", ["molise"]),
  m("italy", "IT", "IT-21", "Piemonte", "turin", ["piemonte", "piedmont"]),
  m("italy", "IT", "IT-75", "Puglia", "bari", ["puglia", "apulia"]),
  m("italy", "IT", "IT-88", "Sardegna", "sardegna", ["sardegna", "sardinia"]),
  m("italy", "IT", "IT-82", "Sicilia", "palermo", ["sicilia", "sicily"]),
  m("italy", "IT", "IT-52", "Toscana", "florence", ["toscana", "tuscany"]),
  m("italy", "IT", "IT-32", "Trentino-Alto Adige", "trentino-alto-adige", ["trentino-alto adige", "trentino-south tyrol"]),
  m("italy", "IT", "IT-55", "Umbria", "umbria", ["umbria"]),
  m("italy", "IT", "IT-23", "Valle d'Aosta", "valle-daosta", ["valle d'aosta", "aosta valley"]),
  m("italy", "IT", "IT-34", "Veneto", "venice", ["veneto"]),
];

/** Austria — Bundesländer */
const AUSTRIA: RegionRoomMapping[] = [
  m("austria", "AT", "AT-1", "Burgenland", "burgenland", ["burgenland"]),
  m("austria", "AT", "AT-2", "Kärnten", "klagenfurt", ["kärnten", "karnten", "carinthia"]),
  m("austria", "AT", "AT-3", "Niederösterreich", "niederosterreich", ["niederösterreich", "niederosterreich", "lower austria"]),
  m("austria", "AT", "AT-4", "Oberösterreich", "linz", ["oberösterreich", "oberosterreich", "upper austria"]),
  m("austria", "AT", "AT-5", "Salzburg", "salzburg", ["salzburg"]),
  m("austria", "AT", "AT-6", "Steiermark", "graz", ["steiermark", "styria"]),
  m("austria", "AT", "AT-7", "Tirol", "innsbruck", ["tirol", "tyrol"]),
  m("austria", "AT", "AT-8", "Vorarlberg", "vorarlberg", ["vorarlberg"]),
  m("austria", "AT", "AT-9", "Wien", "vienna", ["wien", "vienna"]),
];

/** Spain — comunidades autónomas */
const SPAIN: RegionRoomMapping[] = [
  m("spain", "ES", "ES-AN", "Andalucía", "seville", ["andalucía", "andalucia", "andalusia"]),
  m("spain", "ES", "ES-AR", "Aragón", "zaragoza", ["aragón", "aragon"]),
  m("spain", "ES", "ES-AS", "Asturias", "asturias", ["asturias", "principado de asturias"]),
  m("spain", "ES", "ES-IB", "Illes Balears", "palma", ["illes balears", "balearic islands", "baleares"]),
  m("spain", "ES", "ES-CN", "Canarias", "las-palmas", ["canarias", "canary islands"]),
  m("spain", "ES", "ES-CB", "Cantabria", "cantabria", ["cantabria"]),
  m("spain", "ES", "ES-CL", "Castilla y León", "salamanca", ["castilla y león", "castilla y leon", "castile and león"]),
  m("spain", "ES", "ES-CM", "Castilla-La Mancha", "castilla-la-mancha", ["castilla-la mancha", "castile-la mancha"]),
  m("spain", "ES", "ES-CT", "Catalunya", "barcelona", ["catalunya", "cataluña", "catalonia"]),
  m("spain", "ES", "ES-EX", "Extremadura", "extremadura", ["extremadura"]),
  m("spain", "ES", "ES-GA", "Galicia", "santiago-de-compostela", ["galicia"]),
  m("spain", "ES", "ES-MD", "Madrid", "madrid", ["madrid", "comunidad de madrid"]),
  m("spain", "ES", "ES-MC", "Murcia", "murcia", ["murcia", "región de murcia"]),
  m("spain", "ES", "ES-NC", "Navarra", "navarra", ["navarra", "navarre"]),
  m("spain", "ES", "ES-PV", "País Vasco", "bilbao", ["país vasco", "pais vasco", "basque country", "euskadi"]),
  m("spain", "ES", "ES-RI", "La Rioja", "la-rioja", ["la rioja"]),
  m("spain", "ES", "ES-VC", "Comunitat Valenciana", "valencia", ["comunitat valenciana", "comunidad valenciana", "valencian community"]),
];

/** United Kingdom — countries / nations as first-level areas */
const UNITED_KINGDOM: RegionRoomMapping[] = [
  m("united-kingdom", "GB", "GB-ENG", "England", "london", ["england"]),
  m("united-kingdom", "GB", "GB-SCT", "Scotland", "edinburgh", ["scotland", "alba"]),
  m("united-kingdom", "GB", "GB-WLS", "Wales", "cardiff", ["wales", "cymru"]),
  m("united-kingdom", "GB", "GB-NIR", "Northern Ireland", "belfast", ["northern ireland"]),
];

/** Canada — provinces and territories (rooms ensured by migration) */
const CANADA: RegionRoomMapping[] = [
  m("canada", "CA", "CA-AB", "Alberta", "alberta", ["alberta"]),
  m("canada", "CA", "CA-BC", "British Columbia", "british-columbia", ["british columbia", "bc"]),
  m("canada", "CA", "CA-MB", "Manitoba", "manitoba", ["manitoba"]),
  m("canada", "CA", "CA-NB", "New Brunswick", "new-brunswick", ["new brunswick"]),
  m("canada", "CA", "CA-NL", "Newfoundland and Labrador", "newfoundland-and-labrador", [
    "newfoundland and labrador",
    "newfoundland",
  ]),
  m("canada", "CA", "CA-NS", "Nova Scotia", "nova-scotia", ["nova scotia"]),
  m("canada", "CA", "CA-NT", "Northwest Territories", "northwest-territories", ["northwest territories"]),
  m("canada", "CA", "CA-NU", "Nunavut", "nunavut", ["nunavut"]),
  m("canada", "CA", "CA-ON", "Ontario", "ontario", ["ontario"]),
  m("canada", "CA", "CA-PE", "Prince Edward Island", "prince-edward-island", ["prince edward island", "pei"]),
  m("canada", "CA", "CA-QC", "Quebec", "quebec", ["quebec", "québec"]),
  m("canada", "CA", "CA-SK", "Saskatchewan", "saskatchewan", ["saskatchewan"]),
  m("canada", "CA", "CA-YT", "Yukon", "yukon", ["yukon"]),
];

/** Russia — federal subjects mapped to existing rooms where available */
const RUSSIA: RegionRoomMapping[] = [
  m("russia", "RU", "RU-MOW", "Moscow", "moscow", ["moscow", "москва"]),
  m("russia", "RU", "RU-SPE", "Saint Petersburg", "saint-petersburg", ["saint petersburg", "st petersburg", "санкт-петербург"]),
  m("russia", "RU", "RU-TA", "Tatarstan", "tatarstan", ["tatarstan", "republic of tatarstan"]),
  m("russia", "RU", "RU-DA", "Dagestan", "dagestan", ["dagestan"]),
  m("russia", "RU", "RU-CE", "Chechnya", "chechen-republic", ["chechnya", "chechen republic", "chechen-republic"]),
  m("russia", "RU", "RU-IN", "Ingushetia", "ingushetia", ["ingushetia"]),
  m("russia", "RU", "RU-KDA", "Krasnodar Krai", "krasnodar", ["krasnodar krai", "krasnodar"]),
  m("russia", "RU", "RU-SAM", "Samara Oblast", "samara", ["samara", "samara oblast"]),
  m("russia", "RU", "RU-SVE", "Sverdlovsk Oblast", "yekaterinburg", ["sverdlovsk", "yekaterinburg"]),
];

/**
 * Rooms that may need to be inserted as cities for regional hubs
 * (slug + display name + country slug). Existing city rows are left alone.
 */
export const REGION_HUB_ROOMS_TO_ENSURE: Array<{
  countrySlug: string;
  slug: string;
  name: string;
}> = [
  // US dedicated state rooms (when not already a major city slug)
  { countrySlug: "united-states", slug: "california", name: "California" },
  { countrySlug: "united-states", slug: "alabama", name: "Alabama" },
  { countrySlug: "united-states", slug: "alaska", name: "Alaska" },
  { countrySlug: "united-states", slug: "arkansas", name: "Arkansas" },
  { countrySlug: "united-states", slug: "connecticut", name: "Connecticut" },
  { countrySlug: "united-states", slug: "delaware", name: "Delaware" },
  { countrySlug: "united-states", slug: "hawaii", name: "Hawaii" },
  { countrySlug: "united-states", slug: "idaho", name: "Idaho" },
  { countrySlug: "united-states", slug: "iowa", name: "Iowa" },
  { countrySlug: "united-states", slug: "kansas", name: "Kansas" },
  { countrySlug: "united-states", slug: "kentucky", name: "Kentucky" },
  { countrySlug: "united-states", slug: "louisiana", name: "Louisiana" },
  { countrySlug: "united-states", slug: "maine", name: "Maine" },
  { countrySlug: "united-states", slug: "maryland", name: "Maryland" },
  { countrySlug: "united-states", slug: "michigan", name: "Michigan" },
  { countrySlug: "united-states", slug: "minnesota", name: "Minnesota" },
  { countrySlug: "united-states", slug: "mississippi", name: "Mississippi" },
  { countrySlug: "united-states", slug: "missouri", name: "Missouri" },
  { countrySlug: "united-states", slug: "montana", name: "Montana" },
  { countrySlug: "united-states", slug: "nebraska", name: "Nebraska" },
  { countrySlug: "united-states", slug: "new-hampshire", name: "New Hampshire" },
  { countrySlug: "united-states", slug: "new-jersey", name: "New Jersey" },
  { countrySlug: "united-states", slug: "new-mexico", name: "New Mexico" },
  { countrySlug: "united-states", slug: "north-dakota", name: "North Dakota" },
  { countrySlug: "united-states", slug: "oklahoma", name: "Oklahoma" },
  { countrySlug: "united-states", slug: "rhode-island", name: "Rhode Island" },
  { countrySlug: "united-states", slug: "south-carolina", name: "South Carolina" },
  { countrySlug: "united-states", slug: "south-dakota", name: "South Dakota" },
  { countrySlug: "united-states", slug: "utah", name: "Utah" },
  { countrySlug: "united-states", slug: "vermont", name: "Vermont" },
  { countrySlug: "united-states", slug: "virginia", name: "Virginia" },
  { countrySlug: "united-states", slug: "west-virginia", name: "West Virginia" },
  { countrySlug: "united-states", slug: "wisconsin", name: "Wisconsin" },
  { countrySlug: "united-states", slug: "wyoming", name: "Wyoming" },
  // DE / FR / IT / AT / ES regional hubs
  { countrySlug: "germany", slug: "bayern", name: "Bayern" },
  { countrySlug: "germany", slug: "rheinland-pfalz", name: "Rheinland-Pfalz" },
  { countrySlug: "germany", slug: "saarland", name: "Saarland" },
  { countrySlug: "germany", slug: "sachsen-anhalt", name: "Sachsen-Anhalt" },
  { countrySlug: "germany", slug: "thuringen", name: "Thüringen" },
  { countrySlug: "france", slug: "provence-alpes-cote-dazur", name: "Provence-Alpes-Côte d'Azur" },
  { countrySlug: "france", slug: "centre-val-de-loire", name: "Centre-Val de Loire" },
  { countrySlug: "france", slug: "corse", name: "Corse" },
  { countrySlug: "france", slug: "normandie", name: "Normandie" },
  { countrySlug: "italy", slug: "lombardia", name: "Lombardia" },
  { countrySlug: "italy", slug: "abruzzo", name: "Abruzzo" },
  { countrySlug: "italy", slug: "basilicata", name: "Basilicata" },
  { countrySlug: "italy", slug: "calabria", name: "Calabria" },
  { countrySlug: "italy", slug: "marche", name: "Marche" },
  { countrySlug: "italy", slug: "molise", name: "Molise" },
  { countrySlug: "italy", slug: "sardegna", name: "Sardegna" },
  { countrySlug: "italy", slug: "umbria", name: "Umbria" },
  { countrySlug: "italy", slug: "trentino-alto-adige", name: "Trentino-Alto Adige" },
  { countrySlug: "italy", slug: "valle-daosta", name: "Valle d'Aosta" },
  { countrySlug: "austria", slug: "burgenland", name: "Burgenland" },
  { countrySlug: "austria", slug: "niederosterreich", name: "Niederösterreich" },
  { countrySlug: "austria", slug: "vorarlberg", name: "Vorarlberg" },
  { countrySlug: "spain", slug: "asturias", name: "Asturias" },
  { countrySlug: "spain", slug: "cantabria", name: "Cantabria" },
  { countrySlug: "spain", slug: "castilla-la-mancha", name: "Castilla-La Mancha" },
  { countrySlug: "spain", slug: "extremadura", name: "Extremadura" },
  { countrySlug: "spain", slug: "navarra", name: "Navarra" },
  { countrySlug: "spain", slug: "la-rioja", name: "La Rioja" },
  { countrySlug: "russia", slug: "yekaterinburg", name: "Yekaterinburg" },
  // Canada provincial / territorial rooms
  { countrySlug: "canada", slug: "alberta", name: "Alberta" },
  { countrySlug: "canada", slug: "british-columbia", name: "British Columbia" },
  { countrySlug: "canada", slug: "manitoba", name: "Manitoba" },
  { countrySlug: "canada", slug: "new-brunswick", name: "New Brunswick" },
  { countrySlug: "canada", slug: "newfoundland-and-labrador", name: "Newfoundland and Labrador" },
  { countrySlug: "canada", slug: "nova-scotia", name: "Nova Scotia" },
  { countrySlug: "canada", slug: "northwest-territories", name: "Northwest Territories" },
  { countrySlug: "canada", slug: "nunavut", name: "Nunavut" },
  { countrySlug: "canada", slug: "ontario", name: "Ontario" },
  { countrySlug: "canada", slug: "prince-edward-island", name: "Prince Edward Island" },
  { countrySlug: "canada", slug: "quebec", name: "Quebec" },
  { countrySlug: "canada", slug: "saskatchewan", name: "Saskatchewan" },
  { countrySlug: "canada", slug: "yukon", name: "Yukon" },
];

/** Full catalog — single source of truth for app + SQL seed generator. */
export const REGION_ROOM_MAPPINGS: readonly RegionRoomMapping[] = [
  ...SWITZERLAND,
  ...UNITED_STATES,
  ...GERMANY,
  ...FRANCE,
  ...ITALY,
  ...AUSTRIA,
  ...SPAIN,
  ...UNITED_KINGDOM,
  ...CANADA,
  ...RUSSIA,
];

export function listRegionRoomMappingsByCountry(countrySlug: string) {
  return REGION_ROOM_MAPPINGS.filter((row) => row.countrySlug === countrySlug);
}

export function findRegionRoomMappingBySubdivision(
  countryCodeOrSlug: string,
  subdivisionCode: string
): RegionRoomMapping | null {
  const code = subdivisionCode.trim().toUpperCase();
  const key = countryCodeOrSlug.trim().toLowerCase();

  return (
    REGION_ROOM_MAPPINGS.find((row) => {
      const countryMatch =
        row.countryCode.toLowerCase() === key || row.countrySlug.toLowerCase() === key;
      return countryMatch && row.subdivisionCode.toUpperCase() === code;
    }) ?? null
  );
}
