/** @typedef {[string, string, string, number, number, string[]]} PlaceTuple */

function city(lat, lng, region, radius, places) {
  return {
    coords: { lat, lng, region, searchRadiusKm: radius },
    places: places.map(([name, description, address, placeLat, placeLng, categories], index) => ({
      rank: index + 1, name, description, address, lat: placeLat, lng: placeLng, categories,
    })),
  };
}

export const REMAINING_ATTRACTIONS_PART5 = {
  serbia: {
    belgrade: city(44.7866, 20.4489, "Belgrade", 15, [
      ["Belgrade Fortress (Kalemegdan)", "Fortress at the confluence of Sava and Danube.", "Kalemegdan, Belgrade, Serbia", 44.8236, 20.4506, ["castle", "viewpoint"]],
      ["St. Sava Temple", "One of the world's largest Orthodox churches.", "Krušedolska 2a, Belgrade, Serbia", 44.7981, 20.4692, ["landmark", "historic_site"]],
      ["Skadarlija", "Bohemian cobbled street in the old town.", "Skadarlija, Belgrade, Serbia", 44.8186, 20.4631, ["old_town", "tourist_attraction"]],
      ["Republic Square", "Central square with National Museum and theatre.", "Trg republike, Belgrade, Serbia", 44.8172, 20.4572, ["public_square", "landmark"]],
    ]),
    "novi-sad": city(45.2671, 19.8335, "Vojvodina", 12, [
      ["Petrovaradin Fortress", "Austrian fortress above the Danube.", "Petrovaradin, Novi Sad, Serbia", 45.2514, 19.8667, ["castle", "viewpoint"]],
      ["Freedom Square", "Central square with neo-Gothic cathedral.", "Trg slobode, Novi Sad, Serbia", 45.2671, 19.8335, ["public_square", "landmark"]],
      ["Danube Park", "Central park with lake and monuments.", "Novi Sad, Serbia", 45.2671, 19.8335, ["park"]],
      ["Matica Srpska Gallery", "Premier Serbian art collection.", "Novi Sad, Serbia", 45.2671, 19.8335, ["museum"]],
    ]),
    nis: city(43.3209, 21.8958, "Niš", 12, [
      ["Niš Fortress", "Ottoman fortress in the city centre.", "Niš, Serbia", 43.3209, 21.8958, ["castle", "historic_site"]],
      ["Čegar Hill Monument", "Memorial to the Battle of Čegar.", "Niš, Serbia", 43.3209, 21.8958, ["monument", "historic_site"]],
      ["Skull Tower (Ćele Kula)", "Ottoman-era tower built from skulls.", "Niš, Serbia", 43.3209, 21.8958, ["monument", "historic_site"]],
      ["Mediana Archaeological Site", "Roman imperial villa ruins.", "Niš, Serbia", 43.3333, 21.8833, ["historic_site", "museum"]],
    ]),
    kragujevac: city(44.0128, 20.9114, "Šumadija", 12, [
      ["Šumarice Memorial Park", "WWII memorial park and museum.", "Kragujevac, Serbia", 44.0128, 20.9114, ["monument", "park"]],
      ["Kragujevac National Museum", "Regional history museum.", "Kragujevac, Serbia", 44.0128, 20.9114, ["museum"]],
      ["Amidža Konak", "Ottoman-era residence.", "Kragujevac, Serbia", 44.0128, 20.9114, ["historic_site", "landmark"]],
      ["First Grammar School", "Historic school building.", "Kragujevac, Serbia", 44.0128, 20.9114, ["historic_site", "landmark"]],
    ]),
    subotica: city(46.1006, 19.6653, "Vojvodina", 12, [
      ["City Hall", "Art Nouveau masterpiece by Raichle.", "Trg slobode 1, Subotica, Serbia", 46.1006, 19.6653, ["landmark", "historic_site"]],
      ["Synagogue of Subotica", "Hungarian Art Nouveau synagogue.", "Subotica, Serbia", 46.1006, 19.6653, ["historic_site", "landmark"]],
      ["Palic Lake", "Resort lake with art nouveau architecture.", "Palić, Subotica, Serbia", 46.1, 19.75, ["lake", "park"]],
      ["Subotica Municipal Museum", "Regional art and history.", "Subotica, Serbia", 46.1006, 19.6653, ["museum"]],
    ]),
  },
  croatia: {
    zagreb: city(45.815, 15.9819, "Zagreb", 15, [
      ["Ban Jelačić Square", "Central square and meeting point.", "Trg bana Josipa Jelačića, Zagreb, Croatia", 45.8131, 15.9773, ["public_square", "landmark"]],
      ["St. Mark's Church", "Colourful tiled roof with coat of arms.", "Trg Sv. Marka 5, Zagreb, Croatia", 45.8164, 15.9736, ["landmark", "historic_site"]],
      ["Zagreb Cathedral", "Gothic twin-spired cathedral.", "Kaptol, Zagreb, Croatia", 45.8144, 15.9789, ["landmark", "historic_site"]],
      ["Museum of Broken Relationships", "Museum of mementos from ended relationships.", "Ćirilometodska ul. 2, Zagreb, Croatia", 45.8147, 15.9736, ["museum"]],
    ]),
    split: city(43.5081, 16.4402, "Split", 15, [
      ["Diocletian's Palace", "UNESCO Roman palace forming the old town.", "Dioklecijanova ul., Split, Croatia", 43.5081, 16.4402, ["castle", "historic_site"]],
      ["Riva Promenade", "Harbourfront walkway along the Adriatic.", "Riva, Split, Croatia", 43.5075, 16.4397, ["tourist_attraction", "public_square"]],
      ["Marjan Hill", "Forest park with panoramic views.", "Marjan, Split, Croatia", 43.5083, 16.395, ["park", "viewpoint"]],
      ["Cathedral of Saint Domnius", "Ancient mausoleum turned cathedral.", "Kraj Sv. Duje 5, Split, Croatia", 43.5081, 16.4402, ["landmark", "historic_site"]],
    ]),
    dubrovnik: city(42.6507, 18.0944, "Dubrovnik", 12, [
      ["Dubrovnik City Walls", "Medieval walls encircling the old town.", "Dubrovnik, Croatia", 42.6426, 18.1094, ["historic_site", "viewpoint"]],
      ["Stradun", "Marble main street of the old town.", "Stradun, Dubrovnik, Croatia", 42.6413, 18.1094, ["old_town", "public_square"]],
      ["Rector's Palace", "Gothic-Renaissance palace museum.", "Pred Dvorom 3, Dubrovnik, Croatia", 42.6406, 18.1103, ["castle", "museum"]],
      ["Lokrum Island", "Forest island with botanical garden.", "Lokrum, Dubrovnik, Croatia", 42.6283, 18.1167, ["park", "tourist_attraction"]],
    ]),
    rijeka: city(45.3271, 14.4422, "Rijeka", 12, [
      ["Trsat Castle", "Hilltop fortress above the city.", "Trsat, Rijeka, Croatia", 45.3311, 14.4567, ["castle", "viewpoint"]],
      ["Korzo", "Main pedestrian street of Rijeka.", "Korzo, Rijeka, Croatia", 45.3271, 14.4422, ["old_town", "tourist_attraction"]],
      ["St. Vitus Cathedral", "Baroque rotunda cathedral.", "Rijeka, Croatia", 45.3271, 14.4422, ["landmark", "historic_site"]],
      ["Maritime and History Museum", "Museum in the Governor's Palace.", "Rijeka, Croatia", 45.3271, 14.4422, ["museum", "castle"]],
    ]),
    osijek: city(45.555, 18.6955, "Osijek", 12, [
      ["Tvrđa", "Baroque fortress quarter on the Drava.", "Tvrđa, Osijek, Croatia", 45.5606, 18.6955, ["historic_site", "old_town"]],
      ["Co-Cathedral of St. Peter and Paul", "Neo-Gothic twin-towered cathedral.", "Osijek, Croatia", 45.555, 18.6955, ["landmark", "historic_site"]],
      ["Osijek Museum", "Regional history and art.", "Osijek, Croatia", 45.555, 18.6955, ["museum"]],
      ["Kopacki Rit Nature Park", "Wetland park at the Danube-Drava confluence.", "Kopački Rit, Croatia", 45.6333, 18.75, ["park", "tourist_attraction"]],
    ]),
  },
  slovenia: {
    ljubljana: city(46.0569, 14.5058, "Ljubljana", 12, [
      ["Ljubljana Castle", "Medieval castle on the hill above the old town.", "Grajska planota 1, Ljubljana, Slovenia", 46.0489, 14.5084, ["castle", "viewpoint"]],
      ["Triple Bridge", "Iconic group of bridges by Plečnik.", "Tromostovje, Ljubljana, Slovenia", 46.0511, 14.5061, ["bridge", "landmark"]],
      ["Prešeren Square", "Central square with pink Franciscan church.", "Prešernov trg, Ljubljana, Slovenia", 46.0511, 14.5061, ["public_square", "landmark"]],
      ["Tivoli Park", "Ljubljana's largest park.", "Tivoli, Ljubljana, Slovenia", 46.0569, 14.4958, ["park"]],
    ]),
    maribor: city(46.5547, 15.6459, "Maribor", 12, [
      ["Old Vine House", "Home of the world's oldest grapevine.", "Vojašniška ulica 8, Maribor, Slovenia", 46.5547, 15.6459, ["historic_site", "museum"]],
      ["Maribor Castle", "Baroque castle housing regional museum.", "Maribor, Slovenia", 46.5547, 15.6459, ["castle", "museum"]],
      ["Lent Quarter", "Riverside old town along the Drava.", "Lent, Maribor, Slovenia", 46.5547, 15.6459, ["old_town", "tourist_attraction"]],
      ["Maribor Cathedral", "Gothic cathedral on Slomškov Square.", "Maribor, Slovenia", 46.5547, 15.6459, ["landmark", "historic_site"]],
    ]),
    celje: city(46.2312, 15.268, "Celje", 12, [
      ["Celje Castle", "Ruined fortress above the old town.", "Cesta na Grad 78, Celje, Slovenia", 46.2312, 15.268, ["castle", "viewpoint"]],
      ["Celje Regional Museum", "History museum in the old centre.", "Celje, Slovenia", 46.2312, 15.268, ["museum"]],
      ["Old Counts' Mansion", "Renaissance mansion on Krek Square.", "Celje, Slovenia", 46.2312, 15.268, ["historic_site", "landmark"]],
      ["Celje Cathedral", "Gothic cathedral in the centre.", "Celje, Slovenia", 46.2312, 15.268, ["landmark", "historic_site"]],
    ]),
    kranj: city(46.2389, 14.3556, "Kranj", 12, [
      ["Kranj Old Town", "Medieval centre above canyon gorges.", "Kranj, Slovenia", 46.2389, 14.3556, ["old_town", "historic_site"]],
      ["Kokra River Canyon", "Canyon running through the city centre.", "Kranj, Slovenia", 46.2389, 14.3556, ["viewpoint", "tourist_attraction"]],
      ["Prešeren House", "Birthplace museum of Slovenia's national poet.", "Kranj, Slovenia", 46.2389, 14.3556, ["museum", "historic_site"]],
      ["Khislstein Castle", "Castle hosting the Gorenjska Museum.", "Kranj, Slovenia", 46.2389, 14.3556, ["castle", "museum"]],
    ]),
    "novo-mesto": city(45.8044, 15.1689, "Novo Mesto", 12, [
      ["Novo Mesto Old Town", "Historic centre on a bend of the Krka.", "Novo Mesto, Slovenia", 45.8044, 15.1689, ["old_town", "historic_site"]],
      ["Kapitelj Hill", "Hilltop church with town views.", "Novo Mesto, Slovenia", 45.8044, 15.1689, ["viewpoint", "landmark"]],
      ["Jaguar Archaeological Park", "Iron Age hillfort settlement.", "Novo Mesto, Slovenia", 45.8044, 15.1689, ["historic_site", "museum"]],
      ["Dolenjska Museum", "Regional history and art museum.", "Novo Mesto, Slovenia", 45.8044, 15.1689, ["museum"]],
    ]),
  },
  slovakia: {
    bratislava: city(48.1486, 17.1077, "Bratislava", 12, [
      ["Bratislava Castle", "White castle overlooking the Danube.", "Hrad, 811 06 Bratislava, Slovakia", 48.142, 17.1, ["castle", "viewpoint"]],
      ["Old Town Hall", "Medieval town hall on Main Square.", "Hlavné námestie, Bratislava, Slovakia", 48.1439, 17.1097, ["historic_site", "landmark"]],
      ["St. Martin's Cathedral", "Coronation church of Hungarian kings.", "Rudnayovo námestie 1, Bratislava, Slovakia", 48.1422, 17.1047, ["landmark", "historic_site"]],
      ["Blue Church", "Art Nouveau church of St. Elizabeth.", "Bezručova 2, Bratislava, Slovakia", 48.1433, 17.1167, ["landmark", "historic_site"]],
    ]),
    kosice: city(48.7164, 21.2611, "Košice", 12, [
      ["St. Elisabeth Cathedral", "Gothic cathedral on Main Street.", "Hlavná ulica, Košice, Slovakia", 48.7206, 21.2581, ["landmark", "historic_site"]],
      ["Košice State Theatre", "Neo-baroque theatre on the square.", "Košice, Slovakia", 48.7164, 21.2611, ["landmark", "tourist_attraction"]],
      ["Urban Tower", "Gothic bell tower beside the cathedral.", "Košice, Slovakia", 48.7164, 21.2611, ["historic_site", "landmark"]],
      ["East Slovak Museum", "Regional history museum.", "Košice, Slovakia", 48.7164, 21.2611, ["museum"]],
    ]),
    presov: city(48.9984, 21.2339, "Prešov", 12, [
      ["St. Nicholas Cathedral", "Gothic cathedral in the centre.", "Prešov, Slovakia", 48.9984, 21.2339, ["landmark", "historic_site"]],
      ["Prešov Main Street", "Historic pedestrian street.", "Prešov, Slovakia", 48.9984, 21.2339, ["old_town", "tourist_attraction"]],
      ["Salanfa's House", "Renaissance burgher house.", "Prešov, Slovakia", 48.9984, 21.2339, ["historic_site", "landmark"]],
      ["Šariš Museum", "Regional museum in a former synagogue.", "Prešov, Slovakia", 48.9984, 21.2339, ["museum", "historic_site"]],
    ]),
    nitra: city(48.3069, 18.0864, "Nitra", 12, [
      ["Nitra Castle", "Castle on the hill above the old town.", "Nitra, Slovakia", 48.3189, 18.0864, ["castle", "viewpoint"]],
      ["St. Emmeram's Cathedral", "Cathedral within the castle complex.", "Nitra, Slovakia", 48.3189, 18.0864, ["landmark", "historic_site"]],
      ["Nitra Old Town", "Historic centre at the foot of the castle.", "Nitra, Slovakia", 48.3069, 18.0864, ["old_town", "historic_site"]],
      ["Zobor Hill", "Hill with monastery ruins and views.", "Nitra, Slovakia", 48.3333, 18.0833, ["viewpoint", "historic_site"]],
    ]),
    zilina: city(49.2231, 18.7394, "Žilina", 12, [
      ["Mariánske Square", "Central square with burgher houses.", "Žilina, Slovakia", 49.2231, 18.7394, ["public_square", "old_town"]],
      ["St. Paul the Apostle Church", "Baroque Jesuit church.", "Žilina, Slovakia", 49.2231, 18.7394, ["landmark", "historic_site"]],
      ["Budatín Castle", "Castle at the confluence of Váh and Kysuca.", "Žilina, Slovakia", 49.2333, 18.7333, ["castle", "museum"]],
      ["Považskie Museum", "Regional history museum.", "Žilina, Slovakia", 49.2231, 18.7394, ["museum"]],
    ]),
  },
  "bosnia-and-herzegovina": {
    sarajevo: city(43.8563, 18.4131, "Sarajevo", 12, [
      ["Baščaršija", "Ottoman old bazaar quarter.", "Baščaršija, Sarajevo, Bosnia and Herzegovina", 43.8592, 18.4289, ["old_town", "historic_site"]],
      ["Latin Bridge", "Bridge near the site of Franz Ferdinand's assassination.", "Sarajevo, Bosnia and Herzegovina", 43.8575, 18.4286, ["bridge", "historic_site"]],
      ["Gazi Husrev-beg Mosque", "16th-century Ottoman mosque.", "Sarajevo, Bosnia and Herzegovina", 43.8592, 18.4289, ["landmark", "historic_site"]],
      ["Yellow Fortress", "Ottoman fortress with sunset views.", "Sarajevo, Bosnia and Herzegovina", 43.8633, 18.4333, ["castle", "viewpoint"]],
    ]),
    "banja-luka": city(44.7722, 17.191, "Banja Luka", 12, [
      ["Kastel Fortress", "Medieval fortress on the Vrbas.", "Banja Luka, Bosnia and Herzegovina", 44.7722, 17.191, ["castle", "historic_site"]],
      ["Cathedral of Christ the Saviour", "Serbian Orthodox cathedral.", "Banja Luka, Bosnia and Herzegovina", 44.7722, 17.191, ["landmark", "historic_site"]],
      ["Ferhat Pasha Mosque", "Rebuilt Ottoman mosque.", "Banja Luka, Bosnia and Herzegovina", 44.7722, 17.191, ["landmark", "historic_site"]],
      ["Banski Dvor", "Cultural centre in a former governor's palace.", "Banja Luka, Bosnia and Herzegovina", 44.7722, 17.191, ["castle", "museum"]],
    ]),
    mostar: city(43.3438, 17.8078, "Mostar", 12, [
      ["Stari Most (Old Bridge)", "UNESCO Ottoman bridge over the Neretva.", "Stari Most, Mostar, Bosnia and Herzegovina", 43.3373, 17.815, ["bridge", "landmark"]],
      ["Old Bazaar (Kujundžiluk)", "Ottoman market street near the bridge.", "Mostar, Bosnia and Herzegovina", 43.3438, 17.8078, ["old_town", "historic_site"]],
      ["Koski Mehmed Pasha Mosque", "Mosque with minaret views over the bridge.", "Mostar, Bosnia and Herzegovina", 43.3438, 17.8078, ["landmark", "viewpoint"]],
      ["Muslibegović House", "Ottoman noble house museum.", "Mostar, Bosnia and Herzegovina", 43.3438, 17.8078, ["museum", "historic_site"]],
    ]),
    tuzla: city(44.5384, 18.6761, "Tuzla", 12, [
      ["Pannonian Lakes", "Salt lakes complex in the city.", "Tuzla, Bosnia and Herzegovina", 44.5384, 18.6761, ["lake", "park"]],
      ["Tuzla Old Town", "Historic centre with clock tower.", "Tuzla, Bosnia and Herzegovina", 44.5384, 18.6761, ["old_town", "historic_site"]],
      ["National Theatre Tuzla", "Cultural landmark of the city.", "Tuzla, Bosnia and Herzegovina", 44.5384, 18.6761, ["landmark", "tourist_attraction"]],
      ["Tuzla Salt Museum", "Museum of the city's salt-mining heritage.", "Tuzla, Bosnia and Herzegovina", 44.5384, 18.6761, ["museum", "historic_site"]],
    ]),
    zenica: city(44.2039, 17.9078, "Zenica", 12, [
      ["Zenica Old Town", "Historic quarter on the Bosna river.", "Zenica, Bosnia and Herzegovina", 44.2039, 17.9078, ["old_town", "historic_site"]],
      ["Stara Čaršija Mosque", "Historic mosque in the old quarter.", "Zenica, Bosnia and Herzegovina", 44.2039, 17.9078, ["landmark", "historic_site"]],
      ["Zenica City Museum", "Regional history museum.", "Zenica, Bosnia and Herzegovina", 44.2039, 17.9078, ["museum"]],
      ["Vranduk Fortress", "Medieval fortress on the Bosna.", "Vranduk, Zenica, Bosnia and Herzegovina", 44.2, 17.95, ["castle", "historic_site"]],
    ]),
  },
  montenegro: {
    podgorica: city(42.4304, 19.2594, "Podgorica", 15, [
      ["Millennium Bridge", "Cable-stayed bridge over the Morača.", "Podgorica, Montenegro", 42.4304, 19.2594, ["bridge", "landmark"]],
      ["Cathedral of the Resurrection", "New Orthodox cathedral.", "Podgorica, Montenegro", 42.4304, 19.2594, ["landmark", "historic_site"]],
      ["Clock Tower", "Ottoman-era clock tower in the old town.", "Podgorica, Montenegro", 42.4304, 19.2594, ["monument", "historic_site"]],
      ["Duklja Ruins", "Ancient Roman town ruins.", "Duklja, Podgorica, Montenegro", 42.45, 19.2833, ["historic_site", "tourist_attraction"]],
    ]),
    niksic: city(42.7731, 18.9444, "Nikšić", 12, [
      ["King Nikola's Palace", "Former royal palace and museum.", "Nikšić, Montenegro", 42.7731, 18.9444, ["castle", "museum"]],
      ["Basilica of St. Basil of Ostrog", "Modern Orthodox church.", "Nikšić, Montenegro", 42.7731, 18.9444, ["landmark", "historic_site"]],
      ["Nikšić City Park", "Central park with monuments.", "Nikšić, Montenegro", 42.7731, 18.9444, ["park"]],
      ["Red Rock Lake", "Scenic lake near Nikšić.", "Nikšić, Montenegro", 42.75, 18.9, ["lake", "viewpoint"]],
    ]),
    "herceg-novi": city(42.4531, 18.5375, "Herceg Novi", 12, [
      ["Fort Mare", "Seaside fortress on the promenade.", "Herceg Novi, Montenegro", 42.4531, 18.5375, ["castle", "historic_site"]],
      ["Kanli Kula", "Ottoman fortress used as summer stage.", "Herceg Novi, Montenegro", 42.4531, 18.5375, ["castle", "viewpoint"]],
      ["Savina Monastery", "Medieval monastery above the bay.", "Herceg Novi, Montenegro", 42.4531, 18.5375, ["historic_site", "landmark"]],
      ["Herceg Novi Old Town", "Staircase streets and stone squares.", "Herceg Novi, Montenegro", 42.4531, 18.5375, ["old_town", "historic_site"]],
    ]),
    bar: city(42.0944, 19.1, "Bar", 15, [
      ["Stari Bar (Old Bar)", "Ruined medieval town in the hills.", "Stari Bar, Montenegro", 42.0944, 19.1, ["historic_site", "old_town"]],
      ["King Nikola's Palace Bar", "Palace museum by the sea.", "Bar, Montenegro", 42.0944, 19.1, ["castle", "museum"]],
      ["Olive Tree of Mirovica", "Over 2,000-year-old olive tree.", "Bar, Montenegro", 42.0944, 19.1, ["monument", "historic_site"]],
      ["Bar Beach", "Long pebble beach on the Adriatic.", "Bar, Montenegro", 42.0944, 19.1, ["tourist_attraction", "viewpoint"]],
    ]),
    budva: city(42.2864, 18.84, "Budva", 12, [
      ["Budva Old Town", "Walled medieval town on the Adriatic.", "Stari Grad, Budva, Montenegro", 42.2864, 18.84, ["old_town", "historic_site"]],
      ["Citadel", "Fortress at the tip of the old town.", "Budva, Montenegro", 42.2864, 18.84, ["castle", "viewpoint"]],
      ["Dancing Girl Statue", "Bronze statue on a cliff by the sea.", "Budva, Montenegro", 42.2864, 18.84, ["monument", "landmark"]],
      ["Mogren Beach", "Beach below cliffs near the old town.", "Budva, Montenegro", 42.2864, 18.84, ["tourist_attraction", "viewpoint"]],
    ]),
  },
  "north-macedonia": {
    skopje: city(41.9981, 21.4254, "Skopje", 15, [
      ["Skopje Old Bazaar", "Ottoman market quarter.", "Stara Čaršija, Skopje, North Macedonia", 41.9981, 21.4354, ["old_town", "historic_site"]],
      ["Stone Bridge", "Ottoman bridge over the Vardar.", "Skopje, North Macedonia", 41.9964, 21.4331, ["bridge", "landmark"]],
      ["Skopje Fortress (Kale)", "Medieval fortress above the city.", "Skopje, North Macedonia", 42.0014, 21.4339, ["castle", "viewpoint"]],
      ["Mother Teresa Memorial House", "Museum to the Nobel laureate.", "Skopje, North Macedonia", 41.9981, 21.4254, ["museum", "historic_site"]],
    ]),
    bitola: city(41.0311, 21.3347, "Bitola", 12, [
      ["Heraclea Lyncestis", "Ancient Macedonian and Roman ruins.", "Bitola, North Macedonia", 41.0311, 21.3347, ["historic_site", "museum"]],
      ["Shirok Sokak", "Ottoman-era pedestrian street.", "Bitola, North Macedonia", 41.0311, 21.3347, ["old_town", "tourist_attraction"]],
      ["Clock Tower", "Ottoman clock tower on the main street.", "Bitola, North Macedonia", 41.0311, 21.3347, ["monument", "landmark"]],
      ["Bitola Museum", "Regional history museum.", "Bitola, North Macedonia", 41.0311, 21.3347, ["museum"]],
    ]),
    ohrid: city(41.1231, 20.8016, "Ohrid", 12, [
      ["Church of St. John at Kaneo", "Iconic lakeside medieval church.", "Ohrid, North Macedonia", 41.1117, 20.7886, ["landmark", "historic_site"]],
      ["Ohrid Old Town", "UNESCO quarter with Byzantine churches.", "Ohrid, North Macedonia", 41.1231, 20.8016, ["old_town", "historic_site"]],
      ["Samuel's Fortress", "Tsar Samuel's fortress above the lake.", "Ohrid, North Macedonia", 41.1231, 20.8016, ["castle", "viewpoint"]],
      ["Lake Ohrid", "Ancient UNESCO lake shared with Albania.", "Lake Ohrid, North Macedonia", 41.1231, 20.8016, ["lake", "tourist_attraction"]],
    ]),
    kumanovo: city(42.1322, 21.7144, "Kumanovo", 12, [
      ["Kumanovo Old Bazaar", "Ottoman market quarter.", "Kumanovo, North Macedonia", 42.1322, 21.7144, ["old_town", "historic_site"]],
      ["Kokino Observatory", "Bronze Age megalithic observatory.", "Kokino, North Macedonia", 42.25, 21.95, ["historic_site", "viewpoint"]],
      ["Holy Trinity Church", "Main Orthodox church.", "Kumanovo, North Macedonia", 42.1322, 21.7144, ["landmark", "historic_site"]],
      ["Kumanovo Museum", "Regional history museum.", "Kumanovo, North Macedonia", 42.1322, 21.7144, ["museum"]],
    ]),
    tetovo: city(42.0106, 20.9714, "Tetovo", 12, [
      ["Painted Mosque", "Colourful Ottoman mosque with frescoes.", "Tetovo, North Macedonia", 42.0106, 20.9714, ["landmark", "historic_site"]],
      ["Arabati Baba Tekke", "Bektashi Sufi monastery complex.", "Tetovo, North Macedonia", 42.0106, 20.9714, ["historic_site", "landmark"]],
      ["Tetovo Fortress", "Hilltop ruins above the city.", "Tetovo, North Macedonia", 42.0106, 20.9714, ["castle", "viewpoint"]],
      ["Šarena Džamija", "Decorated mosque in the old town.", "Tetovo, North Macedonia", 42.0106, 20.9714, ["landmark", "historic_site"]],
    ]),
  },
  albania: {
    tirana: city(41.3275, 19.8187, "Tirana", 12, [
      ["Skanderbeg Square", "Central square with equestrian statue.", "Sheshi Skënderbej, Tirana, Albania", 41.3275, 19.8187, ["public_square", "landmark"]],
      ["Et'hem Bey Mosque", "Ottoman mosque on the main square.", "Tirana, Albania", 41.3275, 19.8187, ["landmark", "historic_site"]],
      ["Bunk'Art 2", "Cold War bunker museum.", "Tirana, Albania", 41.3275, 19.8187, ["museum", "historic_site"]],
      ["Dajti Mountain", "Mountain with cable car and panoramic views.", "Dajti, Tirana, Albania", 41.3667, 19.9, ["mountain", "viewpoint"]],
    ]),
    durres: city(41.3231, 19.4414, "Durrës", 12, [
      ["Durrës Amphitheatre", "Largest Roman amphitheatre in the Balkans.", "Durrës, Albania", 41.3231, 19.4414, ["historic_site", "tourist_attraction"]],
      ["Durrës Castle", "Venetian fortress by the harbour.", "Durrës, Albania", 41.3231, 19.4414, ["castle", "historic_site"]],
      ["Durrës Archaeological Museum", "Largest archaeology museum in Albania.", "Durrës, Albania", 41.3231, 19.4414, ["museum"]],
      ["Durrës Beach", "Long sandy beach on the Adriatic.", "Durrës, Albania", 41.3231, 19.4414, ["tourist_attraction", "viewpoint"]],
    ]),
    vlore: city(40.4667, 19.4897, "Vlorë", 15, [
      ["Independence Monument", "Monument where Albania declared independence.", "Vlorë, Albania", 40.4667, 19.4897, ["monument", "landmark"]],
      ["Kuzum Baba", "Hilltop Bektashi shrine with views.", "Vlorë, Albania", 40.4667, 19.4897, ["viewpoint", "historic_site"]],
      ["Flag Square", "Central square of Vlorë.", "Vlorë, Albania", 40.4667, 19.4897, ["public_square", "landmark"]],
      ["Zvernec Monastery", "Byzantine monastery on a lagoon island.", "Zvernec, Vlorë, Albania", 40.5, 19.45, ["historic_site", "landmark"]],
    ]),
    shkoder: city(42.0683, 19.5126, "Shkodër", 15, [
      ["Rozafa Castle", "Legendary hilltop fortress above the city.", "Shkodër, Albania", 42.0683, 19.5126, ["castle", "viewpoint"]],
      ["Shkodër Cathedral", "Main Catholic cathedral.", "Shkodër, Albania", 42.0683, 19.5126, ["landmark", "historic_site"]],
      ["Marubi National Museum of Photography", "Historic photography collection.", "Shkodër, Albania", 42.0683, 19.5126, ["museum"]],
      ["Lake Shkodra", "Largest lake in southern Europe.", "Lake Shkodra, Albania", 42.0683, 19.5126, ["lake", "tourist_attraction"]],
    ]),
    elbasan: city(41.1125, 20.0822, "Elbasan", 12, [
      ["Elbasan Castle", "Ottoman walls enclosing the old town.", "Elbasan, Albania", 41.1125, 20.0822, ["castle", "old_town"]],
      ["King Mosque", "Historic mosque within the castle.", "Elbasan, Albania", 41.1125, 20.0822, ["landmark", "historic_site"]],
      ["Ethnographic Museum", "Traditional Albanian life museum.", "Elbasan, Albania", 41.1125, 20.0822, ["museum", "historic_site"]],
      ["Saint Mary Church", "Orthodox church in the old quarter.", "Elbasan, Albania", 41.1125, 20.0822, ["landmark", "historic_site"]],
    ]),
  },
};
