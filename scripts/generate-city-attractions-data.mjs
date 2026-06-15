import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @typedef {[string, string, string, number, number, string[]]} PlaceTuple */

/**
 * @param {number} lat
 * @param {number} lng
 * @param {string} region
 * @param {number} radius
 * @param {PlaceTuple[]} places
 */
function city(lat, lng, region, radius, places) {
  return {
    coords: { lat, lng, region, searchRadiusKm: radius },
    places: places.map(([name, description, address, placeLat, placeLng, categories], index) => ({
      rank: index + 1,
      name,
      description,
      address,
      lat: placeLat,
      lng: placeLng,
      categories,
    })),
  };
}

/** @type {Record<string, Record<string, ReturnType<typeof city>>>} */
const ATTRACTIONS = {
  switzerland: {
    zurich: city(47.3769, 8.5417, "Zürich", 15, [
      ["Grossmünster", "Romanesque twin-tower church and Zurich landmark.", "Grossmünsterplatz, 8001 Zürich, Switzerland", 47.3701, 8.5439, ["landmark", "historic_site"]],
      ["Lake Zurich (Zürichsee)", "City lake with promenades, swimming, and boat trips.", "Zürichsee, 8001 Zürich, Switzerland", 47.3667, 8.55, ["lake", "tourist_attraction"]],
      ["Lindenhof", "Hilltop park with Roman ruins and old-town panoramas.", "Lindenhof, 8001 Zürich, Switzerland", 47.3732, 8.5419, ["park", "viewpoint"]],
      ["Swiss National Museum", "National history in a fairytale castle by the main station.", "Museumstrasse 2, 8001 Zürich, Switzerland", 47.3791, 8.5402, ["museum", "castle"]],
    ]),
    geneva: city(46.2044, 6.1432, "Geneva", 15, [
      ["Jet d'Eau", "Iconic 140-metre water fountain on Lake Geneva.", "Quai du Général-Guisan, 1204 Genève, Switzerland", 46.2074, 6.1559, ["landmark", "monument"]],
      ["St. Pierre Cathedral", "Historic cathedral overlooking Geneva's old town.", "Place du Bourg-de-Four 24, 1204 Genève, Switzerland", 46.2011, 6.1486, ["landmark", "historic_site"]],
      ["United Nations Office", "Palais des Nations and Ariana Park on the lake.", "14 Av. de la Paix, 1211 Genève, Switzerland", 46.2266, 6.1403, ["landmark", "historic_site"]],
      ["Parc des Bastions", "Park with Reformation Wall and chess players.", "Promenade des Bastions 1, 1205 Genève, Switzerland", 46.1992, 6.1455, ["park", "monument"]],
    ]),
    basel: city(47.5596, 7.5886, "Basel", 15, [
      ["Basel Minster", "Red sandstone cathedral above the Rhine.", "Münsterplatz 9, 4051 Basel, Switzerland", 47.5563, 7.5924, ["landmark", "historic_site"]],
      ["Kunstmuseum Basel", "Switzerland's oldest public art museum.", "St. Alban-Graben 16, 4051 Basel, Switzerland", 47.5536, 7.594, ["museum"]],
      ["Rhine Promenade", "Riverside walks and ferries through the old town.", "Rheinpromenade, 4051 Basel, Switzerland", 47.5608, 7.5898, ["river", "tourist_attraction"]],
      ["Tinguely Fountain", "Kinetic sculpture fountain in Theaterplatz.", "Theaterplatz, 4051 Basel, Switzerland", 47.5515, 7.5908, ["monument", "tourist_attraction"]],
    ]),
    bern: city(46.948, 7.4474, "Bern", 18, [
      ["Bear Park (Bärenpark)", "Home of Bern's bears beside the Aare with riverside walks.", "Grosser Muristalden 6, 3006 Bern, Switzerland", 46.9481, 7.4594, ["park", "tourist_attraction"]],
      ["Zytglogge", "Medieval clock tower and symbol of Bern's old town.", "Bim Zytglogge 3, 3011 Bern, Switzerland", 46.948, 7.4478, ["landmark", "historic_site"]],
      ["Rosengarten", "Rose garden above the Aare with views of the old town and Alps.", "Alter Aargauerstalden 31b, 3006 Bern, Switzerland", 46.9519, 7.4607, ["park", "viewpoint"]],
      ["Gurten", "Bern's local mountain with panorama over the city and Alps.", "Gurten Kulm, 3084 Wabern bei Bern, Switzerland", 46.853, 7.507, ["mountain", "viewpoint"]],
    ]),
    lausanne: city(46.5197, 6.6323, "Vaud", 15, [
      ["Lausanne Cathedral", "Gothic cathedral overlooking Lake Geneva.", "Place de la Cathédrale 13, 1005 Lausanne, Switzerland", 46.5228, 6.6356, ["landmark", "historic_site"]],
      ["Olympic Museum", "Interactive museum celebrating the Olympic movement.", "1 Quai d'Ouchy, 1006 Lausanne, Switzerland", 46.5086, 6.6341, ["museum", "tourist_attraction"]],
      ["Ouchy Waterfront", "Lakeside promenade with views of the Alps.", "Quai d'Ouchy, 1006 Lausanne, Switzerland", 46.5082, 6.6318, ["lake", "park"]],
      ["Collection de l'Art Brut", "Museum of outsider art in a lakeside château.", "11 Av. des Bergières, 1004 Lausanne, Switzerland", 46.527, 6.6248, ["museum"]],
    ]),
    lugano: city(46.0037, 8.9511, "Ticino", 18, [
      ["Lake Lugano", "Palm-lined lake with boat cruises and mountain views.", "Lago di Lugano, 6900 Lugano, Switzerland", 46.003, 8.97, ["lake", "tourist_attraction"]],
      ["Parco Ciani", "Lakeside park with subtropical gardens.", "Viale Carlo Cattaneo, 6900 Lugano, Switzerland", 46.0062, 8.9528, ["park"]],
      ["Monte San Salvatore", "Funicular to panoramic summit above Lugano.", "Monte San Salvatore, 6902 Paradiso, Switzerland", 45.9772, 8.9489, ["mountain", "viewpoint"]],
      ["Lugano Cathedral", "Renaissance cathedral in the historic center.", "Piazza Riforma, 6900 Lugano, Switzerland", 46.0035, 8.9515, ["landmark", "historic_site"]],
    ]),
  },
  germany: {
    berlin: city(52.52, 13.405, "Berlin", 20, [
      ["Brandenburg Gate", "Neoclassical gate and symbol of German reunification.", "Pariser Platz, 10117 Berlin, Germany", 52.5163, 13.3777, ["landmark", "monument"]],
      ["Reichstag Building", "Parliament dome with panoramic city views.", "Platz der Republik 1, 11011 Berlin, Germany", 52.5186, 13.3762, ["landmark", "historic_site"]],
      ["Museum Island", "UNESCO cluster of world-class museums on the Spree.", "Museumsinsel, 10178 Berlin, Germany", 52.521, 13.3969, ["museum", "historic_site"]],
      ["Berlin Wall Memorial", "Preserved wall section and documentation center.", "Bernauer Str. 111, 13355 Berlin, Germany", 52.5351, 13.3902, ["monument", "historic_site"]],
    ]),
    munich: city(48.1351, 11.582, "Bavaria", 18, [
      ["Marienplatz", "Central square with Glockenspiel and New Town Hall.", "Marienplatz, 80331 München, Germany", 48.1374, 11.5755, ["public_square", "landmark"]],
      ["Nymphenburg Palace", "Baroque summer residence with vast gardens.", "Schloß Nymphenburg 1, 80638 München, Germany", 48.1583, 11.5033, ["castle", "park"]],
      ["English Garden", "One of the world's largest urban parks with surfers.", "Englischer Garten, 80538 München, Germany", 48.152, 11.59, ["park"]],
      ["Frauenkirche", "Twin-domed cathedral and Munich landmark.", "Frauenplatz 12, 80331 München, Germany", 48.1386, 11.5736, ["landmark", "historic_site"]],
    ]),
    hamburg: city(53.5511, 9.9937, "Hamburg", 18, [
      ["Elbphilharmonie", "Wave-shaped concert hall on the harbour.", "Platz der Deutschen Einheit 4, 20457 Hamburg, Germany", 53.5413, 9.9849, ["landmark", "tourist_attraction"]],
      ["Speicherstadt", "UNESCO brick warehouse district on canals.", "Speicherstadt, 20457 Hamburg, Germany", 53.5438, 9.9969, ["historic_site", "tourist_attraction"]],
      ["Miniatur Wunderland", "World's largest model railway in Speicherstadt.", "Kehrwieder 2, 20457 Hamburg, Germany", 53.5439, 9.9891, ["museum", "tourist_attraction"]],
      ["St. Michael's Church", "Baroque church tower with harbour panoramas.", "Englische Planke 1, 20459 Hamburg, Germany", 53.5488, 9.9782, ["landmark", "viewpoint"]],
    ]),
    frankfurt: city(50.1109, 8.6821, "Hesse", 15, [
      ["Römer", "Medieval town hall on Frankfurt's historic square.", "Römerberg 27, 60311 Frankfurt am Main, Germany", 50.1106, 8.6821, ["landmark", "historic_site"]],
      ["Palmengarten", "Botanical garden with tropical greenhouses.", "Siesmayerstraße 63, 60323 Frankfurt am Main, Germany", 50.1234, 8.6589, ["park", "tourist_attraction"]],
      ["Goethe House", "Birthplace museum of Germany's greatest writer.", "Großer Hirschgraben 23-25, 60311 Frankfurt am Main, Germany", 50.1112, 8.6756, ["museum", "historic_site"]],
      ["Main Tower", "Skyscraper observation deck over the skyline.", "Neue Mainzer Str. 52-58, 60311 Frankfurt am Main, Germany", 50.1125, 8.6722, ["viewpoint", "landmark"]],
    ]),
    cologne: city(50.9375, 6.9603, "North Rhine-Westphalia", 15, [
      ["Cologne Cathedral", "Gothic twin-spired UNESCO cathedral.", "Domkloster 4, 50667 Köln, Germany", 50.9413, 6.9583, ["landmark", "historic_site"]],
      ["Hohenzollern Bridge", "Rhine bridge famed for love locks and cathedral views.", "Hohenzollernbrücke, 50667 Köln, Germany", 50.9415, 6.9656, ["bridge", "landmark"]],
      ["Cologne Old Town", "Colorful alleys and Rhine promenade near the Dom.", "Altstadt, 50667 Köln, Germany", 50.938, 6.962, ["old_town", "historic_site"]],
      ["Museum Ludwig", "Modern art museum beside the cathedral.", "Heinrich-Böll-Platz, 50667 Köln, Germany", 50.9406, 6.9603, ["museum"]],
    ]),
    stuttgart: city(48.7758, 9.1829, "Baden-Württemberg", 15, [
      ["Mercedes-Benz Museum", "Automotive history in a spiral gallery.", "Mercedesstraße 100, 70372 Stuttgart, Germany", 48.7883, 9.2339, ["museum", "tourist_attraction"]],
      ["Schlossplatz Stuttgart", "Palace square at the heart of the city.", "Schlossplatz, 70173 Stuttgart, Germany", 48.7784, 9.1799, ["public_square", "landmark"]],
      ["Wilhelma Zoo and Botanical Garden", "Historic park with Moorish architecture.", "Wilhelma 13, 70376 Stuttgart, Germany", 48.8042, 9.2086, ["park", "museum"]],
      ["Fernsehturm Stuttgart", "First TV tower in the world with viewing platform.", "Jahnstraße 120, 70597 Stuttgart, Germany", 48.7558, 9.1901, ["viewpoint", "landmark"]],
    ]),
  },
  france: {
    paris: city(48.8566, 2.3522, "Île-de-France", 20, [
      ["Eiffel Tower", "Iron lattice tower and global symbol of Paris.", "Champ de Mars, 5 Av. Anatole France, 75007 Paris, France", 48.8584, 2.2945, ["landmark", "monument"]],
      ["Louvre Museum", "World's largest art museum in a former royal palace.", "Rue de Rivoli, 75001 Paris, France", 48.8606, 2.3376, ["museum", "historic_site"]],
      ["Arc de Triomphe", "Napoleonic triumphal arch at Place Charles de Gaulle.", "Pl. Charles de Gaulle, 75008 Paris, France", 48.8738, 2.295, ["monument", "landmark"]],
      ["Notre-Dame Cathedral", "Gothic cathedral on the Île de la Cité.", "6 Parvis Notre-Dame - Pl. Jean-Paul II, 75004 Paris, France", 48.853, 2.3499, ["landmark", "historic_site"]],
    ]),
    marseille: city(43.2965, 5.3698, "Provence-Alpes-Côte d'Azur", 18, [
      ["Basilica of Notre-Dame de la Garde", "Hilltop basilica watching over the harbour.", "Rue Fort du Sanctuaire, 13006 Marseille, France", 43.2841, 5.3711, ["landmark", "viewpoint"]],
      ["Vieux-Port (Old Port)", "Historic harbour heart of Marseille.", "Vieux-Port, 13001 Marseille, France", 43.2947, 5.3741, ["old_town", "tourist_attraction"]],
      ["MuCEM", "Museum of European and Mediterranean civilizations.", "1 Esp. J4, 13002 Marseille, France", 43.2968, 5.3615, ["museum", "landmark"]],
      ["Calanques National Park", "Dramatic limestone fjords along the coast.", "Calanques, 13008 Marseille, France", 43.2108, 5.4386, ["park", "viewpoint"]],
    ]),
    lyon: city(45.764, 4.8357, "Auvergne-Rhône-Alpes", 15, [
      ["Basilica of Notre-Dame de Fourvière", "Hilltop basilica with panoramic city views.", "8 Pl. de Fourvière, 69005 Lyon, France", 45.7624, 4.8227, ["landmark", "viewpoint"]],
      ["Vieux Lyon", "Renaissance old town with traboule passageways.", "Vieux Lyon, 69005 Lyon, France", 45.7629, 4.8274, ["old_town", "historic_site"]],
      ["Parc de la Tête d'Or", "Vast urban park with lake and botanical garden.", "Parc de la Tête d'Or, 69006 Lyon, France", 45.7831, 4.854, ["park"]],
      ["Musée des Confluences", "Science and anthropology museum at river confluence.", "86 Quai Perrache, 69002 Lyon, France", 45.7325, 4.8183, ["museum", "landmark"]],
    ]),
    toulouse: city(43.6047, 1.4442, "Occitanie", 15, [
      ["Capitole de Toulouse", "Pink city hall and opera on the main square.", "Pl. du Capitole, 31000 Toulouse, France", 43.6043, 1.4437, ["landmark", "public_square"]],
      ["Basilica of Saint-Sernin", "Romanesque pilgrimage basilica.", "Pl. Saint-Sernin, 31000 Toulouse, France", 43.6082, 1.4418, ["landmark", "historic_site"]],
      ["Cité de l'Espace", "Space exploration theme park and museum.", "Av. Jean Gonord, 31500 Toulouse, France", 43.5867, 1.4939, ["museum", "tourist_attraction"]],
      ["Pont Neuf", "Historic bridge over the Garonne.", "Pont Neuf, 31000 Toulouse, France", 43.5994, 1.4397, ["bridge", "landmark"]],
    ]),
    nice: city(43.7102, 7.262, "Provence-Alpes-Côte d'Azur", 15, [
      ["Promenade des Anglais", "Iconic seafront boulevard along the Baie des Anges.", "Promenade des Anglais, 06000 Nice, France", 43.6951, 7.2656, ["tourist_attraction", "public_square"]],
      ["Castle Hill (Colline du Château)", "Park ruins with panoramic harbour views.", "Colline du Château, 06300 Nice, France", 43.6959, 7.2795, ["park", "viewpoint"]],
      ["Old Town Nice (Vieux Nice)", "Colorful markets and baroque churches.", "Vieux Nice, 06300 Nice, France", 43.6956, 7.2754, ["old_town", "historic_site"]],
      ["Marc Chagall National Museum", "Largest public collection of Chagall's work.", "Av. Dr Ménard, 06000 Nice, France", 43.687, 7.2719, ["museum"]],
    ]),
    bordeaux: city(44.8378, -0.5792, "Nouvelle-Aquitaine", 15, [
      ["Place de la Bourse", "18th-century square with mirror water pool.", "Pl. de la Bourse, 33000 Bordeaux, France", 44.8413, -0.5697, ["public_square", "landmark"]],
      ["Cathédrale Saint-André", "Gothic cathedral and UNESCO old town anchor.", "Pl. Pey Berland, 33000 Bordeaux, France", 44.8376, -0.5781, ["landmark", "historic_site"]],
      ["Cité du Vin", "Interactive wine museum on the Garonne.", "134 Quai de Bacalan, 33300 Bordeaux, France", 44.8624, -0.5506, ["museum", "tourist_attraction"]],
      ["Pont de Pierre", "Stone bridge spanning the Garonne.", "Pont de Pierre, 33000 Bordeaux, France", 44.8386, -0.5625, ["bridge", "landmark"]],
    ]),
  },
  italy: {
    rome: city(41.9028, 12.4964, "Lazio", 20, [
      ["Colosseum", "Ancient amphitheatre and icon of Imperial Rome.", "Piazza del Colosseo, 00184 Roma RM, Italy", 41.8902, 12.4922, ["landmark", "historic_site"]],
      ["Vatican Museums & St. Peter's Basilica", "Renaissance art and the world's largest church.", "00120 Vatican City", 41.9022, 12.4539, ["museum", "landmark"]],
      ["Trevi Fountain", "Baroque fountain where visitors toss coins.", "Piazza di Trevi, 00187 Roma RM, Italy", 41.9009, 12.4833, ["monument", "landmark"]],
      ["Roman Forum & Palatine Hill", "Ruins of the ancient civic heart of Rome.", "Via della Salara Vecchia, 00186 Roma RM, Italy", 41.8925, 12.4853, ["historic_site", "tourist_attraction"]],
    ]),
    milan: city(45.4642, 9.19, "Lombardy", 15, [
      ["Milan Cathedral (Duomo)", "Gothic cathedral with rooftop terraces.", "P.za del Duomo, 20122 Milano MI, Italy", 45.4641, 9.1919, ["landmark", "historic_site"]],
      ["Santa Maria delle Grazie", "UNESCO church with Leonardo's Last Supper.", "Piazza di Santa Maria delle Grazie, 20123 Milano MI, Italy", 45.466, 9.1713, ["historic_site", "museum"]],
      ["Sforza Castle", "Renaissance fortress housing major museums.", "Piazza Castello, 20121 Milano MI, Italy", 45.4705, 9.1794, ["castle", "museum"]],
      ["Galleria Vittorio Emanuele II", "Luxury shopping arcade beside the Duomo.", "P.za del Duomo, 20121 Milano MI, Italy", 45.4657, 9.1899, ["landmark", "historic_site"]],
    ]),
    naples: city(40.8518, 14.2681, "Campania", 18, [
      ["Pompeii Archaeological Park", "Buried Roman city at the foot of Vesuvius.", "Via Villa dei Misteri, 80045 Pompei NA, Italy", 40.7484, 14.4848, ["historic_site", "tourist_attraction"]],
      ["Castel dell'Ovo", "Seaside castle on the Bay of Naples.", "Via Eldorado, 80132 Napoli NA, Italy", 40.8278, 14.2471, ["castle", "landmark"]],
      ["Naples National Archaeological Museum", "Farnese collection and Pompeii frescoes.", "Piazza Museo, 80135 Napoli NA, Italy", 40.8536, 14.2506, ["museum"]],
      ["Spaccanapoli", "Straight street slicing through the historic center.", "Via Benedetto Croce, 80134 Napoli NA, Italy", 40.8496, 14.2579, ["old_town", "historic_site"]],
    ]),
    turin: city(45.0703, 7.6869, "Piedmont", 15, [
      ["Mole Antonelliana", "Landmark spire housing the National Cinema Museum.", "Via Montebello, 20, 10124 Torino TO, Italy", 45.0689, 7.6934, ["landmark", "museum"]],
      ["Royal Palace of Turin", "Savoy residence in Piazza Castello.", "Piazza Castello, 10122 Torino TO, Italy", 45.0709, 7.6866, ["castle", "historic_site"]],
      ["Egyptian Museum", "One of the world's finest collections of Egyptian antiquities.", "Via Accademia delle Scienze, 6, 10123 Torino TO, Italy", 45.0684, 7.6843, ["museum"]],
      ["Basilica of Superga", "Hilltop basilica with Alps panorama.", "Strada Basilica di Superga, 73, 10132 Torino TO, Italy", 45.0808, 7.7674, ["landmark", "viewpoint"]],
    ]),
    venice: city(45.4408, 12.3155, "Veneto", 15, [
      ["St. Mark's Basilica", "Byzantine cathedral on Piazza San Marco.", "P.za San Marco, 328, 30124 Venezia VE, Italy", 45.4345, 12.3397, ["landmark", "historic_site"]],
      ["Doge's Palace", "Gothic palace of Venetian rulers on the lagoon.", "Piazza San Marco, 1, 30124 Venezia VE, Italy", 45.4337, 12.3404, ["castle", "museum"]],
      ["Rialto Bridge", "Arched stone bridge over the Grand Canal.", "Ponte di Rialto, 30125 Venezia VE, Italy", 45.438, 12.3358, ["bridge", "landmark"]],
      ["Grand Canal", "S-shaped waterway lined with palazzi.", "Canal Grande, 30100 Venezia VE, Italy", 45.4386, 12.335, ["tourist_attraction", "historic_site"]],
    ]),
    florence: city(43.7696, 11.2558, "Tuscany", 15, [
      ["Florence Cathedral (Duomo)", "Brunelleschi's dome dominates the skyline.", "Piazza del Duomo, 50122 Firenze FI, Italy", 43.7731, 11.256, ["landmark", "historic_site"]],
      ["Uffizi Gallery", "Renaissance masterpieces by Botticelli and da Vinci.", "Piazzale degli Uffizi, 6, 50122 Firenze FI, Italy", 43.7678, 11.2553, ["museum"]],
      ["Ponte Vecchio", "Medieval bridge with jewellers over the Arno.", "Ponte Vecchio, 50125 Firenze FI, Italy", 43.7679, 11.2532, ["bridge", "landmark"]],
      ["Piazzale Michelangelo", "Hilltop square with panoramic city views.", "Piazzale Michelangelo, 50125 Firenze FI, Italy", 43.7629, 11.265, ["viewpoint", "public_square"]],
    ]),
  },
  spain: {
    madrid: city(40.4168, -3.7038, "Community of Madrid", 18, [
      ["Prado Museum", "Spain's premier art museum with Goya and Velázquez.", "C. de Ruiz de Alarcón, 23, 28014 Madrid, Spain", 40.4138, -3.6921, ["museum"]],
      ["Royal Palace of Madrid", "Europe's largest royal palace by floor area.", "C. de Bailén, s/n, 28071 Madrid, Spain", 40.418, -3.7142, ["castle", "historic_site"]],
      ["Retiro Park", "Grand park with Crystal Palace and boating lake.", "Parque del Retiro, 28009 Madrid, Spain", 40.4153, -3.6844, ["park"]],
      ["Plaza Mayor", "Habsburg-era arcaded square in the old town.", "Plaza Mayor, 28012 Madrid, Spain", 40.4155, -3.7074, ["public_square", "historic_site"]],
    ]),
    barcelona: city(41.3874, 2.1686, "Catalonia", 18, [
      ["Sagrada Família", "Gaudí's unfinished basilica and Barcelona icon.", "C/ de Mallorca, 401, 08013 Barcelona, Spain", 41.4036, 2.1744, ["landmark", "historic_site"]],
      ["Park Güell", "Gaudí's mosaic park with city panoramas.", "08024 Barcelona, Spain", 41.4145, 2.1527, ["park", "tourist_attraction"]],
      ["La Rambla", "Tree-lined pedestrian boulevard to the harbour.", "La Rambla, 08002 Barcelona, Spain", 41.3802, 2.1732, ["tourist_attraction", "public_square"]],
      ["Gothic Quarter (Barri Gòtic)", "Medieval lanes around the cathedral.", "Barri Gòtic, 08002 Barcelona, Spain", 41.3833, 2.1767, ["old_town", "historic_site"]],
    ]),
    valencia: city(39.4699, -0.3763, "Valencia", 15, [
      ["City of Arts and Sciences", "Futuristic complex by Calatrava.", "Av. del Professor López Piñero, 7, 46013 València, Spain", 39.4549, -0.3523, ["landmark", "museum"]],
      ["Valencia Cathedral", "Gothic cathedral claiming the Holy Grail.", "Plaça de l'Almoina, s/n, 46003 València, Spain", 39.4759, -0.3753, ["landmark", "historic_site"]],
      ["Central Market", "Art nouveau market hall with local produce.", "C/ de la Ciutat de Bruges, 17, 46001 València, Spain", 39.4739, -0.3782, ["historic_site", "tourist_attraction"]],
      ["Turia Gardens", "Nine-kilometre park through the former riverbed.", "Jardí del Túria, 46004 València, Spain", 39.4747, -0.3668, ["park"]],
    ]),
    seville: city(37.3891, -5.9845, "Andalusia", 15, [
      ["Seville Cathedral & Giralda", "World's largest Gothic cathedral with bell tower.", "Av. de la Constitución, s/n, 41004 Sevilla, Spain", 37.3858, -5.9931, ["landmark", "historic_site"]],
      ["Alcázar of Seville", "Moorish royal palace with lush gardens.", "Patio de Banderas, s/n, 41004 Sevilla, Spain", 37.3831, -5.9902, ["castle", "historic_site"]],
      ["Plaza de España", "Semicircular pavilion built for the 1929 Expo.", "Av. Isabel la Católica, 41004 Sevilla, Spain", 37.3772, -5.9869, ["public_square", "landmark"]],
      ["Metropol Parasol (Las Setas)", "Wooden canopy with rooftop walkway.", "Pl. de la Encarnación, s/n, 41003 Sevilla, Spain", 37.3933, -5.9917, ["landmark", "viewpoint"]],
    ]),
    malaga: city(36.7213, -4.4214, "Andalusia", 15, [
      ["Alcazaba of Málaga", "Moorish fortress overlooking the harbour.", "C/ Alcazabilla, 2, 29012 Málaga, Spain", 36.7215, -4.4164, ["castle", "historic_site"]],
      ["Picasso Museum Málaga", "Works of Pablo Picasso in a palatial setting.", "Palacio de Buenavista, C. San Agustín, 8, 29015 Málaga, Spain", 36.7217, -4.4178, ["museum"]],
      ["Málaga Cathedral", "Renaissance cathedral nicknamed La Manquita.", "C. Molina Lario, 9, 29015 Málaga, Spain", 36.7211, -4.4219, ["landmark", "historic_site"]],
      ["Gibralfaro Castle", "Hilltop castle with panoramic coastal views.", "Camino Gibralfaro, 11, 29016 Málaga, Spain", 36.7236, -4.4103, ["castle", "viewpoint"]],
    ]),
    bilbao: city(43.263, -2.935, "Basque Country", 15, [
      ["Guggenheim Museum Bilbao", "Titanium-clad museum by Frank Gehry.", "Abandoibarra Etorb., 2, 48009 Bilbao, Spain", 43.2687, -2.934, ["museum", "landmark"]],
      ["Casco Viejo", "Seven-street old town with pintxo bars.", "Casco Viejo, 48005 Bilbao, Spain", 43.2587, -2.9239, ["old_town", "historic_site"]],
      ["Bilbao Fine Arts Museum", "Basque and Spanish art collection.", "Museo Plaza, 2, 48009 Bilbao, Spain", 43.2656, -2.9381, ["museum"]],
      ["Azkuna Zentroa", "Cultural centre in a converted wine warehouse.", "Plaza Arriquibar, 4, 48010 Bilbao, Spain", 43.2596, -2.9369, ["museum", "tourist_attraction"]],
    ]),
  },
  "united-kingdom": {
    london: city(51.5074, -0.1278, "England", 20, [
      ["Tower of London", "Medieval fortress and home of the Crown Jewels.", "London EC3N 4AB, United Kingdom", 51.5081, -0.0759, ["castle", "historic_site"]],
      ["British Museum", "World cultures from Rosetta Stone to Parthenon marbles.", "Great Russell St, London WC1B 3DG, United Kingdom", 51.5194, -0.127, ["museum"]],
      ["Buckingham Palace", "Official residence of the British monarch.", "London SW1A 1AA, United Kingdom", 51.5014, -0.1419, ["landmark", "historic_site"]],
      ["Westminster Abbey", "Coronation church and royal burial site.", "20 Deans Yd, London SW1P 3PA, United Kingdom", 51.4994, -0.1273, ["landmark", "historic_site"]],
    ]),
    manchester: city(53.4808, -2.2426, "England", 15, [
      ["Manchester Town Hall", "Gothic revival civic building on Albert Square.", "Albert Square, Manchester M2 5DB, United Kingdom", 53.4794, -2.2453, ["landmark", "historic_site"]],
      ["Science and Industry Museum", "Museum of the Industrial Revolution.", "Liverpool Rd, Manchester M3 4FP, United Kingdom", 53.4774, -2.254, ["museum"]],
      ["John Rylands Library", "Neo-Gothic library resembling a cathedral.", "150 Deansgate, Manchester M3 3EH, United Kingdom", 53.4803, -2.2487, ["historic_site", "museum"]],
      ["Old Trafford", "Historic home of Manchester United Football Club.", "Sir Matt Busby Way, Old Trafford, Stretford M16 0RA, United Kingdom", 53.4631, -2.2913, ["landmark", "tourist_attraction"]],
    ]),
    edinburgh: city(55.9533, -3.1883, "Scotland", 15, [
      ["Edinburgh Castle", "Fortress on Castle Rock dominating the skyline.", "Castlehill, Edinburgh EH1 2NG, United Kingdom", 55.9486, -3.1999, ["castle", "landmark"]],
      ["Royal Mile", "Historic spine from castle to Holyrood Palace.", "Royal Mile, Edinburgh EH1 1RE, United Kingdom", 55.9502, -3.1883, ["old_town", "historic_site"]],
      ["Arthur's Seat", "Ancient volcano with panoramic city views.", "Holyrood Park, Edinburgh EH8 8AZ, United Kingdom", 55.9445, -3.1618, ["mountain", "viewpoint"]],
      ["National Museum of Scotland", "Scottish history, science, and world cultures.", "Chambers St, Edinburgh EH1 1JF, United Kingdom", 55.947, -3.1919, ["museum"]],
    ]),
    birmingham: city(52.4862, -1.8904, "England", 15, [
      ["Birmingham Museum and Art Gallery", "Pre-Raphaelite collection in the city centre.", "Chamberlain Square, Birmingham B3 3DH, United Kingdom", 52.4803, -1.9035, ["museum"]],
      ["Cadbury World", "Interactive chocolate experience in Bournville.", "69 Linden Rd, Bournville, Birmingham B30 2LU, United Kingdom", 52.4285, -1.9311, ["museum", "tourist_attraction"]],
      ["Library of Birmingham", "Landmark library with rooftop garden views.", "Centenary Square, Broad St, Birmingham B1 2ND, United Kingdom", 52.4797, -1.9086, ["landmark", "tourist_attraction"]],
      ["Bullring & St Martin's Church", "Modern shopping centre beside a historic church.", "Bullring, Birmingham B5 4BU, United Kingdom", 52.4775, -1.8936, ["landmark", "public_square"]],
    ]),
    glasgow: city(55.8642, -4.2518, "Scotland", 15, [
      ["Kelvingrove Art Gallery and Museum", "Victorian museum in a Spanish Baroque building.", "Argyle St, Glasgow G3 8AG, United Kingdom", 55.8686, -4.2906, ["museum"]],
      ["Glasgow Cathedral", "Medieval cathedral and oldest building in the city.", "Castle St, Glasgow G4 0QZ, United Kingdom", 55.8628, -4.2344, ["landmark", "historic_site"]],
      ["Riverside Museum", "Transport museum on the Clyde.", "100 Pointhouse Rd, Glasgow G3 8RS, United Kingdom", 55.8651, -4.3064, ["museum"]],
      ["George Square", "Central square with City Chambers and statues.", "George Square, Glasgow G2 1DU, United Kingdom", 55.8611, -4.2503, ["public_square", "landmark"]],
    ]),
    bristol: city(51.4545, -2.5879, "England", 15, [
      ["Clifton Suspension Bridge", "Brunel's bridge spanning the Avon Gorge.", "Bridge Rd, Leigh Woods, Bristol BS8 3PA, United Kingdom", 51.4549, -2.6279, ["bridge", "landmark"]],
      ["SS Great Britain", "Brunel's iron steamship in the historic dockyard.", "Great Western Dockyard, Gas Ferry Rd, Bristol BS1 6TY, United Kingdom", 51.449, -2.608, ["museum", "historic_site"]],
      ["Bristol Cathedral", "Gothic cathedral on College Green.", "College Green, Bristol BS1 5TJ, United Kingdom", 51.4512, -2.6006, ["landmark", "historic_site"]],
      ["Cabot Tower", "Victorian tower on Brandon Hill with city views.", "Brandon Hill, Park St, Bristol BS1 5RR, United Kingdom", 51.454, -2.6066, ["monument", "viewpoint"]],
    ]),
  },
};

import { REMAINING_ATTRACTIONS } from "./city-attractions-data-part2.mjs";
import { REMAINING_ATTRACTIONS_PART3 } from "./city-attractions-data-part3.mjs";
import { REMAINING_ATTRACTIONS_PART4 } from "./city-attractions-data-part4.mjs";
import { REMAINING_ATTRACTIONS_PART5 } from "./city-attractions-data-part5.mjs";
import { REMAINING_ATTRACTIONS_PART6 } from "./city-attractions-data-part6.mjs";

Object.assign(
  ATTRACTIONS,
  REMAINING_ATTRACTIONS,
  REMAINING_ATTRACTIONS_PART3,
  REMAINING_ATTRACTIONS_PART4,
  REMAINING_ATTRACTIONS_PART5,
  REMAINING_ATTRACTIONS_PART6
);

// Parse roomData cities
const roomDataPath = join(__dirname, "../lib/roomData.ts");
const roomDataSrc = readFileSync(roomDataPath, "utf8");

/** @type {Record<string, { slug: string; name: string }[]>} */
const citiesByCountry = {};

const citiesBlockMatch = roomDataSrc.match(/export const citiesByCountry[\s\S]*?=\s*\{([\s\S]*?)\n\};/);
if (!citiesBlockMatch) {
  throw new Error("Could not parse citiesByCountry from roomData.ts");
}

const countryBlockRegex = /(?:"([\w-]+)"|(\w[\w-]*)):\s*\[([\s\S]*?)\],?/g;
let match;
while ((match = countryBlockRegex.exec(citiesBlockMatch[1])) !== null) {
  const countrySlug = match[1] ?? match[2];
  const citiesBlock = match[3];
  const cityRegex = /\{\s*slug:\s*"([^"]+)",\s*name:\s*"([^"]+)"\s*\}/g;
  const cities = [];
  let cityMatch;
  while ((cityMatch = cityRegex.exec(citiesBlock)) !== null) {
    cities.push({ slug: cityMatch[1], name: cityMatch[2] });
  }
  citiesByCountry[countrySlug] = cities;
}

const countrySlugs = Object.keys(citiesByCountry);
const output = {};

let cityCount = 0;
let placeCount = 0;
const missing = [];

for (const countrySlug of countrySlugs) {
  output[countrySlug] = {};
  for (const { slug: citySlug } of citiesByCountry[countrySlug]) {
    const data = ATTRACTIONS[countrySlug]?.[citySlug];
    if (!data) {
      missing.push(`${countrySlug}/${citySlug}`);
      continue;
    }
    if (data.places.length !== 4) {
      throw new Error(`${countrySlug}/${citySlug}: expected 4 places, got ${data.places.length}`);
    }
    output[countrySlug][citySlug] = data;
    cityCount += 1;
    placeCount += 4;
  }
}

if (missing.length > 0) {
  console.error("Missing attractions data for:", missing.join(", "));
  process.exit(1);
}

const outPath = join(__dirname, "city-attractions-data.json");
writeFileSync(outPath, JSON.stringify(output, null, 2) + "\n");

console.log(`Countries: ${countrySlugs.length}`);
console.log(`Cities: ${cityCount}`);
console.log(`Places: ${placeCount}`);
console.log(`Written to ${outPath}`);
