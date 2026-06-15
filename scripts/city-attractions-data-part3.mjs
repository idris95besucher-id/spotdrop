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

export const REMAINING_ATTRACTIONS_PART3 = {
  greece: {
    athens: city(37.9838, 23.7275, "Attica", 18, [
      ["Acropolis of Athens", "Ancient citadel with the Parthenon.", "Athens 105 58, Greece", 37.9715, 23.7267, ["historic_site", "landmark"]],
      ["Acropolis Museum", "Modern museum at the foot of the Acropolis.", "Dionysiou Areopagitou 15, Athina 117 42, Greece", 37.9685, 23.7284, ["museum"]],
      ["Ancient Agora of Athens", "Ruins of the classical marketplace.", "Adrianou 24, Athina 105 55, Greece", 37.975, 23.7225, ["historic_site", "tourist_attraction"]],
      ["Temple of Olympian Zeus", "Colossal ruined temple of Zeus.", "Athens 105 57, Greece", 37.9693, 23.7331, ["historic_site", "monument"]],
    ]),
    thessaloniki: city(40.6401, 22.9444, "Central Macedonia", 12, [
      ["White Tower of Thessaloniki", "Ottoman tower and city symbol on the waterfront.", "Nikis Ave., 546 21 Thessaloniki, Greece", 40.6264, 22.9484, ["landmark", "monument"]],
      ["Rotunda of Galerius", "Roman rotunda turned church and mosque.", "Pl. Agiou Georgiou, 546 35 Thessaloniki, Greece", 40.6328, 22.9531, ["historic_site", "landmark"]],
      ["Aristotelous Square", "Grand waterfront square.", "Aristotelous Square, 546 24 Thessaloniki, Greece", 40.6328, 22.9408, ["public_square", "landmark"]],
      ["Archaeological Museum of Thessaloniki", "Macedonian antiquities collection.", "Manoli Andronikou 6, 546 21 Thessaloniki, Greece", 40.625, 22.9539, ["museum"]],
    ]),
    patras: city(38.2466, 21.7346, "Western Greece", 12, [
      ["Patras Castle", "Venetian fortress above the city.", "Patras 262 25, Greece", 38.2444, 21.7344, ["castle", "viewpoint"]],
      ["St. Andrew's Church", "Largest church in Greece and pilgrimage site.", "Agiou Andreou 220, Patras 262 23, Greece", 38.2433, 21.7267, ["landmark", "historic_site"]],
      ["Roman Odeon of Patras", "Restored ancient theatre.", "Germanou 32, Patras 262 25, Greece", 38.2447, 21.7333, ["historic_site", "tourist_attraction"]],
      ["Rio-Antirrio Bridge", "World's longest multi-span cable-stayed bridge.", "Rio 265 04, Greece", 38.3214, 21.7744, ["bridge", "landmark"]],
    ]),
    heraklion: city(35.3387, 25.1442, "Crete", 20, [
      ["Knossos Palace", "Minoan palace ruins outside Heraklion.", "Knossos 714 09, Greece", 35.2981, 25.1631, ["historic_site", "tourist_attraction"]],
      ["Heraklion Archaeological Museum", "World's finest Minoan art collection.", "Xanthoudidou 2, Iraklio 712 02, Greece", 35.3392, 25.1372, ["museum"]],
      ["Koules Fortress", "Venetian sea fortress in the harbour.", "Koules, Iraklio 712 02, Greece", 35.3444, 25.1369, ["castle", "historic_site"]],
      ["Morosini Fountain", "Venetian lion fountain on Lions Square.", "Pl. Eleftherias, Iraklio 712 02, Greece", 35.3392, 25.1331, ["monument", "public_square"]],
    ]),
    larissa: city(39.639, 22.4191, "Thessaly", 12, [
      ["Ancient Theatre of Larissa", "Hellenistic-Roman theatre in the centre.", "Larissa 412 22, Greece", 39.639, 22.4191, ["historic_site", "tourist_attraction"]],
      ["Alcazar Park", "Ottoman-era park along the Pinios.", "Larissa 412 22, Greece", 39.6367, 22.4156, ["park"]],
      ["Diachronic Museum of Larissa", "Regional archaeology museum.", "Mezourlo, Larissa 411 10, Greece", 39.6289, 22.4289, ["museum"]],
      ["Bezesteni Market", "Ottoman covered market.", "Larissa 412 22, Greece", 39.6394, 22.4183, ["historic_site", "tourist_attraction"]],
    ]),
  },
  portugal: {
    lisbon: city(38.7223, -9.1393, "Lisbon", 15, [
      ["Belém Tower", "Manueline fortress on the Tagus.", "Av. Brasília, 1400-038 Lisboa, Portugal", 38.6916, -9.216, ["castle", "landmark"]],
      ["Jerónimos Monastery", "UNESCO monastery where Vasco da Gama is buried.", "Praça do Império, 1400-206 Lisboa, Portugal", 38.6979, -9.2067, ["historic_site", "landmark"]],
      ["São Jorge Castle", "Moorish castle overlooking Alfama.", "R. de Santa Cruz do Castelo, 1100-129 Lisboa, Portugal", 38.7139, -9.1334, ["castle", "viewpoint"]],
      ["Alfama District", "Oldest quarter with fado and narrow lanes.", "Alfama, 1100 Lisboa, Portugal", 38.7128, -9.1306, ["old_town", "historic_site"]],
    ]),
    porto: city(41.1579, -8.6291, "Porto", 12, [
      ["Ribeira District", "UNESCO riverside quarter on the Douro.", "Ribeira, 4050-510 Porto, Portugal", 41.1406, -8.6111, ["old_town", "historic_site"]],
      ["Livraria Lello", "Neo-Gothic bookshop said to inspire Harry Potter.", "R. das Carmelitas 144, 4050-161 Porto, Portugal", 41.1469, -8.6147, ["historic_site", "landmark"]],
      ["Clérigos Tower", "Baroque bell tower with city panorama.", "R. de São Filipe de Nery, 4050-546 Porto, Portugal", 41.1458, -8.6142, ["landmark", "viewpoint"]],
      ["Porto Cathedral", "Romanesque fortress-cathedral.", "Terreiro da Sé, 4050-573 Porto, Portugal", 41.1428, -8.6111, ["landmark", "historic_site"]],
    ]),
    faro: city(37.0194, -7.9322, "Algarve", 20, [
      ["Faro Old Town", "Walled centre with cobbled streets.", "Largo da Sé, 8000-167 Faro, Portugal", 37.0139, -7.9356, ["old_town", "historic_site"]],
      ["Faro Cathedral", "Gothic cathedral on Largo da Sé.", "Largo da Sé, 8000-167 Faro, Portugal", 37.0136, -7.9353, ["landmark", "historic_site"]],
      ["Ria Formosa Natural Park", "Lagoon archipelago with birdlife and beaches.", "Ria Formosa, 8000 Faro, Portugal", 37.01, -7.85, ["park", "tourist_attraction"]],
      ["Capela dos Ossos", "Bone chapel in Igreja do Carmo.", "Largo do Carmo, 8000-150 Faro, Portugal", 37.0167, -7.9333, ["historic_site", "monument"]],
    ]),
    braga: city(41.5454, -8.4265, "Braga", 12, [
      ["Bom Jesus do Monte", "Baroque stairway sanctuary above Braga.", "Estrada do Bom Jesus, 4715-056 Tenões, Portugal", 41.5547, -8.3772, ["landmark", "viewpoint"]],
      ["Braga Cathedral", "Oldest cathedral in Portugal.", "R. Dom Paio Mendes, 4700-424 Braga, Portugal", 41.5494, -8.4267, ["landmark", "historic_site"]],
      ["Sameiro Sanctuary", "Marian shrine with panoramic views.", "Monte do Sameiro, 4715-616 Braga, Portugal", 41.5622, -8.3689, ["landmark", "viewpoint"]],
      ["Garden of Santa Barbara", "Renaissance garden by the Archbishop's Palace.", "Largo de Santa Bárbara, 4700-309 Braga, Portugal", 41.5511, -8.4256, ["park", "historic_site"]],
    ]),
    coimbra: city(40.2033, -8.4103, "Coimbra", 12, [
      ["University of Coimbra", "UNESCO hilltop university with Joanina Library.", "Pátio das Escolas, 3004-531 Coimbra, Portugal", 40.2075, -8.4264, ["historic_site", "landmark"]],
      ["Coimbra Cathedral", "Romanesque cathedral.", "Largo da Sé Velha, 3000-383 Coimbra, Portugal", 40.2083, -8.4267, ["landmark", "historic_site"]],
      ["Monastery of Santa Clara-a-Velha", "Gothic ruins by the Mondego.", "R. das Parreiras, 3040-266 Coimbra, Portugal", 40.1989, -8.4367, ["historic_site", "monument"]],
      ["Portugal dos Pequenitos", "Miniature park of Portuguese architecture.", "R. Rossio de Santa Clara, 3040-256 Coimbra, Portugal", 40.2033, -8.4333, ["park", "tourist_attraction"]],
    ]),
  },
  ireland: {
    dublin: city(53.3498, -6.2603, "Leinster", 15, [
      ["Trinity College & Book of Kells", "Ireland's oldest university and illuminated manuscript.", "College Green, Dublin 2, Ireland", 53.3438, -6.2546, ["historic_site", "museum"]],
      ["Guinness Storehouse", "Interactive brewery experience with rooftop views.", "St James's Gate, Dublin 8, Ireland", 53.3419, -6.2869, ["museum", "viewpoint"]],
      ["Dublin Castle", "Historic castle at the heart of the city.", "Dame St, Dublin 2, Ireland", 53.3429, -6.2674, ["castle", "historic_site"]],
      ["St. Patrick's Cathedral", "Ireland's largest cathedral.", "St Patrick's Close, Dublin 8, Ireland", 53.3394, -6.2714, ["landmark", "historic_site"]],
    ]),
    cork: city(51.8985, -8.4756, "Munster", 12, [
      ["English Market", "Victorian covered food market.", "Princes St, Centre, Cork, Ireland", 51.8981, -8.4747, ["historic_site", "tourist_attraction"]],
      ["St. Fin Barre's Cathedral", "Gothic Revival cathedral.", "Bishop St, The Lough, Cork, Ireland", 51.8944, -8.4794, ["landmark", "historic_site"]],
      ["Blarney Castle", "Medieval castle with the famous Blarney Stone.", "Blarney, Co. Cork, Ireland", 51.9289, -8.5708, ["castle", "tourist_attraction"]],
      ["Cork City Gaol", "Victorian prison turned heritage museum.", "Convent Ave, Sunday's Well, Cork, Ireland", 51.9033, -8.5206, ["museum", "historic_site"]],
    ]),
    galway: city(53.2707, -9.0568, "Connacht", 15, [
      ["Eyre Square", "Central square and gathering place.", "Eyre Square, Galway, Ireland", 53.2741, -9.049, ["public_square", "landmark"]],
      ["Galway Cathedral", "Modern stone cathedral on the river.", "University Rd, Galway, Ireland", 53.2778, -9.0567, ["landmark", "historic_site"]],
      ["Spanish Arch", "Medieval arch remnant of city walls.", "Spanish Parade, Galway, Ireland", 53.2697, -9.0556, ["historic_site", "landmark"]],
      ["Salthill Promenade", "Seaside walk with views of Galway Bay.", "Salthill, Galway, Ireland", 53.2583, -9.0833, ["tourist_attraction", "viewpoint"]],
    ]),
    limerick: city(52.6638, -8.6267, "Munster", 12, [
      ["King John's Castle", "Norman castle on the Shannon.", "Nicholas St, Limerick, Ireland", 52.6697, -8.6231, ["castle", "museum"]],
      ["St. Mary's Cathedral", "Medieval cathedral on King's Island.", "Bridge St, Limerick, Ireland", 52.6689, -8.6236, ["landmark", "historic_site"]],
      ["Hunt Museum", "Art and antiquities in the Custom House.", "Rutland St, Limerick, Ireland", 52.6644, -8.6261, ["museum"]],
      ["People's Park", "Victorian park in the city centre.", "Pery Square, Limerick, Ireland", 52.6589, -8.6289, ["park"]],
    ]),
    waterford: city(52.2593, -7.1101, "Munster", 12, [
      ["Waterford Crystal Visitor Centre", "Crystal-making heritage experience.", "The Mall, Waterford, Ireland", 52.2593, -7.1101, ["museum", "tourist_attraction"]],
      ["Reginald's Tower", "Viking-era tower on the quay.", "The Quay, Waterford, Ireland", 52.2594, -7.1069, ["historic_site", "landmark"]],
      ["Christ Church Cathedral", "Georgian cathedral in the Viking Triangle.", "Cathedral Square, Waterford, Ireland", 52.2597, -7.1089, ["landmark", "historic_site"]],
      ["Medieval Museum", "Treasures of the Viking Triangle.", "Cathedral Square, Waterford, Ireland", 52.2597, -7.1089, ["museum", "historic_site"]],
    ]),
  },
  russia: {
    "chechen-republic": city(43.3178, 45.6986, "Chechen Republic", 25, [
      ["Heart of Chechnya Mosque", "Grand mosque and symbol of modern Grozny.", "Prospekt Putina, Grozny, Russia", 43.3172, 45.6942, ["landmark", "historic_site"]],
      ["Grozny City Towers", "Skyscraper complex overlooking the city.", "Prospekt Putina, Grozny, Russia", 43.3156, 45.6931, ["landmark", "viewpoint"]],
      ["National Museum of Chechnya", "Regional history and culture museum.", "Prospekt Putina, 17, Grozny, Russia", 43.3189, 45.6978, ["museum"]],
      ["Argun Gorge", "Dramatic mountain gorge east of Grozny.", "Argun Gorge, Chechnya, Russia", 43.2833, 46.0833, ["viewpoint", "natural_feature"]],
    ]),
    dagestan: city(42.9849, 47.5047, "Dagestan", 30, [
      ["Juma Mosque of Derbent", "Ancient Friday mosque within the UNESCO citadel.", "7, Magalimov St, Derbent, Russia", 42.0569, 48.2906, ["landmark", "historic_site"]],
      ["Sulak Canyon", "One of the deepest canyons in Europe.", "Sulak Canyon, Dagestan, Russia", 43.0167, 47.4167, ["viewpoint", "natural_feature"]],
      ["Grand Mosque of Makhachkala", "Central mosque of the Dagestani capital.", "Makhachkala, Dagestan, Russia", 42.9849, 47.5047, ["landmark", "historic_site"]],
      ["Dagestan Museum of Fine Arts", "Regional art and cultural heritage.", "Yaragskogo St, 66, Makhachkala, Russia", 42.9822, 47.5028, ["museum"]],
    ]),
    ingushetia: city(43.1689, 44.8139, "Ingushetia", 22, [
      ["Djairakh-Assa Reserve", "Ancient Ingush stone towers and mountain villages.", "Djairakh, Ingushetia, Russia", 42.8167, 44.6667, ["historic_site", "viewpoint"]],
      ["Memorial of Memory and Glory", "Memorial complex in Nazran.", "Nazran, Ingushetia, Russia", 43.2167, 44.7667, ["monument", "historic_site"]],
      ["Tower of Concord", "Modern symbol of Ingush unity in Magas.", "Magas, Ingushetia, Russia", 43.1689, 44.8139, ["landmark", "monument"]],
      ["Sunni Mosque of Magas", "Central mosque of the Ingush capital.", "Magas, Ingushetia, Russia", 43.17, 44.815, ["landmark", "historic_site"]],
    ]),
    krasnodar: city(45.0355, 38.9753, "Krasnodar", 18, [
      ["Krasny Park", "Central city park with fountains and gardens.", "Krasnaya St, Krasnodar, Russia", 45.0355, 38.9753, ["park", "tourist_attraction"]],
      ["Catherine's Square", "Historic square with a triumphal arch.", "Ulitsa Krasnaya, Krasnodar, Russia", 45.0347, 38.9717, ["public_square", "historic_site"]],
      ["Krasnodar Regional Art Museum", "Fine art collection in a historic building.", "Ulitsa Krasnaya, 13, Krasnodar, Russia", 45.0333, 38.97, ["museum"]],
      ["Suspension Bridge over the Kuban", "Pedestrian bridge with river views.", "Kuban River, Krasnodar, Russia", 45.0283, 38.9683, ["bridge", "viewpoint"]],
    ]),
    moscow: city(55.7558, 37.6173, "Moscow", 20, [
      ["Red Square", "Historic square with Kremlin and St. Basil's.", "Red Square, Moscow, Russia", 55.7539, 37.6208, ["public_square", "landmark"]],
      ["Kremlin", "Fortified complex of cathedrals and palaces.", "Moscow Kremlin, Moscow, Russia", 55.752, 37.6175, ["castle", "historic_site"]],
      ["St. Basil's Cathedral", "Colourful onion-domed cathedral.", "Red Square, Moscow, Russia", 55.7525, 37.6231, ["landmark", "historic_site"]],
      ["Tretyakov Gallery", "Premier collection of Russian fine art.", "Lavrushinsky Ln, 10, Moscow, Russia", 55.7414, 37.6208, ["museum"]],
    ]),
    "saint-petersburg": city(59.9311, 30.3609, "Saint Petersburg", 18, [
      ["Hermitage Museum", "World-class art in the Winter Palace.", "Palace Square, 2, St Petersburg, Russia", 59.9398, 30.3146, ["museum", "castle"]],
      ["Church of the Savior on Spilled Blood", "Mosaic-covered church on the canal.", "Griboyedov Canal Embankment, 2Б, St Petersburg, Russia", 59.9401, 30.3288, ["landmark", "historic_site"]],
      ["Peter and Paul Fortress", "Birthplace of St. Petersburg on Hare Island.", "Zayachy Island, St Petersburg, Russia", 59.95, 30.3167, ["castle", "historic_site"]],
      ["Nevsky Prospect", "Grand boulevard through the historic centre.", "Nevsky Prospect, St Petersburg, Russia", 59.9343, 30.3351, ["old_town", "tourist_attraction"]],
    ]),
    tatarstan: city(55.7961, 49.1064, "Tatarstan", 25, [
      ["Kazan Kremlin", "UNESCO fortress with Qol Sharif Mosque.", "Kremlin St, 1, Kazan, Russia", 55.7983, 49.1053, ["castle", "historic_site"]],
      ["Qol Sharif Mosque", "Grand mosque within the Kazan Kremlin.", "Kremlin St, Kazan, Russia", 55.7986, 49.105, ["landmark", "historic_site"]],
      ["Temple of All Religions", "Eclectic multi-faith architectural complex.", "Starokrepostnaya St, Kazan, Russia", 55.7667, 49.1833, ["landmark", "tourist_attraction"]],
      ["Bauman Street", "Pedestrian historic street in the centre.", "Bauman St, Kazan, Russia", 55.7889, 49.1167, ["old_town", "tourist_attraction"]],
    ]),
  },
  ukraine: {
    kyiv: city(50.4501, 30.5234, "Kyiv", 18, [
      ["Kyiv Pechersk Lavra", "UNESCO cave monastery complex.", "Lavrska St, 15, Kyiv, Ukraine", 50.4342, 30.5572, ["historic_site", "landmark"]],
      ["Saint Sophia Cathedral", "UNESCO Byzantine cathedral with golden domes.", "Volodymyrska St, 24, Kyiv, Ukraine", 50.4528, 30.5144, ["landmark", "historic_site"]],
      ["Independence Square (Maidan)", "Central square and symbol of Ukrainian independence.", "Maidan Nezalezhnosti, Kyiv, Ukraine", 50.4501, 30.5234, ["public_square", "landmark"]],
      ["Golden Gate", "Reconstructed medieval city gate.", "Volodymyrska St, 40А, Kyiv, Ukraine", 50.4489, 30.5133, ["historic_site", "monument"]],
    ]),
    lviv: city(49.8397, 24.0297, "Lviv Oblast", 12, [
      ["Lviv Old Town", "UNESCO ensemble of Renaissance and Baroque buildings.", "Rynok Square, Lviv, Ukraine", 49.8419, 24.0315, ["old_town", "historic_site"]],
      ["Lviv Opera House", "Neo-Renaissance opera on Svobody Avenue.", "Svobody Ave, 28, Lviv, Ukraine", 49.8442, 24.0261, ["landmark", "tourist_attraction"]],
      ["High Castle Park", "Hilltop park with panoramic city views.", "High Castle, Lviv, Ukraine", 49.8483, 24.0392, ["park", "viewpoint"]],
      ["Lychakiv Cemetery", "Historic necropolis with ornate tombs.", "Mechnykova St, 33, Lviv, Ukraine", 49.8333, 24.0567, ["historic_site", "monument"]],
    ]),
    odesa: city(46.4825, 30.7233, "Odesa Oblast", 12, [
      ["Potemkin Stairs", "Giant staircase immortalised in cinema.", "Primorsky Blvd, Odesa, Ukraine", 46.4889, 30.7417, ["monument", "landmark"]],
      ["Odesa Opera and Ballet Theatre", "Neo-Baroque opera house.", "Chaikovs'koho Ln, 1, Odesa, Ukraine", 46.4847, 30.7411, ["landmark", "tourist_attraction"]],
      ["Deribasivska Street", "Pedestrian heart of the historic centre.", "Derybasivska St, Odesa, Ukraine", 46.4842, 30.7328, ["old_town", "tourist_attraction"]],
      ["Odesa Catacombs", "Labyrinth of tunnels beneath the city.", "Nerubayske, Odesa Oblast, Ukraine", 46.4833, 30.6333, ["historic_site", "tourist_attraction"]],
    ]),
    kharkiv: city(49.9935, 36.2304, "Kharkiv Oblast", 12, [
      ["Freedom Square", "One of Europe's largest city squares.", "Svobody Square, Kharkiv, Ukraine", 49.9935, 36.2304, ["public_square", "landmark"]],
      ["Kharkiv Cathedral", "Neo-Byzantine cathedral with bell tower.", "Universytetska St, 11, Kharkiv, Ukraine", 49.9933, 36.2317, ["landmark", "historic_site"]],
      ["Gorky Park", "Large central park with attractions.", "Sumska St, 81, Kharkiv, Ukraine", 49.9933, 36.24, ["park"]],
      ["Mirror Stream Fountain", "Art deco fountain and city symbol.", "Sumska St, Kharkiv, Ukraine", 49.9933, 36.235, ["monument", "landmark"]],
    ]),
    dnipro: city(48.4647, 35.0462, "Dnipropetrovsk Oblast", 12, [
      ["Monastyrsky Island", "Island park in the Dnieper with cable car.", "Monastyrsky Island, Dnipro, Ukraine", 48.4647, 35.0462, ["park", "viewpoint"]],
      ["Dnipro History Museum", "Regional history museum.", "Karla Marksa Ave, 16, Dnipro, Ukraine", 48.4647, 35.0462, ["museum"]],
      ["Preobrazhensky Cathedral", "Baroque cathedral on Cathedral Square.", "Cathedral Square, Dnipro, Ukraine", 48.4647, 35.0462, ["landmark", "historic_site"]],
      ["Rocket Park", "Open-air display of Soviet space rockets.", "Vulytsya Sicheslavska Nezalezhnosti, Dnipro, Ukraine", 48.45, 35.05, ["museum", "monument"]],
    ]),
    zaporizhzhia: city(47.8388, 35.1396, "Zaporizhzhia Oblast", 12, [
      ["Khortytsia Island", "Historic island on the Dnieper with Cossack heritage.", "Khortytsia Island, Zaporizhzhia, Ukraine", 47.85, 35.1167, ["historic_site", "park"]],
      ["Dnieper Hydroelectric Station", "Landmark dam and Soviet engineering monument.", "Dnieper Dam, Zaporizhzhia, Ukraine", 47.8667, 35.1, ["landmark", "monument"]],
      ["Zaporizhzhia Oak", "Legendary thousand-year-old oak tree.", "Zaporizhzhia Oak, Zaporizhzhia, Ukraine", 47.8388, 35.1396, ["monument", "historic_site"]],
      ["Motor Sich Aviation Museum", "Aircraft museum of the engine manufacturer.", "Aviation Museum, Zaporizhzhia, Ukraine", 47.85, 35.15, ["museum"]],
    ]),
  },
  belarus: {
    minsk: city(53.9045, 27.5615, "Minsk", 15, [
      ["Independence Square", "Vast Soviet-era square with government buildings.", "Nezavisimosti Square, Minsk, Belarus", 53.8936, 27.5478, ["public_square", "landmark"]],
      ["National Library of Belarus", "Rhombicuboctahedron-shaped landmark.", "Praspiekt Niezaležnasci 116, Minsk, Belarus", 53.9314, 27.6458, ["landmark", "viewpoint"]],
      ["Island of Tears", "Memorial to Belarusian soldiers.", "Island of Tears, Minsk, Belarus", 53.9045, 27.5615, ["monument", "park"]],
      ["Minsk Victory Square", "War memorial with eternal flame.", "Victory Square, Minsk, Belarus", 53.9094, 27.5764, ["monument", "public_square"]],
    ]),
    brest: city(52.0976, 23.7341, "Brest", 12, [
      ["Brest Fortress", "Hero fortress memorial of WWII.", "Brest Fortress, Brest, Belarus", 52.0783, 23.6542, ["historic_site", "monument"]],
      ["Brest Railway Museum", "Open-air collection of locomotives.", "Masherava Ave, Brest, Belarus", 52.0976, 23.7341, ["museum"]],
      ["Sovetskaya Street", "Pedestrian street with lantern lamplighters.", "Sovetskaya St, Brest, Belarus", 52.0976, 23.7341, ["old_town", "tourist_attraction"]],
      ["Brest Millennium Monument", "Monument marking 1000 years of Brest.", "Brest, Belarus", 52.0976, 23.7341, ["monument", "landmark"]],
    ]),
    grodno: city(53.6694, 23.8131, "Grodno", 12, [
      ["Grodno Old Castle", "Renaissance royal castle on the Neman.", "Zamkova St, 22, Grodno, Belarus", 53.6767, 23.8267, ["castle", "museum"]],
      ["Grodno New Castle", "Baroque palace opposite the old castle.", "Zamkova St, Grodno, Belarus", 53.6761, 23.8256, ["castle", "historic_site"]],
      ["Farny Church", "Baroque Jesuit church.", "Sovetskaya St, Grodno, Belarus", 53.6778, 23.8289, ["landmark", "historic_site"]],
      ["Kolozha Church", "12th-century stone church on the riverbank.", "Kolozha St, Grodno, Belarus", 53.6733, 23.8367, ["historic_site", "landmark"]],
    ]),
    gomel: city(52.4412, 30.9878, "Gomel", 12, [
      ["Gomel Palace & Park", "Rumyantsev-Paskevich palace ensemble.", "Lenin Ave, 4, Gomel, Belarus", 52.4412, 30.9878, ["castle", "park"]],
      ["Gomel Cathedral of Sts. Peter and Paul", "Neoclassical cathedral in the palace park.", "Lenin Ave, Gomel, Belarus", 52.4412, 30.9878, ["landmark", "historic_site"]],
      ["Gomel Regional Museum", "Regional history and culture museum.", "Lenin Ave, Gomel, Belarus", 52.4412, 30.9878, ["museum"]],
      ["Hunting Lodge", "Wooden lodge in the palace park.", "Palace Park, Gomel, Belarus", 52.4412, 30.9878, ["historic_site", "park"]],
    ]),
    mogilev: city(53.8945, 30.3307, "Mogilev", 12, [
      ["St. Nicholas Monastery", "Baroque monastery complex.", "St. Nicholas Monastery, Mogilev, Belarus", 53.8945, 30.3307, ["historic_site", "landmark"]],
      ["Mogilev Town Hall", "Reconstructed town hall on the square.", "Leninskaya St, Mogilev, Belarus", 53.8945, 30.3307, ["landmark", "historic_site"]],
      ["Buynichi Field Memorial", "WWII memorial on the battlefield.", "Buynichi Field, Mogilev, Belarus", 53.85, 30.25, ["monument", "historic_site"]],
      ["Mogilev Regional Museum", "Local history museum.", "Mogilev, Belarus", 53.8945, 30.3307, ["museum"]],
    ]),
  },
  kazakhstan: {
    almaty: city(43.222, 76.8512, "Almaty", 20, [
      ["Kok-Tobe Hill", "Hilltop park with city panorama and TV tower.", "Kok-Tobe, Almaty, Kazakhstan", 43.2333, 76.9833, ["viewpoint", "park"]],
      ["Zenkov Cathedral", "Wooden cathedral in Panfilov Park.", "Panfilov Park, Almaty, Kazakhstan", 43.2583, 76.9458, ["landmark", "historic_site"]],
      ["Medeu Skating Rink", "High-altitude outdoor speed skating rink.", "Medeu, Almaty, Kazakhstan", 43.1583, 77.0583, ["tourist_attraction", "historic_site"]],
      ["Big Almaty Lake", "Turquoise alpine lake in the mountains.", "Big Almaty Lake, Almaty, Kazakhstan", 43.05, 76.9833, ["lake", "viewpoint"]],
    ]),
    "nur-sultan": city(51.1694, 71.4491, "Astana", 15, [
      ["Bayterek Tower", "Observation tower and symbol of the capital.", "Bayterek Ave, Nur-Sultan, Kazakhstan", 51.1283, 71.4306, ["landmark", "viewpoint"]],
      ["Khan Shatyr", "Giant tent-shaped shopping and entertainment centre.", "Turkistan St, Nur-Sultan, Kazakhstan", 51.1322, 71.4078, ["landmark", "tourist_attraction"]],
      ["Astana Opera", "Modern opera house on the right bank.", "Kunayev St, Nur-Sultan, Kazakhstan", 51.1333, 71.4167, ["landmark", "tourist_attraction"]],
      ["Palace of Peace and Reconciliation", "Pyramid-shaped congress centre.", "Tauelsizdik Ave, Nur-Sultan, Kazakhstan", 51.1333, 71.4667, ["landmark", "tourist_attraction"]],
    ]),
    shymkent: city(42.3417, 69.5901, "Turkistan", 12, [
      ["Shymkent Old Town", "Historic quarter with traditional architecture.", "Old Town, Shymkent, Kazakhstan", 42.3417, 69.5901, ["old_town", "historic_site"]],
      ["Independence Park", "Central park with monuments.", "Independence Park, Shymkent, Kazakhstan", 42.3417, 69.5901, ["park", "monument"]],
      ["Regional Museum of Local Lore", "History and ethnography museum.", "Shymkent, Kazakhstan", 42.3417, 69.5901, ["museum"]],
      ["Ordabasy Square", "Central square of the city.", "Ordabasy Square, Shymkent, Kazakhstan", 42.3417, 69.5901, ["public_square", "landmark"]],
    ]),
    karaganda: city(49.8047, 73.1094, "Karaganda", 12, [
      ["Karaganda Regional Museum", "Mining and regional history museum.", "Karaganda, Kazakhstan", 49.8047, 73.1094, ["museum"]],
      ["Nurken Abdirov Park", "Central park with war memorial.", "Nurken Abdirov Park, Karaganda, Kazakhstan", 49.8047, 73.1094, ["park", "monument"]],
      ["Transfiguration Cathedral", "Main Orthodox cathedral.", "Karaganda, Kazakhstan", 49.8047, 73.1094, ["landmark", "historic_site"]],
      ["Miners' Palace of Culture", "Soviet-era cultural landmark.", "Karaganda, Kazakhstan", 49.8047, 73.1094, ["landmark", "historic_site"]],
    ]),
    aktobe: city(50.2839, 57.167, "Aktobe", 12, [
      ["Aktobe Regional Museum", "Local history and ethnography.", "Aktobe, Kazakhstan", 50.2839, 57.167, ["museum"]],
      ["Nur Otan Park", "Central city park.", "Nur Otan Park, Aktobe, Kazakhstan", 50.2839, 57.167, ["park"]],
      ["Aktobe Mosque", "Grand central mosque.", "Aktobe, Kazakhstan", 50.2839, 57.167, ["landmark", "historic_site"]],
      ["Aliya Moldagulova Monument", "War hero monument and square.", "Aktobe, Kazakhstan", 50.2839, 57.167, ["monument", "public_square"]],
    ]),
  },
  azerbaijan: {
    baku: city(40.4093, 49.8671, "Baku", 15, [
      ["Old City (Icherisheher)", "UNESCO walled city with Maiden Tower.", "Icherisheher, Baku, Azerbaijan", 40.3661, 49.8353, ["old_town", "historic_site"]],
      ["Flame Towers", "Three flame-shaped skyscrapers on the hill.", "Flame Towers, Baku, Azerbaijan", 40.3597, 49.8267, ["landmark"]],
      ["Heydar Aliyev Center", "Zaha Hadid-designed cultural centre.", "1 Heydar Aliyev Ave, Baku, Azerbaijan", 40.3953, 49.8672, ["landmark", "museum"]],
      ["Baku Boulevard", "Seaside promenade along the Caspian.", "Baku Boulevard, Baku, Azerbaijan", 40.3667, 49.8333, ["park", "tourist_attraction"]],
    ]),
    ganja: city(40.6828, 46.3606, "Ganja", 12, [
      ["Nizami Mausoleum", "Tomb of the great Persian poet Nizami.", "Ganja, Azerbaijan", 40.6828, 46.3606, ["monument", "historic_site"]],
      ["Bottle House", "House decorated with thousands of glass bottles.", "Ganja, Azerbaijan", 40.6828, 46.3606, ["landmark", "tourist_attraction"]],
      ["Ganja State History Museum", "Regional history museum.", "Ganja, Azerbaijan", 40.6828, 46.3606, ["museum"]],
      ["Shah Abbas Mosque", "Historic mosque in the old city.", "Ganja, Azerbaijan", 40.6828, 46.3606, ["landmark", "historic_site"]],
    ]),
    sumqayit: city(40.5897, 49.6686, "Sumqayit", 12, [
      ["Sumgayit City Park", "Central park along the Caspian.", "Sumqayit, Azerbaijan", 40.5897, 49.6686, ["park"]],
      ["Sumgayit Regional History Museum", "Local history museum.", "Sumqayit, Azerbaijan", 40.5897, 49.6686, ["museum"]],
      ["Caspian Sea Promenade", "Seaside walkway and beach.", "Sumqayit, Azerbaijan", 40.5897, 49.6686, ["tourist_attraction", "viewpoint"]],
      ["Jafar Jabbarli Drama Theatre", "Cultural landmark of the city.", "Sumqayit, Azerbaijan", 40.5897, 49.6686, ["landmark", "tourist_attraction"]],
    ]),
    mingachevir: city(40.7703, 47.0489, "Mingachevir", 12, [
      ["Mingachevir Reservoir", "Largest reservoir in the Caucasus.", "Mingachevir, Azerbaijan", 40.7703, 47.0489, ["lake", "tourist_attraction"]],
      ["Mingachevir History Museum", "Regional archaeology and history.", "Mingachevir, Azerbaijan", 40.7703, 47.0489, ["museum"]],
      ["Kura River Park", "Riverside park in the city.", "Mingachevir, Azerbaijan", 40.7703, 47.0489, ["park"]],
      ["Mingachevir Dam", "Major hydroelectric dam landmark.", "Mingachevir, Azerbaijan", 40.7703, 47.0489, ["landmark", "monument"]],
    ]),
    lankaran: city(38.754, 48.851, "Lankaran", 15, [
      ["Lankaran Fortress", "18th-century fortress ruins.", "Lankaran, Azerbaijan", 38.754, 48.851, ["castle", "historic_site"]],
      ["Khan's House", "Historic residence of the Lankaran khan.", "Lankaran, Azerbaijan", 38.754, 48.851, ["historic_site", "museum"]],
      ["Lankaran Tea Culture House", "Museum of the region's tea heritage.", "Lankaran, Azerbaijan", 38.754, 48.851, ["museum"]],
      ["Hirkan National Park", "Subtropical forest UNESCO site near Lankaran.", "Hirkan National Park, Azerbaijan", 38.65, 48.8, ["park", "tourist_attraction"]],
    ]),
  },
  armenia: {
    yerevan: city(40.1792, 44.4991, "Yerevan", 15, [
      ["Republic Square", "Central square with singing fountains.", "Republic Square, Yerevan, Armenia", 40.1777, 44.5126, ["public_square", "landmark"]],
      ["Cascade Complex", "Giant stairway with art and city views.", "Cascade, Yerevan, Armenia", 40.1869, 44.5153, ["landmark", "viewpoint"]],
      ["Matenadaran", "Repository of ancient Armenian manuscripts.", "53 Mesrop Mashtots Ave, Yerevan, Armenia", 40.1917, 44.5253, ["museum", "historic_site"]],
      ["Armenian Genocide Memorial", "Tsitsernakaberd memorial and museum.", "Tsitsernakaberd, Yerevan, Armenia", 40.1867, 44.49, ["monument", "museum"]],
    ]),
    gyumri: city(40.7894, 43.8475, "Shirak", 12, [
      ["Vardanants Square", "Central square of Gyumri.", "Vardanants Square, Gyumri, Armenia", 40.7894, 43.8475, ["public_square", "landmark"]],
      ["Black Fortress", "Russian fortress overlooking the city.", "Black Fortress, Gyumri, Armenia", 40.8, 43.85, ["castle", "viewpoint"]],
      ["Seven Wounds Church", "19th-century church damaged in the 1988 earthquake.", "Gyumri, Armenia", 40.7894, 43.8475, ["landmark", "historic_site"]],
      ["Aslamazyan Sisters Museum", "Art museum in a historic mansion.", "Gyumri, Armenia", 40.7894, 43.8475, ["museum"]],
    ]),
    vanadzor: city(40.8128, 44.4883, "Lori", 12, [
      ["Vanadzor Fine Arts Museum", "Regional art collection.", "Vanadzor, Armenia", 40.8128, 44.4883, ["museum"]],
      ["Russian Church of the Nativity", "Historic Russian Orthodox church.", "Vanadzor, Armenia", 40.8128, 44.4883, ["landmark", "historic_site"]],
      ["Vanadzor Botanical Garden", "Botanical garden in the mountains.", "Vanadzor, Armenia", 40.8128, 44.4883, ["park"]],
      ["Lori-Pambak Geological Museum", "Geology and mineral museum.", "Vanadzor, Armenia", 40.8128, 44.4883, ["museum"]],
    ]),
    vagharshapat: city(40.1654, 44.2946, "Armavir", 12, [
      ["Etchmiadzin Cathedral", "Mother church of the Armenian Apostolic Church.", "Vagharshapat, Armenia", 40.1617, 44.2911, ["landmark", "historic_site"]],
      ["St. Hripsime Church", "7th-century UNESCO church.", "Vagharshapat, Armenia", 40.1654, 44.2946, ["historic_site", "landmark"]],
      ["St. Gayane Church", "Early Christian UNESCO church.", "Vagharshapat, Armenia", 40.1654, 44.2946, ["historic_site", "landmark"]],
      ["Etchmiadzin Museum", "Treasury of church relics and art.", "Vagharshapat, Armenia", 40.1654, 44.2946, ["museum"]],
    ]),
    hrazdan: city(40.5, 44.7667, "Kotayk", 12, [
      ["Hrazdan Gorge", "Scenic gorge with hiking trails.", "Hrazdan Gorge, Armenia", 40.5, 44.7667, ["park", "viewpoint"]],
      ["Makravank Monastery", "Medieval monastery near Hrazdan.", "Hrazdan, Armenia", 40.5, 44.7667, ["historic_site", "landmark"]],
      ["Hrazdan Regional Museum", "Local history museum.", "Hrazdan, Armenia", 40.5, 44.7667, ["museum"]],
      ["Lake Akna", "Alpine lake in the mountains above Hrazdan.", "Lake Akna, Armenia", 40.45, 44.8, ["lake", "viewpoint"]],
    ]),
  },
  georgia: {
    tbilisi: city(41.7151, 44.8271, "Tbilisi", 15, [
      ["Narikala Fortress", "Ancient fortress overlooking the old town.", "Narikala, Tbilisi, Georgia", 41.6878, 44.8092, ["castle", "viewpoint"]],
      ["Old Town Tbilisi", "Sulfur baths, balconied houses, and winding lanes.", "Abanotubani, Tbilisi, Georgia", 41.6897, 44.8111, ["old_town", "historic_site"]],
      ["Holy Trinity Cathedral", "Massive modern cathedral on Elia Hill.", "St. Trinity Church, Tbilisi, Georgia", 41.6975, 44.8169, ["landmark", "historic_site"]],
      ["Bridge of Peace", "Glass-and-steel bow bridge over the Mtkvari.", "Bridge of Peace, Tbilisi, Georgia", 41.6925, 44.8083, ["bridge", "landmark"]],
    ]),
    batumi: city(41.6168, 41.6367, "Adjara", 12, [
      ["Batumi Boulevard", "Seaside promenade with sculptures and cafes.", "Batumi Boulevard, Batumi, Georgia", 41.6467, 41.6333, ["park", "tourist_attraction"]],
      ["Alphabetic Tower", "130-metre tower with Georgian alphabet display.", "Batumi, Georgia", 41.6168, 41.6367, ["landmark", "viewpoint"]],
      ["Batumi Botanical Garden", "Subtropical garden on Green Cape.", "Green Cape, Batumi, Georgia", 41.6833, 41.7167, ["park", "tourist_attraction"]],
      ["Gonio Fortress", "Roman-Byzantine fortress near the Turkish border.", "Gonio, Batumi, Georgia", 41.5667, 41.5667, ["castle", "historic_site"]],
    ]),
    kutaisi: city(42.2679, 42.694, "Imereti", 15, [
      ["Bagrati Cathedral", "UNESCO 11th-century cathedral.", "Bagrati St, Kutaisi, Georgia", 42.2778, 42.7044, ["landmark", "historic_site"]],
      ["Gelati Monastery", "UNESCO golden-age monastery academy.", "Gelati, Kutaisi, Georgia", 42.2833, 42.7833, ["historic_site", "landmark"]],
      ["Prometheus Cave", "Spectacular karst cave with underground river.", "Prometheus Cave, Kutaisi, Georgia", 42.3667, 42.6, ["tourist_attraction", "historic_site"]],
      ["Kutaisi State Historical Museum", "Regional history museum.", "Kutaisi, Georgia", 42.2679, 42.694, ["museum"]],
    ]),
    rustavi: city(41.5494, 45.0108, "Kvemo Kartli", 12, [
      ["Rustavi Drama Theatre", "Cultural landmark of the industrial city.", "Rustavi, Georgia", 41.5494, 45.0108, ["landmark", "tourist_attraction"]],
      ["Rustavi History Museum", "Local history and archaeology.", "Rustavi, Georgia", 41.5494, 45.0108, ["museum"]],
      ["Rustavi Park", "Central city park.", "Rustavi, Georgia", 41.5494, 45.0108, ["park"]],
      ["Bolnisi Sioni", "Ancient basilica near Rustavi.", "Bolnisi, Georgia", 41.45, 44.5333, ["historic_site", "landmark"]],
    ]),
    zugdidi: city(42.5088, 41.8709, "Samegrelo", 12, [
      ["Dadiani Palace Museum", "Former royal palace with Napoleon artifacts.", "Zugdidi, Georgia", 42.5088, 41.8709, ["castle", "museum"]],
      ["Botanical Garden of Zugdidi", "Historic garden of the Dadiani family.", "Zugdidi, Georgia", 42.5088, 41.8709, ["park", "historic_site"]],
      ["Zugdidi Cathedral", "Main cathedral of the city.", "Zugdidi, Georgia", 42.5088, 41.8709, ["landmark", "historic_site"]],
      ["Kolkheti National Park", "Wetland park on the Black Sea coast.", "Kolkheti National Park, Georgia", 42.45, 41.75, ["park", "tourist_attraction"]],
    ]),
  },
};
