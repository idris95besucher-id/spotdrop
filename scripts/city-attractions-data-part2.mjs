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

export const REMAINING_ATTRACTIONS = {
  netherlands: {
    amsterdam: city(52.3676, 4.9041, "North Holland", 15, [
      ["Rijksmuseum", "Dutch Golden Age masters including Rembrandt and Vermeer.", "Museumstraat 1, 1071 XX Amsterdam, Netherlands", 52.36, 4.8852, ["museum"]],
      ["Anne Frank House", "Museum in the secret annex where Anne Frank hid.", "Westermarkt 20, 1016 DK Amsterdam, Netherlands", 52.3752, 4.884, ["museum", "historic_site"]],
      ["Van Gogh Museum", "World's largest collection of Van Gogh paintings.", "Museumplein 6, 1071 DJ Amsterdam, Netherlands", 52.3584, 4.8811, ["museum"]],
      ["Vondelpark", "Amsterdam's beloved central park.", "Vondelpark, 1071 AA Amsterdam, Netherlands", 52.3579, 4.8686, ["park"]],
    ]),
    rotterdam: city(51.9244, 4.4777, "South Holland", 15, [
      ["Erasmus Bridge", "Cable-stayed bridge nicknamed The Swan.", "Erasmusbrug, 3011 Rotterdam, Netherlands", 51.9091, 4.4862, ["bridge", "landmark"]],
      ["Markthal", "Horseshoe-shaped market hall with mural ceiling.", "Grotemarkt 1, 3011 PA Rotterdam, Netherlands", 51.9201, 4.4866, ["landmark", "tourist_attraction"]],
      ["Cube Houses", "Tilted cube dwellings designed by Piet Blom.", "Overblaak 70, 3011 MH Rotterdam, Netherlands", 51.9202, 4.4906, ["landmark", "tourist_attraction"]],
      ["Euromast", "Observation tower with panoramic harbour views.", "Parkhaven 20, 3016 GM Rotterdam, Netherlands", 51.9064, 4.4666, ["viewpoint", "landmark"]],
    ]),
    "the-hague": city(52.0705, 4.3007, "South Holland", 15, [
      ["Binnenhof", "Dutch parliament complex around a medieval courtyard.", "Binnenhof 8A, 2513 AA Den Haag, Netherlands", 52.0799, 4.3131, ["historic_site", "landmark"]],
      ["Mauritshuis", "Royal picture gallery with Vermeer's Girl with a Pearl Earring.", "Plein 29, 2511 CS Den Haag, Netherlands", 52.0804, 4.3142, ["museum"]],
      ["Peace Palace", "Home of the International Court of Justice.", "Carnegieplein 2, 2517 KJ Den Haag, Netherlands", 52.0866, 4.2955, ["landmark", "historic_site"]],
      ["Scheveningen Beach", "Seaside resort with pier and boulevard.", "Scheveningen, 2586 Den Haag, Netherlands", 52.1086, 4.2767, ["tourist_attraction", "viewpoint"]],
    ]),
    utrecht: city(52.0907, 5.1214, "Utrecht", 12, [
      ["Dom Tower", "Tallest church tower in the Netherlands.", "Domplein 21, 3512 JC Utrecht, Netherlands", 52.0907, 5.1214, ["landmark", "historic_site"]],
      ["Oudegracht", "Canal with wharf cellars and cafés below street level.", "Oudegracht, 3511 Utrecht, Netherlands", 52.091, 5.1195, ["old_town", "tourist_attraction"]],
      ["Museum Speelklok", "Museum of self-playing musical instruments.", "Steenweg 6, 3511 JP Utrecht, Netherlands", 52.0909, 5.1198, ["museum"]],
      ["Botanical Gardens Utrecht", "Historic university gardens.", "Budapestlaan 17, 3584 CD Utrecht, Netherlands", 52.0856, 5.1728, ["park", "museum"]],
    ]),
    eindhoven: city(51.4416, 5.4697, "North Brabant", 12, [
      ["Van Abbemuseum", "Modern and contemporary art museum.", "Bilderdijklaan 10, 5611 NH Eindhoven, Netherlands", 51.4339, 5.501, ["museum"]],
      ["Philips Museum", "History of the Philips company in the city.", "Emmasingel 31, 5611 AZ Eindhoven, Netherlands", 51.433, 5.4817, ["museum", "historic_site"]],
      ["St. Catherine's Church", "Neo-Gothic church in the city centre.", "Stratumseind 32A, 5611 ET Eindhoven, Netherlands", 51.4378, 5.4812, ["landmark", "historic_site"]],
      ["Strijp-S", "Creative district in former Philips factory halls.", "Torenallee 20, 5617 Eindhoven, Netherlands", 51.4495, 5.4547, ["tourist_attraction", "historic_site"]],
    ]),
  },
  belgium: {
    brussels: city(50.8503, 4.3517, "Brussels-Capital", 15, [
      ["Grand Place", "UNESCO gilded square at the heart of Brussels.", "Grand-Place, 1000 Bruxelles, Belgium", 50.8467, 4.3525, ["public_square", "landmark"]],
      ["Atomium", "Giant iron crystal model built for Expo 58.", "Pl. de l'Atomium 1, 1020 Bruxelles, Belgium", 50.895, 4.3414, ["landmark", "museum"]],
      ["Manneken Pis", "Bronze fountain statue and city mascot.", "Rue de l'Étuve 46, 1000 Bruxelles, Belgium", 50.845, 4.3499, ["monument", "landmark"]],
      ["Royal Palace of Brussels", "Official palace facing Brussels Park.", "Pl. des Palais, 1000 Bruxelles, Belgium", 50.8427, 4.3621, ["castle", "historic_site"]],
    ]),
    antwerp: city(51.2194, 4.4025, "Antwerp", 12, [
      ["Cathedral of Our Lady", "Gothic cathedral with Rubens altarpieces.", "Groenplaats 21, 2000 Antwerpen, Belgium", 51.2204, 4.4005, ["landmark", "historic_site"]],
      ["Antwerp Central Station", "Ornate railway cathedral.", "Koningin Astridplein 27, 2018 Antwerpen, Belgium", 51.2172, 4.4211, ["landmark", "historic_site"]],
      ["MAS Museum", "Museum about the city, port, and world.", "Hanzestedenplaats 1, 2000 Antwerpen, Belgium", 51.229, 4.4047, ["museum", "landmark"]],
      ["Rubenshuis", "Former home and studio of Peter Paul Rubens.", "Wapper 9-11, 2000 Antwerpen, Belgium", 51.2205, 4.4094, ["museum", "historic_site"]],
    ]),
    ghent: city(51.0543, 3.7174, "East Flanders", 12, [
      ["Gravensteen Castle", "Medieval castle in the city centre.", "Sint-Veerleplein 11, 9000 Gent, Belgium", 51.0571, 3.7208, ["castle", "historic_site"]],
      ["Saint Bavo's Cathedral", "Gothic cathedral with the Ghent Altarpiece.", "Sint-Baafsplein, 9000 Gent, Belgium", 51.0535, 3.7265, ["landmark", "historic_site"]],
      ["Korenlei & Graslei", "Historic quays along the Leie river.", "Graslei, 9000 Gent, Belgium", 51.0538, 3.7209, ["old_town", "tourist_attraction"]],
      ["Belfry of Ghent", "UNESCO bell tower overlooking the square.", "Botermarkt 1, 9000 Gent, Belgium", 51.0536, 3.7247, ["landmark", "monument"]],
    ]),
    bruges: city(51.2093, 3.2247, "West Flanders", 12, [
      ["Belfry of Bruges", "Medieval bell tower on Markt square.", "Markt 7, 8000 Brugge, Belgium", 51.2081, 3.2245, ["landmark", "monument"]],
      ["Basilica of the Holy Blood", "Romanesque chapel with relic of Christ's blood.", "Heilige Bloedstraat 13, 8000 Brugge, Belgium", 51.2083, 3.2267, ["historic_site", "landmark"]],
      ["Minnewater Park", "Lake of Love park at the city entrance.", "Minnewater, 8000 Brugge, Belgium", 51.2028, 3.2242, ["park", "tourist_attraction"]],
      ["Groeningemuseum", "Flemish Primitives including van Eyck and Memling.", "Dijver 12, 8000 Brugge, Belgium", 51.2056, 3.2268, ["museum"]],
    ]),
    liege: city(50.6326, 5.5797, "Liège", 12, [
      ["Palais des Princes-Évêques", "Former prince-bishops' palace on the Meuse.", "Place Saint-Lambert, 4000 Liège, Belgium", 50.6455, 5.5734, ["historic_site", "landmark"]],
      ["Montagne de Bueren", "374-step staircase to citadel views.", "Montagne de Bueren 33, 4000 Liège, Belgium", 50.6481, 5.5812, ["viewpoint", "historic_site"]],
      ["Curtius Museum", "Archaeology and decorative arts on the river.", "Féronstrée 136, 4000 Liège, Belgium", 50.648, 5.5847, ["museum"]],
      ["Parc de la Boverie", "Riverside park with Fine Arts museum.", "Parc de la Boverie, 4020 Liège, Belgium", 50.6383, 5.5792, ["park", "museum"]],
    ]),
  },
  austria: {
    vienna: city(48.2082, 16.3738, "Vienna", 18, [
      ["St. Stephen's Cathedral", "Gothic cathedral and heart of Vienna's historic center.", "Stephansplatz 3, 1010 Wien, Austria", 48.2085, 16.3731, ["landmark", "historic_site"]],
      ["Schönbrunn Palace", "Imperial summer residence with gardens and Gloriette.", "Schönbrunner Schloßstraße 47, 1130 Wien, Austria", 48.1858, 16.3127, ["castle", "park"]],
      ["Prater & Giant Ferris Wheel", "Historic amusement park and the Wiener Riesenrad.", "Riesenradplatz 1, 1020 Wien, Austria", 48.2167, 16.3958, ["park", "tourist_attraction"]],
      ["Belvedere Palace", "Baroque palace complex housing Klimt's The Kiss.", "Prinz-Eugen-Straße 27, 1030 Wien, Austria", 48.1916, 16.3807, ["castle", "museum"]],
    ]),
    graz: city(47.0707, 15.4395, "Styria", 12, [
      ["Schlossberg", "Hill with clock tower dominating Graz.", "Schlossberg, 8010 Graz, Austria", 47.074, 15.4378, ["viewpoint", "historic_site"]],
      ["Kunsthaus Graz", "Blob-shaped contemporary art museum.", "Lendkai 1, 8020 Graz, Austria", 47.0715, 15.4342, ["museum", "landmark"]],
      ["Eggenberg Palace", "Baroque palace with peacock gardens.", "Schloss Eggenberg, 8020 Graz, Austria", 47.0738, 15.3912, ["castle", "museum"]],
      ["Graz Old Town", "UNESCO Renaissance core with arcaded courtyards.", "Hauptplatz, 8010 Graz, Austria", 47.0707, 15.4395, ["old_town", "historic_site"]],
    ]),
    salzburg: city(47.8095, 13.055, "Salzburg", 15, [
      ["Hohensalzburg Fortress", "One of Europe's largest medieval castles.", "Mönchsberg 34, 5020 Salzburg, Austria", 47.7949, 13.0476, ["castle", "viewpoint"]],
      ["Mirabell Palace & Gardens", "Baroque gardens famous from The Sound of Music.", "Mirabellplatz, 5020 Salzburg, Austria", 47.8034, 13.0402, ["castle", "park"]],
      ["Mozart's Birthplace", "Museum in the house where Mozart was born.", "Getreidegasse 9, 5020 Salzburg, Austria", 47.8001, 13.0434, ["museum", "historic_site"]],
      ["Salzburg Cathedral", "Baroque cathedral on Domplatz.", "Domplatz 1a, 5020 Salzburg, Austria", 47.7979, 13.0466, ["landmark", "historic_site"]],
    ]),
    innsbruck: city(47.2692, 11.4041, "Tyrol", 15, [
      ["Golden Roof", "Ornate balcony covered in 2,657 gilded tiles.", "Herzog-Friedrich-Straße 15, 6020 Innsbruck, Austria", 47.2685, 11.3947, ["landmark", "historic_site"]],
      ["Nordkette Cable Car", "Cable car from city centre to alpine peaks.", "Rennweg 1, 6020 Innsbruck, Austria", 47.2718, 11.3952, ["mountain", "viewpoint"]],
      ["Hofburg Innsbruck", "Imperial palace of the Habsburgs.", "Rennweg 1, 6020 Innsbruck, Austria", 47.2688, 11.3949, ["castle", "museum"]],
      ["Bergisel Ski Jump", "Zaha Hadid-designed tower with city panorama.", "Bergiselweg 3, 6020 Innsbruck, Austria", 47.2517, 11.4012, ["landmark", "viewpoint"]],
    ]),
    linz: city(48.3069, 14.2858, "Upper Austria", 12, [
      ["Ars Electronica Center", "Museum of the future on the Danube.", "Ars-Electronica-Straße 1, 4040 Linz, Austria", 48.31, 14.2844, ["museum", "landmark"]],
      ["Linz Castle", "Castle museum above the old town.", "Schlossberg 1, 4020 Linz, Austria", 48.3056, 14.2792, ["castle", "museum"]],
      ["Hauptplatz Linz", "One of Austria's largest town squares.", "Hauptplatz, 4020 Linz, Austria", 48.3064, 14.2861, ["public_square", "landmark"]],
      ["Pöstlingberg", "Pilgrimage church with panoramic Danube views.", "Pöstlingberg, 4040 Linz, Austria", 48.3242, 14.2583, ["landmark", "viewpoint"]],
    ]),
  },
  sweden: {
    stockholm: city(59.3293, 18.0686, "Stockholm", 18, [
      ["Gamla Stan", "Medieval old town on Stadsholmen island.", "Gamla Stan, 111 29 Stockholm, Sweden", 59.3257, 18.0711, ["old_town", "historic_site"]],
      ["Vasa Museum", "Preserved 17th-century warship.", "Galärvarvsvägen 14, 115 21 Stockholm, Sweden", 59.328, 18.0914, ["museum", "historic_site"]],
      ["Royal Palace", "Official residence of the Swedish monarch.", "Slottsbacken 1, 111 30 Stockholm, Sweden", 59.3268, 18.0717, ["castle", "landmark"]],
      ["Skansen Open-Air Museum", "World's oldest open-air museum on Djurgården.", "Djurgårdsslätten 49-51, 115 21 Stockholm, Sweden", 59.3251, 18.1039, ["museum", "park"]],
    ]),
    gothenburg: city(57.7089, 11.9746, "Västra Götaland", 12, [
      ["Liseberg Amusement Park", "Scandinavia's leading amusement park.", "Örgrytevägen 5, 402 22 Göteborg, Sweden", 57.6958, 11.9927, ["park", "tourist_attraction"]],
      ["Universeum", "Science centre with rainforest and aquarium.", "Södra Vägen 50, 412 54 Göteborg, Sweden", 57.6828, 11.9888, ["museum"]],
      ["Haga District", "Wooden houses and cinnamon buns in a historic quarter.", "Haga Nygata, 413 01 Göteborg, Sweden", 57.6978, 11.9525, ["old_town", "historic_site"]],
      ["Gothenburg Museum of Art", "Nordic art including works by Munch.", "Götaplatsen 6, 412 56 Göteborg, Sweden", 57.6969, 11.9804, ["museum"]],
    ]),
    malmo: city(55.605, 13.0038, "Skåne", 12, [
      ["Turning Torso", "Twisting skyscraper landmark.", "Lilla Varvsgatan 14, 211 15 Malmö, Sweden", 55.6133, 12.9764, ["landmark"]],
      ["Malmö Castle", "Renaissance fortress housing museums.", "Malmöhusvägen 6, 201 24 Malmö, Sweden", 55.6048, 12.9878, ["castle", "museum"]],
      ["Stortorget", "Central square with town hall.", "Stortorget, 211 22 Malmö, Sweden", 55.6061, 13.0002, ["public_square", "landmark"]],
      ["Ribersborg Beach", "Popular city beach on the Öresund.", "Ribersborgsstranden, 211 18 Malmö, Sweden", 55.6033, 12.9667, ["park", "tourist_attraction"]],
    ]),
    uppsala: city(59.8586, 17.6389, "Uppsala", 12, [
      ["Uppsala Cathedral", "Scandinavia's largest cathedral.", "Domkyrkoplan 2, 753 10 Uppsala, Sweden", 59.8581, 17.6336, ["landmark", "historic_site"]],
      ["Gustavianum", "University museum with anatomical theatre.", "Akademigatan 3, 753 10 Uppsala, Sweden", 59.8578, 17.6315, ["museum", "historic_site"]],
      ["Uppsala Castle", "Renaissance castle above the city.", "Drottning Christinas väg 1A, 752 37 Uppsala, Sweden", 59.8569, 17.6356, ["castle", "historic_site"]],
      ["Botanical Garden", "Linnaeus garden and tropical greenhouse.", "Villavägen 8, 752 36 Uppsala, Sweden", 59.8522, 17.6292, ["park", "museum"]],
    ]),
    linkoping: city(58.4108, 15.6214, "Östergötland", 12, [
      ["Linköping Cathedral", "Gothic cathedral in the city centre.", "Kyrkogatan 1, 582 19 Linköping, Sweden", 58.4111, 15.6173, ["landmark", "historic_site"]],
      ["Old Linköping Open-Air Museum", "Historic wooden town quarter.", "Tunnbindaregatan 1, 582 46 Linköping, Sweden", 58.4036, 15.6217, ["museum", "old_town"]],
      ["Flygvapenmuseum", "Swedish Air Force museum.", "Carl Cederströms gata 2, 586 63 Linköping, Sweden", 58.4103, 15.5156, ["museum"]],
      ["Trädgårdsföreningen", "Victorian park with palm house.", "Sturegatan, 582 23 Linköping, Sweden", 58.4133, 15.625, ["park"]],
    ]),
  },
  norway: {
    oslo: city(59.9139, 10.7522, "Oslo", 18, [
      ["Vigeland Sculpture Park", "Gustav Vigeland's 200+ bronze and granite figures.", "Nobels gate 32, 0268 Oslo, Norway", 59.927, 10.7005, ["park", "monument"]],
      ["Oslo Opera House", "Marble-clad opera house you can walk on the roof.", "Kirsten Flagstads Plass 1, 0150 Oslo, Norway", 59.9075, 10.7527, ["landmark", "tourist_attraction"]],
      ["Viking Ship Museum", "Best-preserved Viking ships in the world.", "Huk Aveny 35, 0287 Oslo, Norway", 59.9045, 10.6845, ["museum", "historic_site"]],
      ["Akershus Fortress", "Medieval castle guarding the harbour.", "Akershusstranda 21, 0150 Oslo, Norway", 59.9076, 10.7366, ["castle", "historic_site"]],
    ]),
    bergen: city(60.3913, 5.3221, "Vestland", 15, [
      ["Bryggen", "UNESCO wooden wharf of the Hanseatic League.", "Bryggen, 5003 Bergen, Norway", 60.3975, 5.3242, ["historic_site", "old_town"]],
      ["Fløyen", "Mountain with funicular and panoramic views.", "Fløyen, 5014 Bergen, Norway", 60.396, 5.3285, ["mountain", "viewpoint"]],
      ["Fish Market", "Harbour market with seafood and local crafts.", "Torget, 5014 Bergen, Norway", 60.3945, 5.3258, ["public_square", "tourist_attraction"]],
      ["Troldhaugen", "Edvard Grieg's lakeside home and museum.", "Troldhaugvegen 65, 5232 Paradis, Norway", 60.3197, 5.3703, ["museum", "historic_site"]],
    ]),
    trondheim: city(63.4305, 10.3951, "Trøndelag", 12, [
      ["Nidaros Cathedral", "Gothic cathedral over St. Olav's grave.", "Kongsgårdsgata 2, 7013 Trondheim, Norway", 63.427, 10.3969, ["landmark", "historic_site"]],
      ["Bakklandet", "Colourful wooden houses across the Nidelva.", "Bakklandet, 7013 Trondheim, Norway", 63.4285, 10.4035, ["old_town", "historic_site"]],
      ["Kristiansten Fortress", "17th-century fortress with city views.", "Kristianstensbakken 60, 7014 Trondheim, Norway", 63.4267, 10.4128, ["castle", "viewpoint"]],
      ["Rockheim", "Norwegian pop and rock museum.", "Brattørkaia 14, 7010 Trondheim, Norway", 63.4356, 10.4017, ["museum"]],
    ]),
    stavanger: city(58.97, 5.7331, "Rogaland", 15, [
      ["Preikestolen (Pulpit Rock)", "Iconic cliff plateau above Lysefjord.", "Preikestolen, 4100 Jørpeland, Norway", 58.9869, 6.189, ["viewpoint", "mountain"]],
      ["Old Stavanger (Gamle Stavanger)", "Europe's best-preserved wooden house settlement.", "Øvre Strandgate, 4005 Stavanger, Norway", 58.9756, 5.7311, ["old_town", "historic_site"]],
      ["Stavanger Cathedral", "Norway's oldest cathedral.", "Haakon VIIs gate 2, 4005 Stavanger, Norway", 58.97, 5.7331, ["landmark", "historic_site"]],
      ["Norwegian Petroleum Museum", "Offshore oil industry museum on the harbour.", "Kjeringholmen 1A, 4006 Stavanger, Norway", 58.9739, 5.7322, ["museum"]],
    ]),
    tromso: city(69.6492, 18.9553, "Troms", 20, [
      ["Arctic Cathedral", "Modern triangular church evoking ice and snow.", "Hans Nilsens vei 41, 9020 Tromsdalen, Norway", 69.648, 18.9892, ["landmark", "historic_site"]],
      ["Fjellheisen Cable Car", "Cable car to Storsteinen mountain plateau.", "Sollivegen 12, 9020 Tromsdalen, Norway", 69.6492, 18.9553, ["viewpoint", "mountain"]],
      ["Polaria", "Arctic experience centre with aquarium.", "Hjalmar Johansens gate 12, 9296 Tromsø, Norway", 69.6497, 18.9572, ["museum"]],
      ["Tromsø Cathedral", "Wooden cathedral in the city centre.", "Storgata 25, 9008 Tromsø, Norway", 69.6489, 18.9551, ["landmark", "historic_site"]],
    ]),
  },
  denmark: {
    copenhagen: city(55.6761, 12.5683, "Capital Region", 15, [
      ["Nyhavn", "Colourful 17th-century waterfront canal.", "Nyhavn, 1051 København, Denmark", 55.6799, 12.5908, ["old_town", "tourist_attraction"]],
      ["Tivoli Gardens", "Historic amusement park in the city centre.", "Vesterbrogade 3, 1630 København, Denmark", 55.6737, 12.5681, ["park", "tourist_attraction"]],
      ["The Little Mermaid", "Bronze statue based on Andersen's fairy tale.", "Langelinie, 2100 København, Denmark", 55.6929, 12.5994, ["monument", "landmark"]],
      ["Rosenborg Castle", "Renaissance castle housing the Crown Jewels.", "Øster Voldgade 4A, 1350 København, Denmark", 55.6858, 12.5773, ["castle", "museum"]],
    ]),
    aarhus: city(56.1629, 10.2039, "Central Denmark", 12, [
      ["ARoS Aarhus Art Museum", "Rainbow panorama walkway on the roof.", "Aros Allé 2, 8000 Aarhus, Denmark", 56.1539, 10.1996, ["museum", "landmark"]],
      ["Den Gamle By", "Open-air museum of Danish town history.", "Viborgvej 47, 8000 Aarhus, Denmark", 56.1592, 10.191, ["museum", "old_town"]],
      ["Aarhus Cathedral", "Longest church in Denmark.", "Domkirkepladsen 2, 8000 Aarhus, Denmark", 56.1571, 10.2105, ["landmark", "historic_site"]],
      ["Moesgaard Museum", "Archaeology museum in a sloping landmark building.", "Moesgård Allé 15, 8270 Højbjerg, Denmark", 56.0889, 10.2222, ["museum"]],
    ]),
    odense: city(55.4038, 10.4024, "Southern Denmark", 12, [
      ["Hans Christian Andersen Museum", "Museum dedicated to Denmark's fairy-tale writer.", "Bangs Boder 29, 5000 Odense, Denmark", 55.3983, 10.3906, ["museum", "historic_site"]],
      ["Odense Cathedral", "Gothic cathedral with King Canute's shrine.", "Klosterbakken 2, 5000 Odense, Denmark", 55.3961, 10.3887, ["landmark", "historic_site"]],
      ["Funen Village", "Open-air museum of rural Funen.", "Sejerskovvej 20, 5260 Odense, Denmark", 55.3756, 10.4289, ["museum", "historic_site"]],
      ["Brandts", "Cultural centre in a former textile factory.", "Algade 55, 5000 Odense, Denmark", 55.3967, 10.3833, ["museum", "tourist_attraction"]],
    ]),
    aalborg: city(57.0488, 9.9217, "North Denmark", 12, [
      ["Aalborg Castle (Aalborghus)", "Half-timbered castle by the Limfjord.", "Slotspladsen 1, 9000 Aalborg, Denmark", 57.048, 9.9186, ["castle", "historic_site"]],
      ["Utzon Center", "Architecture centre by Jørn Utzon.", "Slotspladsen 4, 9000 Aalborg, Denmark", 57.0478, 9.9192, ["museum", "landmark"]],
      ["Budolfi Church", "Cathedral of Aalborg.", "Gammel Kirkevej 2, 9000 Aalborg, Denmark", 57.048, 9.9195, ["landmark", "historic_site"]],
      ["KUNSTEN Museum of Modern Art", "Modern art in a Alvar Aalto building.", "Kong Christians Alle 50, 9000 Aalborg, Denmark", 57.0422, 9.9144, ["museum"]],
    ]),
    esbjerg: city(55.4668, 8.4517, "Southern Denmark", 12, [
      ["Men at Sea", "Giant bronze sculpture on the beach.", "Sædding Strandvej 1, 6710 Esbjerg, Denmark", 55.4894, 8.4069, ["monument", "landmark"]],
      ["Esbjerg Art Museum", "Contemporary Danish art collection.", "Havnegade 2, 6700 Esbjerg, Denmark", 55.4678, 8.4522, ["museum"]],
      ["Fisheries and Maritime Museum", "Seafaring heritage on the west coast.", "Tarphagevej 2, 6710 Esbjerg, Denmark", 55.4892, 8.4133, ["museum"]],
      ["Esbjerg Water Tower", "Landmark tower with city views.", "Søndre Kajgade 2, 6700 Esbjerg, Denmark", 55.4667, 8.4511, ["landmark", "viewpoint"]],
    ]),
  },
  finland: {
    helsinki: city(60.1699, 24.9384, "Uusimaa", 15, [
      ["Helsinki Cathedral", "Neoclassical white cathedral on Senate Square.", "Unioninkatu 29, 00170 Helsinki, Finland", 60.1704, 24.9524, ["landmark", "historic_site"]],
      ["Suomenlinna", "Sea fortress UNESCO site on islands.", "Suomenlinna, 00190 Helsinki, Finland", 60.1458, 24.9881, ["castle", "historic_site"]],
      ["Temppeliaukio Church", "Church carved into solid rock.", "Lutherinkatu 3, 00100 Helsinki, Finland", 60.173, 24.8254, ["landmark", "historic_site"]],
      ["Market Square", "Harbour market with ferries to Suomenlinna.", "Eteläranta, 00130 Helsinki, Finland", 60.1672, 24.9536, ["public_square", "tourist_attraction"]],
    ]),
    espoo: city(60.2055, 24.6559, "Uusimaa", 12, [
      ["Espoo Cathedral", "Medieval stone church in Espoo centre.", "Kirkkokatu 1, 02770 Espoo, Finland", 60.205, 24.655, ["landmark", "historic_site"]],
      ["EMMA Espoo Museum of Modern Art", "Modern art in the WeeGee exhibition centre.", "Ahertajantie 5, 02100 Espoo, Finland", 60.2089, 24.7297, ["museum"]],
      ["Nuuksio National Park", "Forest and lake wilderness at Helsinki's edge.", "Nuuksio, 02820 Espoo, Finland", 60.3078, 24.5111, ["park"]],
      ["Serena Water Park", "Indoor tropical water park.", "Tornimäentie 10, 02970 Espoo, Finland", 60.2567, 24.7389, ["tourist_attraction"]],
    ]),
    tampere: city(61.4978, 23.761, "Pirkanmaa", 12, [
      ["Näsinneula Tower", "Observation tower and revolving restaurant.", "Laiturikatu 1, 33230 Tampere, Finland", 61.5051, 23.7422, ["viewpoint", "landmark"]],
      ["Moomin Museum", "World's only Moomin art museum.", "Hämeenpuisto 20, 33210 Tampere, Finland", 61.4989, 23.7617, ["museum"]],
      ["Tampere Cathedral", "National Romantic church with frescoes.", "Tuomiokirkonkatu 11, 33100 Tampere, Finland", 61.5022, 23.7694, ["landmark", "historic_site"]],
      ["Pyynikki Observation Tower", "Café and views over lakes and forests.", "Näkötornintie 20, 33230 Tampere, Finland", 61.4967, 23.7311, ["viewpoint", "park"]],
    ]),
    turku: city(60.4518, 22.2666, "Southwest Finland", 12, [
      ["Turku Castle", "Medieval castle on the Aura river.", "Linnankatu 80, 20100 Turku, Finland", 60.435, 22.2286, ["castle", "museum"]],
      ["Turku Cathedral", "Mother church of the Evangelical Lutheran Church of Finland.", "Tuomiokirkonkatu 1, 20500 Turku, Finland", 60.4513, 22.2689, ["landmark", "historic_site"]],
      ["Aboa Vetus & Ars Nova", "Medieval archaeology and contemporary art museum.", "Itäinen Rantakatu 4-6, 20500 Turku, Finland", 60.4511, 22.2661, ["museum", "historic_site"]],
      ["Ruissalo Island", "Nature island with botanical garden.", "Ruissalo, 20100 Turku, Finland", 60.4333, 22.1667, ["park", "tourist_attraction"]],
    ]),
    oulu: city(65.0121, 25.4651, "North Ostrobothnia", 12, [
      ["Oulu Cathedral", "Neoclassical cathedral in the market square.", "Kirkkokatu 3A, 90100 Oulu, Finland", 65.0139, 25.4656, ["landmark", "historic_site"]],
      ["Tietomaa Science Centre", "Science museum in a former brewery.", "Näkötornintie 1, 90230 Oulu, Finland", 65.0117, 25.4711, ["museum"]],
      ["Hupisaaret Park", "Island park at the mouth of the Oulu river.", "Hupisaaret, 90100 Oulu, Finland", 65.0189, 25.4722, ["park"]],
      ["Oulu Castle Ruins", "Remains of the 16th-century castle.", "Linnansaari 1, 90100 Oulu, Finland", 65.0183, 25.4717, ["historic_site", "castle"]],
    ]),
  },
  poland: {
    warsaw: city(52.2297, 21.0122, "Masovian", 18, [
      ["Old Town Market Place", "Rebuilt UNESCO old town square.", "Rynek Starego Miasta, 00-272 Warszawa, Poland", 52.2497, 21.0122, ["old_town", "historic_site"]],
      ["Royal Castle", "Reconstructed royal residence on Castle Square.", "pl. Zamkowy 4, 00-277 Warszawa, Poland", 52.248, 21.0144, ["castle", "museum"]],
      ["Palace of Culture and Science", "Stalin-era skyscraper and city symbol.", "plac Defilad 1, 00-901 Warszawa, Poland", 52.2319, 21.0067, ["landmark", "viewpoint"]],
      ["Łazienki Park", "Royal baths park with Chopin monument.", "Agrykola 1, 00-460 Warszawa, Poland", 52.215, 21.035, ["park", "historic_site"]],
    ]),
    krakow: city(50.0647, 19.945, "Lesser Poland", 15, [
      ["Wawel Castle", "Royal castle on the hill above the Vistula.", "Wawel 5, 31-001 Kraków, Poland", 50.0547, 19.9354, ["castle", "historic_site"]],
      ["Main Market Square", "Europe's largest medieval town square.", "Rynek Główny, 31-042 Kraków, Poland", 50.0617, 19.9373, ["public_square", "landmark"]],
      ["St. Mary's Basilica", "Gothic church with wooden altarpiece.", "plac Mariacki 5, 31-042 Kraków, Poland", 50.0617, 19.9394, ["landmark", "historic_site"]],
      ["Kazimierz District", "Historic Jewish quarter south of the old town.", "Kazimierz, 31-055 Kraków, Poland", 50.0517, 19.9444, ["old_town", "historic_site"]],
    ]),
    wroclaw: city(51.1079, 17.0385, "Lower Silesian", 12, [
      ["Market Square (Rynek)", "Colourful Gothic and Baroque townhouses.", "Rynek, 50-101 Wrocław, Poland", 51.1095, 17.0321, ["public_square", "landmark"]],
      ["Cathedral Island (Ostrów Tumski)", "Oldest part of Wrocław on the Odra.", "Ostrów Tumski, 50-266 Wrocław, Poland", 51.1144, 17.0467, ["historic_site", "old_town"]],
      ["Centennial Hall", "UNESCO early modernist exhibition hall.", "Wystawowa 1, 51-618 Wrocław, Poland", 51.1069, 17.0772, ["landmark", "historic_site"]],
      ["Wrocław Dwarfs", "Hundreds of bronze gnome statues citywide.", "Świdnicka 8, 50-068 Wrocław, Poland", 51.1089, 17.0328, ["monument", "tourist_attraction"]],
    ]),
    gdansk: city(54.352, 18.6466, "Pomeranian", 12, [
      ["Long Market (Długi Targ)", "Historic merchant street with Neptune Fountain.", "Długi Targ, 80-828 Gdańsk, Poland", 54.3485, 18.6532, ["old_town", "public_square"]],
      ["St. Mary's Church", "One of the world's largest brick churches.", "Podkramarska 5, 80-834 Gdańsk, Poland", 54.3497, 18.6533, ["landmark", "historic_site"]],
      ["Westerplatte", "Peninsula where WWII began in 1939.", "Westerplatte, 80-001 Gdańsk, Poland", 54.4069, 18.6783, ["monument", "historic_site"]],
      ["European Solidarity Centre", "Museum of the Solidarity movement.", "plac Solidarności 1, 80-863 Gdańsk, Poland", 54.3614, 18.6494, ["museum", "historic_site"]],
    ]),
    poznan: city(52.4064, 16.9252, "Greater Poland", 12, [
      ["Old Market Square", "Renaissance town hall with mechanical goats.", "Stary Rynek, 61-772 Poznań, Poland", 52.4083, 16.9342, ["public_square", "landmark"]],
      ["Imperial Castle", "Wilhelm II's last castle now a cultural centre.", "Św. Marcin 80/82, 61-809 Poznań, Poland", 52.4081, 16.9186, ["castle", "museum"]],
      ["Cathedral Island (Ostrów Tumski)", "Birthplace of Poland with cathedral.", "Ostrów Tumski, 61-108 Poznań, Poland", 52.4114, 16.9483, ["historic_site", "landmark"]],
      ["Croissant Museum", "Living museum of St. Martin's croissants.", "Klasztorna 23, 61-779 Poznań, Poland", 52.4089, 16.9339, ["museum", "historic_site"]],
    ]),
  },
  "czech-republic": {
    prague: city(50.0755, 14.4378, "Prague", 15, [
      ["Prague Castle", "Largest ancient castle complex in the world.", "Hradčany, 119 08 Praha 1, Czech Republic", 50.091, 14.4016, ["castle", "landmark"]],
      ["Charles Bridge", "Gothic stone bridge with baroque statues.", "Karlův most, 110 00 Praha 1, Czech Republic", 50.0865, 14.4114, ["bridge", "landmark"]],
      ["Old Town Square", "Astronomical Clock and Týn Church.", "Staroměstské náměstí, 110 00 Praha 1, Czech Republic", 50.0875, 14.4213, ["public_square", "historic_site"]],
      ["St. Vitus Cathedral", "Gothic cathedral within Prague Castle.", "III. nádvoří 48/2, 119 01 Praha 1, Czech Republic", 50.0909, 14.4005, ["landmark", "historic_site"]],
    ]),
    brno: city(49.1951, 16.6068, "South Moravian", 12, [
      ["Špilberk Castle", "Fortress and prison dominating Brno.", "Špilberk 210/1, 602 00 Brno, Czech Republic", 49.1944, 16.5992, ["castle", "museum"]],
      ["Cathedral of St. Peter and Paul", "Twin-spired cathedral on Petrov hill.", "Petrov 9, 602 00 Brno, Czech Republic", 49.1911, 16.6075, ["landmark", "historic_site"]],
      ["Villa Tugendhat", "UNESCO modernist house by Mies van der Rohe.", "Černopolní 45, 613 00 Brno, Czech Republic", 49.2072, 16.6161, ["historic_site", "museum"]],
      ["Freedom Square", "Central square with plague column.", "náměstí Svobody, 602 00 Brno, Czech Republic", 49.1951, 16.6068, ["public_square", "landmark"]],
    ]),
    ostrava: city(49.8209, 18.2625, "Moravian-Silesian", 12, [
      ["Dolní Vítkovice", "Former ironworks turned cultural district.", "Výstaviště 81, 703 00 Ostrava, Czech Republic", 49.8203, 18.2831, ["historic_site", "museum"]],
      ["New City Hall Tower", "Viewing tower over the city.", "Prokešovo náměstí 1803/8, 729 82 Ostrava, Czech Republic", 49.8209, 18.2625, ["viewpoint", "landmark"]],
      ["Silesian Ostrava Castle", "Renaissance castle in the city centre.", "Hradní 1, 702 00 Ostrava, Czech Republic", 49.8344, 18.2917, ["castle", "museum"]],
      ["Landek Park Mining Museum", "Mining heritage museum.", "Pod Landekem 64, 725 29 Ostrava, Czech Republic", 49.8667, 18.2833, ["museum", "historic_site"]],
    ]),
    plzen: city(49.7384, 13.3736, "Plzeň", 12, [
      ["St. Bartholomew's Cathedral", "Gothic cathedral with tallest church tower in Czechia.", "náměstí Republiky, 301 00 Plzeň, Czech Republic", 49.7475, 13.3775, ["landmark", "historic_site"]],
      ["Pilsner Urquell Brewery", "Birthplace of pilsner lager with brewery tours.", "U Prazdroje 7, 304 97 Plzeň, Czech Republic", 49.7475, 13.3875, ["museum", "historic_site"]],
      ["Great Synagogue", "Second largest synagogue in Europe.", "Sady Pětatřicátníků 11, 301 00 Plzeň, Czech Republic", 49.7444, 13.375, ["historic_site", "landmark"]],
      ["Techmania Science Centre", "Interactive science museum.", "U Planetária 1, 301 00 Plzeň, Czech Republic", 49.7389, 13.3569, ["museum"]],
    ]),
    olomouc: city(49.5938, 17.2509, "Olomouc", 12, [
      ["Holy Trinity Column", "UNESCO baroque plague column on the square.", "Horní náměstí, 779 00 Olomouc, Czech Republic", 49.5938, 17.2509, ["monument", "landmark"]],
      ["Olomouc Astronomical Clock", "Socialist-realist clock on the town hall.", "Horní náměstí, 779 00 Olomouc, Czech Republic", 49.5939, 17.2508, ["landmark", "historic_site"]],
      ["St. Wenceslas Cathedral", "Gothic cathedral on Wenceslas Hill.", "Václavské náměstí, 779 00 Olomouc, Czech Republic", 49.5961, 17.2594, ["landmark", "historic_site"]],
      ["Archbishop's Palace", "Baroque palace and gardens.", "Wurmova 1, 779 00 Olomouc, Czech Republic", 49.5933, 17.2567, ["castle", "historic_site"]],
    ]),
  },
  hungary: {
    budapest: city(47.4979, 19.0402, "Budapest", 15, [
      ["Parliament Building", "Neo-Gothic parliament on the Danube.", "Kossuth Lajos tér 1-3, 1055 Budapest, Hungary", 47.507, 19.0457, ["landmark", "historic_site"]],
      ["Buda Castle", "Royal palace complex on Castle Hill.", "Szent György tér 2, 1014 Budapest, Hungary", 47.496, 19.0398, ["castle", "museum"]],
      ["Fisherman's Bastion", "Neo-Romanesque terrace with panoramic views.", "Szentháromság tér, 1014 Budapest, Hungary", 47.5029, 19.0344, ["viewpoint", "historic_site"]],
      ["Széchenyi Thermal Bath", "Grand thermal baths in City Park.", "Állatkerti krt. 9-11, 1146 Budapest, Hungary", 47.5189, 19.0819, ["tourist_attraction", "historic_site"]],
    ]),
    debrecen: city(47.5316, 21.6273, "Hajdú-Bihar", 12, [
      ["Great Reformed Church", "Largest Protestant church in Hungary.", "Kossuth tér, 4026 Debrecen, Hungary", 47.5316, 21.6273, ["landmark", "historic_site"]],
      ["Déri Museum", "Art and archaeology museum.", "Déri tér 1, 4026 Debrecen, Hungary", 47.5322, 21.6256, ["museum"]],
      ["Nagyerdő Park", "Large forest park with zoo and stadium.", "Nagyerdő, 4032 Debrecen, Hungary", 47.5533, 21.6333, ["park"]],
      ["Debrecen Flower Carnival", "Annual floral parade route through the centre.", "Kossuth tér, 4026 Debrecen, Hungary", 47.5316, 21.6273, ["public_square", "tourist_attraction"]],
    ]),
    szeged: city(46.253, 20.1414, "Csongrád-Csanád", 12, [
      ["Votive Church of Szeged", "Twin-towered cathedral on Dóm Square.", "Dóm tér 15, 6720 Szeged, Hungary", 46.253, 20.1486, ["landmark", "historic_site"]],
      ["Szeged Open-Air Festival", "Dóm Square theatre venue.", "Dóm tér, 6720 Szeged, Hungary", 46.253, 20.1486, ["historic_site", "tourist_attraction"]],
      ["Móra Ferenc Museum", "Regional history and art museum.", "Roosevelt tér 1-3, 6720 Szeged, Hungary", 46.2533, 20.1511, ["museum"]],
      ["Szeged Synagogue", "Art Nouveau synagogue.", "Jósika u. 10, 6722 Szeged, Hungary", 46.2556, 20.1456, ["historic_site", "landmark"]],
    ]),
    miskolc: city(48.1034, 20.7784, "Borsod-Abaúj-Zemplén", 12, [
      ["Diósgyőr Castle", "Medieval castle ruins.", "Vár u. 24, 3534 Miskolc, Hungary", 48.0989, 20.6856, ["castle", "historic_site"]],
      ["Cave Bath of Miskolctapolca", "Thermal baths in natural cave.", "Pazár István sétány 1, 3519 Miskolc, Hungary", 48.0611, 20.7333, ["tourist_attraction", "historic_site"]],
      ["Avas Church", "Gothic church with panoramic bell tower.", "Szent István u. 11, 3530 Miskolc, Hungary", 48.1033, 20.7783, ["landmark", "viewpoint"]],
      ["Ottó Herman Museum", "Natural history and art museum.", "Görgey Artúr tér 28, 3525 Miskolc, Hungary", 48.1034, 20.7784, ["museum"]],
    ]),
    pecs: city(46.0727, 18.2323, "Baranya", 12, [
      ["Early Christian Necropolis", "UNESCO Roman tombs under the city.", "Szent István tér 12, 7621 Pécs, Hungary", 46.0756, 18.2289, ["historic_site", "museum"]],
      ["Pécs Cathedral", "Romanesque cathedral on Cathedral Square.", "Szent István tér 23, 7621 Pécs, Hungary", 46.0756, 18.2289, ["landmark", "historic_site"]],
      ["Zsolnay Cultural Quarter", "Art nouveau ceramics heritage site.", "Károly u. 2, 7626 Pécs, Hungary", 46.0689, 18.2417, ["museum", "historic_site"]],
      ["Mosque of Pasha Qasim", "Ottoman mosque converted to church.", "Széchenyi tér 2, 7621 Pécs, Hungary", 46.075, 18.2283, ["historic_site", "landmark"]],
    ]),
  },
};
