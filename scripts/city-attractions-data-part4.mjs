/** @typedef {[string, string, string, number, number, string[]]} PlaceTuple */

function city(lat, lng, region, radius, places) {
  return {
    coords: { lat, lng, region, searchRadiusKm: radius },
    places: places.map(([name, description, address, placeLat, placeLng, categories], index) => ({
      rank: index + 1, name, description, address, lat: placeLat, lng: placeLng, categories,
    })),
  };
}

export const REMAINING_ATTRACTIONS_PART4 = {
  moldova: {
    chisinau: city(47.0105, 28.8638, "Chișinău", 12, [
      ["Stefan cel Mare Park", "Central park with the ruler's monument.", "Stefan cel Mare Park, Chișinău, Moldova", 47.0244, 28.8322, ["park", "monument"]],
      ["Nativity Cathedral", "Main Orthodox cathedral on Cathedral Park.", "Cathedral Park, Chișinău, Moldova", 47.025, 28.835, ["landmark", "historic_site"]],
      ["Triumphal Arch", "Arc de Triomphe celebrating Russian victory.", "Great National Assembly Square, Chișinău, Moldova", 47.0247, 28.8342, ["monument", "landmark"]],
      ["National Museum of History", "Moldovan history and culture museum.", "31 August 1989 St, Chișinău, Moldova", 47.0228, 28.8297, ["museum"]],
    ]),
    tiraspol: city(46.8483, 29.6283, "Transnistria", 12, [
      ["Suvorov Square", "Central square with statue of Alexander Suvorov.", "Suvorov Square, Tiraspol, Moldova", 46.8483, 29.6283, ["public_square", "monument"]],
      ["Tiraspol Fortress", "18th-century Russian fortress ruins.", "Tiraspol, Moldova", 46.8483, 29.6283, ["castle", "historic_site"]],
      ["Transnistria Parliament", "Government building on 25 October Street.", "25 October St, Tiraspol, Moldova", 46.8483, 29.6283, ["landmark", "historic_site"]],
      ["Kvint Factory Museum", "Famous cognac distillery museum.", "Tiraspol, Moldova", 46.8483, 29.6283, ["museum", "historic_site"]],
    ]),
    balti: city(47.7631, 27.9289, "Bălți", 12, [
      ["St. Nicholas Cathedral", "Main cathedral of Moldova's second city.", "Bălți, Moldova", 47.7631, 27.9289, ["landmark", "historic_site"]],
      ["Bălți Regional Museum", "Local history and ethnography.", "Bălți, Moldova", 47.7631, 27.9289, ["museum"]],
      ["Independence Square", "Central square of Bălți.", "Bălți, Moldova", 47.7631, 27.9289, ["public_square", "landmark"]],
      ["Vasile Alecsandri Theatre", "Historic theatre building.", "Bălți, Moldova", 47.7631, 27.9289, ["landmark", "tourist_attraction"]],
    ]),
    cahul: city(45.9075, 28.1944, "Cahul", 12, [
      ["Cahul Regional Museum", "History and ethnography of southern Moldova.", "Cahul, Moldova", 45.9075, 28.1944, ["museum"]],
      ["Cahul Park", "Central city park.", "Cahul, Moldova", 45.9075, 28.1944, ["park"]],
      ["St. Archangel Michael Church", "Main Orthodox church.", "Cahul, Moldova", 45.9075, 28.1944, ["landmark", "historic_site"]],
      ["Lower Prut Natural Reserve", "Wetland reserve near Cahul.", "Lower Prut Reserve, Moldova", 45.85, 28.15, ["park", "tourist_attraction"]],
    ]),
    orhei: city(47.3833, 28.8167, "Orhei", 15, [
      ["Orheiul Vechi", "Ancient cave monastery complex on the Răut.", "Orheiul Vechi, Moldova", 47.3056, 28.975, ["historic_site", "viewpoint"]],
      ["Orhei Regional Museum", "Local archaeology and history.", "Orhei, Moldova", 47.3833, 28.8167, ["museum"]],
      ["St. Demetrius Church", "Historic church in the town centre.", "Orhei, Moldova", 47.3833, 28.8167, ["landmark", "historic_site"]],
      ["Răut River Gorge", "Scenic canyon near Orheiul Vechi.", "Orhei, Moldova", 47.35, 28.9, ["viewpoint", "tourist_attraction"]],
    ]),
  },
  latvia: {
    riga: city(56.9496, 24.1052, "Riga", 15, [
      ["Riga Old Town", "UNESCO medieval and Art Nouveau quarter.", "Vecrīga, Riga, Latvia", 56.9496, 24.1052, ["old_town", "historic_site"]],
      ["House of the Blackheads", "Ornate guild house on Town Hall Square.", "Rātslaukums 7, Riga, Latvia", 56.9475, 24.1069, ["landmark", "historic_site"]],
      ["Riga Central Market", "Europe's largest market in Zeppelin hangars.", "Nēģu iela 7, Riga, Latvia", 56.9431, 24.1142, ["tourist_attraction", "historic_site"]],
      ["Freedom Monument", "Art Deco monument honouring Latvian independence.", "Brīvības bulvāris, Riga, Latvia", 56.9516, 24.1133, ["monument", "landmark"]],
    ]),
    daugavpils: city(55.8747, 26.5362, "Daugavpils", 12, [
      ["Daugavpils Fortress", "19th-century star fortress.", "Daugavpils Fortress, Latvia", 55.8833, 26.5167, ["castle", "historic_site"]],
      ["Mark Rothko Art Centre", "Museum dedicated to the abstract painter.", "Daugavpils, Latvia", 55.8747, 26.5362, ["museum"]],
      ["Daugavpils Regional Museum", "Local history museum.", "Daugavpils, Latvia", 55.8747, 26.5362, ["museum"]],
      ["Church Hill", "Historic churches on a hill above the city.", "Daugavpils, Latvia", 55.8747, 26.5362, ["historic_site", "viewpoint"]],
    ]),
    liepaja: city(56.5047, 21.0108, "Liepāja", 12, [
      ["Liepāja Beach", "Wide sandy beach on the Baltic Sea.", "Liepāja Beach, Latvia", 56.5167, 21.0167, ["tourist_attraction", "viewpoint"]],
      ["Karosta Prison", "Former military prison turned museum.", "Karosta, Liepāja, Latvia", 56.55, 21.0167, ["museum", "historic_site"]],
      ["Holy Trinity Cathedral", "Baroque cathedral with organ concerts.", "Liepāja, Latvia", 56.5047, 21.0108, ["landmark", "historic_site"]],
      ["Liepāja Theatre Square", "Central square with historic theatre.", "Liepāja, Latvia", 56.5047, 21.0108, ["public_square", "landmark"]],
    ]),
    jelgava: city(56.6511, 23.7214, "Jelgava", 12, [
      ["Jelgava Palace", "Largest Baroque palace in the Baltics.", "Lielā iela 2, Jelgava, Latvia", 56.6511, 23.7214, ["castle", "museum"]],
      ["Holy Trinity Church Tower", "Ruined church tower in the palace park.", "Jelgava, Latvia", 56.6511, 23.7214, ["historic_site", "landmark"]],
      ["Jelgava History and Art Museum", "Regional museum in the palace.", "Jelgava, Latvia", 56.6511, 23.7214, ["museum"]],
      ["Duke Jacob's Canal", "Historic canal through the city.", "Jelgava, Latvia", 56.6511, 23.7214, ["historic_site", "tourist_attraction"]],
    ]),
    jurmala: city(56.968, 23.7703, "Jūrmala", 12, [
      ["Jomas Street", "Pedestrian street through the resort town.", "Jomas iela, Jūrmala, Latvia", 56.968, 23.7703, ["old_town", "tourist_attraction"]],
      ["Dzintari Forest Park", "Pine forest park with viewing tower.", "Jūrmala, Latvia", 56.968, 23.7703, ["park", "viewpoint"]],
      ["Dzintari Concert Hall", "Open-air concert venue.", "Jūrmala, Latvia", 56.968, 23.7703, ["landmark", "tourist_attraction"]],
      ["Jūrmala Beach", "26 km of white sand on the Gulf of Riga.", "Jūrmala Beach, Latvia", 56.968, 23.7703, ["tourist_attraction", "viewpoint"]],
    ]),
  },
  lithuania: {
    vilnius: city(54.6872, 25.2797, "Vilnius", 15, [
      ["Vilnius Old Town", "UNESCO baroque old town with cobbled lanes.", "Senamiestis, Vilnius, Lithuania", 54.6828, 25.2875, ["old_town", "historic_site"]],
      ["Gediminas Tower", "Medieval tower on Castle Hill.", "Arsenalo g. 5, Vilnius, Lithuania", 54.6869, 25.2906, ["castle", "viewpoint"]],
      ["Vilnius Cathedral", "Neoclassical cathedral on Cathedral Square.", "Cathedral Square, Vilnius, Lithuania", 54.6859, 25.2878, ["landmark", "historic_site"]],
      ["Gate of Dawn", "City gate with miraculous icon of the Virgin Mary.", "Aušros Vartų g. 14, Vilnius, Lithuania", 54.6742, 25.2897, ["historic_site", "landmark"]],
    ]),
    kaunas: city(54.8985, 23.9036, "Kaunas", 12, [
      ["Kaunas Old Town", "Medieval quarter around Town Hall Square.", "Rotušės a. 15, Kaunas, Lithuania", 54.8985, 23.9036, ["old_town", "historic_site"]],
      ["Kaunas Castle", "Gothic castle at the confluence of two rivers.", "Pilies g. 17, Kaunas, Lithuania", 54.8985, 23.8856, ["castle", "historic_site"]],
      ["Christ's Resurrection Church", "Art Deco church with panoramic terrace.", "Žemaičių g. 31, Kaunas, Lithuania", 54.8985, 23.9036, ["landmark", "viewpoint"]],
      ["Ninth Fort", "WWII memorial and museum.", "Žemaičių pl. 75, Kaunas, Lithuania", 54.9167, 23.8833, ["museum", "monument"]],
    ]),
    klaipeda: city(55.7033, 21.1443, "Klaipėda", 15, [
      ["Klaipėda Old Town", "Fachwerk houses and Theatre Square.", "Teatro a. 1, Klaipėda, Lithuania", 55.7033, 21.1443, ["old_town", "historic_site"]],
      ["Curonian Spit", "UNESCO sand dune peninsula.", "Curonian Spit, Lithuania", 55.5, 21.1167, ["park", "viewpoint"]],
      ["Klaipėda Castle Museum", "Museum in the remains of the castle.", "Klaipėda, Lithuania", 55.7033, 21.1443, ["museum", "castle"]],
      ["Meridianas Ship", "Historic sailing ship on the Dane river.", "Klaipėda, Lithuania", 55.7033, 21.1443, ["historic_site", "landmark"]],
    ]),
    siauliai: city(55.9349, 23.3137, "Šiauliai", 15, [
      ["Hill of Crosses", "Sacred hill covered with hundreds of thousands of crosses.", "Hill of Crosses, Lithuania", 56.0153, 23.4156, ["monument", "historic_site"]],
      ["Šiauliai Cathedral", "Renaissance cathedral in the centre.", "Šiauliai, Lithuania", 55.9349, 23.3137, ["landmark", "historic_site"]],
      ["Chaim Frenkel Villa", "Art nouveau villa and museum.", "Šiauliai, Lithuania", 55.9349, 23.3137, ["museum", "historic_site"]],
      ["Sundial Square", "Central square with giant sundial.", "Šiauliai, Lithuania", 55.9349, 23.3137, ["public_square", "landmark"]],
    ]),
    panevezys: city(55.7333, 24.35, "Panevėžys", 12, [
      ["Panevėžys Cathedral", "Neoclassical cathedral.", "Panevėžys, Lithuania", 55.7333, 24.35, ["landmark", "historic_site"]],
      ["Panevėžys Regional Museum", "Local history museum.", "Panevėžys, Lithuania", 55.7333, 24.35, ["museum"]],
      ["Senvagė Park", "Central park along the river.", "Panevėžys, Lithuania", 55.7333, 24.35, ["park"]],
      ["Juozas Miltinis Drama Theatre", "Historic theatre building.", "Panevėžys, Lithuania", 55.7333, 24.35, ["landmark", "tourist_attraction"]],
    ]),
  },
  estonia: {
    tallinn: city(59.437, 24.7536, "Harju", 12, [
      ["Tallinn Old Town", "UNESCO medieval walled town.", "Vanalinn, Tallinn, Estonia", 59.437, 24.7454, ["old_town", "historic_site"]],
      ["Toompea Castle", "Parliament on the limestone hill.", "Lossi plats 1a, Tallinn, Estonia", 59.4369, 24.7375, ["castle", "landmark"]],
      ["Alexander Nevsky Cathedral", "Russian Orthodox cathedral on Toompea.", "Lossi plats 10, Tallinn, Estonia", 59.4358, 24.7397, ["landmark", "historic_site"]],
      ["Kadriorg Palace", "Baroque palace built by Peter the Great.", "A. Weizenbergi 37, Tallinn, Estonia", 59.4389, 24.7911, ["castle", "museum"]],
    ]),
    tartu: city(58.378, 26.729, "Tartu", 12, [
      ["University of Tartu", "Estonia's oldest university founded in 1632.", "Ülikooli 18, Tartu, Estonia", 58.3814, 26.7219, ["historic_site", "landmark"]],
      ["Tartu Town Hall Square", "Colourful square with kissing students fountain.", "Raekoja plats, Tartu, Estonia", 58.378, 26.729, ["public_square", "landmark"]],
      ["Tartu Cathedral Ruins", "Ruins of the medieval cathedral on Toome Hill.", "Tartu, Estonia", 58.378, 26.729, ["historic_site", "viewpoint"]],
      ["AHHAA Science Centre", "Interactive science museum.", "Sadama 1, Tartu, Estonia", 58.378, 26.729, ["museum"]],
    ]),
    narva: city(59.3753, 28.1903, "Ida-Viru", 12, [
      ["Narva Castle", "Hermann Fortress facing Ivangorod across the river.", "Peterburi mnt. 2, Narva, Estonia", 59.3753, 28.1903, ["castle", "historic_site"]],
      ["Narva Bastions", "17th-century fortification network.", "Narva, Estonia", 59.3753, 28.1903, ["historic_site", "viewpoint"]],
      ["Narva Art Gallery", "Regional art museum.", "Narva, Estonia", 59.3753, 28.1903, ["museum"]],
      ["Narva River Promenade", "Walkway along the border river.", "Narva, Estonia", 59.3753, 28.1903, ["tourist_attraction", "viewpoint"]],
    ]),
    parnu: city(58.3859, 24.4971, "Pärnu", 12, [
      ["Pärnu Beach", "Sandy Baltic beach and resort.", "Pärnu Beach, Estonia", 58.3833, 24.5, ["tourist_attraction", "viewpoint"]],
      ["Pärnu Old Town", "Historic centre with red-roofed houses.", "Pärnu, Estonia", 58.3859, 24.4971, ["old_town", "historic_site"]],
      ["Pärnu Mud Baths", "Historic spa building.", "Ranna pst. 28, Pärnu, Estonia", 58.3859, 24.4971, ["historic_site", "landmark"]],
      ["Red Tower", "Medieval defensive tower.", "Pärnu, Estonia", 58.3859, 24.4971, ["historic_site", "landmark"]],
    ]),
    viljandi: city(58.3639, 25.59, "Viljandi", 12, [
      ["Viljandi Castle Ruins", "Ruined Teutonic Order castle above the lake.", "Viljandi, Estonia", 58.3639, 25.59, ["castle", "viewpoint"]],
      ["Viljandi Folk Music Festival Grounds", "Amphitheatre on the lake shore.", "Viljandi, Estonia", 58.3639, 25.59, ["tourist_attraction", "park"]],
      ["St. Paul's Church", "Art nouveau church in the centre.", "Viljandi, Estonia", 58.3639, 25.59, ["landmark", "historic_site"]],
      ["Viljandi Museum", "Regional history museum.", "Viljandi, Estonia", 58.3639, 25.59, ["museum"]],
    ]),
  },
  romania: {
    bucharest: city(44.4268, 26.1025, "Bucharest", 15, [
      ["Palace of the Parliament", "World's heaviest building and Ceaușescu's legacy.", "Strada Izvor 2-4, Bucharest, Romania", 44.4274, 26.0875, ["landmark", "historic_site"]],
      ["Old Town (Lipscani)", "Historic quarter with bars and churches.", "Lipscani, Bucharest, Romania", 44.4319, 26.1014, ["old_town", "historic_site"]],
      ["Romanian Athenaeum", "Neoclassical concert hall and city symbol.", "Strada Benjamin Franklin 1-3, Bucharest, Romania", 44.4414, 26.0972, ["landmark", "historic_site"]],
      ["Village Museum", "Open-air museum of traditional Romanian houses.", "Șoseaua Pavel Dimitrievici Kiseleff 28-30, Bucharest, Romania", 44.4714, 26.0764, ["museum", "park"]],
    ]),
    "cluj-napoca": city(46.7712, 23.6236, "Cluj", 12, [
      ["St. Michael's Church", "Gothic church on Union Square.", "Piața Unirii, Cluj-Napoca, Romania", 46.7712, 23.6236, ["landmark", "historic_site"]],
      ["Cluj-Napoca Botanical Garden", "University botanical garden.", "Cluj-Napoca, Romania", 46.7712, 23.6236, ["park", "museum"]],
      ["Banffy Palace", "Baroque palace housing the art museum.", "Piața Unirii 30, Cluj-Napoca, Romania", 46.7712, 23.6236, ["castle", "museum"]],
      ["Cetățuia Hill", "Fortress hill with panoramic views.", "Cluj-Napoca, Romania", 46.7712, 23.6236, ["viewpoint", "historic_site"]],
    ]),
    timisoara: city(45.7489, 21.2087, "Timiș", 12, [
      ["Union Square", "Baroque square where the 1989 revolution began.", "Piața Unirii, Timișoara, Romania", 45.7489, 21.2087, ["public_square", "historic_site"]],
      ["Orthodox Metropolitan Cathedral", "Neo-Moldavian cathedral on Victory Square.", "Timișoara, Romania", 45.7489, 21.2087, ["landmark", "historic_site"]],
      ["Huniade Castle", "Renaissance castle housing history museum.", "Timișoara, Romania", 45.7489, 21.2087, ["castle", "museum"]],
      ["Roses Park", "Park with roses and the floral clock.", "Timișoara, Romania", 45.7489, 21.2087, ["park"]],
    ]),
    iasi: city(47.1585, 27.6014, "Iași", 12, [
      ["Palace of Culture", "Neo-Gothic palace with four museums.", "Piața Palace of Culture, Iași, Romania", 47.1585, 27.6014, ["castle", "museum"]],
      ["Metropolitan Cathedral", "Largest Orthodox church in Romania.", "Iași, Romania", 47.1585, 27.6014, ["landmark", "historic_site"]],
      ["Golia Monastery", "17th-century monastery with bell tower views.", "Iași, Romania", 47.1585, 27.6014, ["historic_site", "viewpoint"]],
      ["Copou Park", "Park with Romania's oldest monument.", "Iași, Romania", 47.1585, 27.6014, ["park", "monument"]],
    ]),
    brasov: city(45.6579, 25.6012, "Brașov", 20, [
      ["Brașov Council Square", "Medieval square with colourful houses.", "Piața Sfatului, Brașov, Romania", 45.6411, 25.5886, ["public_square", "old_town"]],
      ["Black Church", "Gothic church and largest in Romania.", "Curtea Johannes Honterus 1, Brașov, Romania", 45.6411, 25.5886, ["landmark", "historic_site"]],
      ["Catherine's Gate", "Last remaining medieval gate of the city.", "Brașov, Romania", 45.6411, 25.5886, ["historic_site", "landmark"]],
      ["Bran Castle", "Medieval castle linked to the Dracula legend.", "Strada General Traian Moșoiu 24, Bran, Romania", 45.515, 25.3672, ["castle", "tourist_attraction"]],
    ]),
  },
  bulgaria: {
    sofia: city(42.6977, 23.3219, "Sofia", 15, [
      ["Alexander Nevsky Cathedral", "Bulgarian Orthodox cathedral with gold domes.", "pl. Alexander Nevsky, Sofia, Bulgaria", 42.6958, 23.3328, ["landmark", "historic_site"]],
      ["Saint Sofia Church", "6th-century church that gave the city its name.", "Sofia, Bulgaria", 42.6969, 23.3319, ["historic_site", "landmark"]],
      ["Boyana Church", "UNESCO medieval church with frescoes.", "Boyana, Sofia, Bulgaria", 42.645, 23.2667, ["historic_site", "landmark"]],
      ["Vitosha Mountain", "Mountain park above the capital.", "Vitosha, Sofia, Bulgaria", 42.5667, 23.2833, ["mountain", "park"]],
    ]),
    plovdiv: city(42.1354, 24.7453, "Plovdiv", 12, [
      ["Plovdiv Old Town", "Revival-era houses on cobbled hills.", "Old Town, Plovdiv, Bulgaria", 42.1494, 24.7514, ["old_town", "historic_site"]],
      ["Roman Theatre of Plovdiv", "Ancient amphitheatre still used for performances.", "Plovdiv, Bulgaria", 42.1472, 24.7511, ["historic_site", "tourist_attraction"]],
      ["Ancient Stadium of Philippopolis", "Roman stadium beneath the main street.", "Plovdiv, Bulgaria", 42.1494, 24.7514, ["historic_site", "monument"]],
      ["Nebet Tepe", "Hilltop fortress ruins with city views.", "Plovdiv, Bulgaria", 42.1494, 24.7514, ["viewpoint", "historic_site"]],
    ]),
    varna: city(43.2141, 27.9147, "Varna", 12, [
      ["Varna Archaeological Museum", "Home of the Gold of Varna treasure.", "Varna, Bulgaria", 43.2141, 27.9147, ["museum"]],
      ["Sea Garden", "Coastal park along the Black Sea.", "Sea Garden, Varna, Bulgaria", 43.2141, 27.9147, ["park", "tourist_attraction"]],
      ["Dormition of the Mother of God Cathedral", "Largest cathedral in Varna.", "Varna, Bulgaria", 43.2141, 27.9147, ["landmark", "historic_site"]],
      ["Roman Baths of Odessos", "Largest Roman baths in the Balkans.", "Varna, Bulgaria", 43.2141, 27.9147, ["historic_site", "tourist_attraction"]],
    ]),
    burgas: city(42.5048, 27.4626, "Burgas", 15, [
      ["Sea Garden Burgas", "Coastal park with flowers and sculptures.", "Burgas, Bulgaria", 42.5048, 27.4626, ["park", "tourist_attraction"]],
      ["Burgas Archaeological Museum", "Thracian and Greek antiquities.", "Burgas, Bulgaria", 42.5048, 27.4626, ["museum"]],
      ["St. Anastasia Island", "Historic island with monastery in the bay.", "St. Anastasia Island, Burgas, Bulgaria", 42.45, 27.5, ["historic_site", "tourist_attraction"]],
      ["Burgas Lakes", "Chain of coastal lakes and bird sanctuary.", "Burgas Lakes, Bulgaria", 42.5, 27.45, ["park", "tourist_attraction"]],
    ]),
    ruse: city(43.8564, 25.9708, "Ruse", 12, [
      ["Freedom Square", "Grand square with neoclassical buildings.", "Ruse, Bulgaria", 43.8564, 25.9708, ["public_square", "landmark"]],
      ["Ivanovo Rock Churches", "UNESCO medieval frescoes in cliff caves.", "Ivanovo, Bulgaria", 43.7167, 25.9667, ["historic_site", "viewpoint"]],
      ["Ruse Regional Historical Museum", "History museum in the former Battenberg Palace.", "Ruse, Bulgaria", 43.8564, 25.9708, ["museum", "castle"]],
      ["Danube River Promenade", "Riverside walk with views to Romania.", "Ruse, Bulgaria", 43.8564, 25.9708, ["tourist_attraction", "viewpoint"]],
    ]),
  },
};
