/** @typedef {[string, string, string, number, number, string[]]} PlaceTuple */

function city(lat, lng, region, radius, places) {
  return {
    coords: { lat, lng, region, searchRadiusKm: radius },
    places: places.map(([name, description, address, placeLat, placeLng, categories], index) => ({
      rank: index + 1, name, description, address, lat: placeLat, lng: placeLng, categories,
    })),
  };
}

export const REMAINING_ATTRACTIONS_PART6 = {
  cyprus: {
    nicosia: city(35.1856, 33.3823, "Nicosia", 12, [
      ["Ledra Street Crossing", "Pedestrian crossing through the divided city.", "Ledra Street, Nicosia, Cyprus", 35.175, 33.3619, ["historic_site", "tourist_attraction"]],
      ["Cyprus Museum", "Largest archaeological museum on the island.", "Nicosia, Cyprus", 35.1711, 33.3619, ["museum"]],
      ["Selimiye Mosque", "Gothic cathedral converted to mosque.", "Nicosia, Cyprus", 35.1756, 33.3642, ["landmark", "historic_site"]],
      ["Famagusta Gate", "Venetian gate in the old city walls.", "Nicosia, Cyprus", 35.175, 33.3789, ["historic_site", "monument"]],
    ]),
    limassol: city(34.6786, 33.0417, "Limassol", 15, [
      ["Limassol Castle", "Medieval castle housing the medieval museum.", "Limassol, Cyprus", 34.6722, 33.0431, ["castle", "museum"]],
      ["Kourion Ancient City", "Greco-Roman ruins with cliffside theatre.", "Kourion, Limassol, Cyprus", 34.6647, 32.8847, ["historic_site", "viewpoint"]],
      ["Limassol Marina", "Modern marina and promenade.", "Limassol, Cyprus", 34.6786, 33.0417, ["tourist_attraction", "viewpoint"]],
      ["Amathus Archaeological Site", "Ancient city-kingdom ruins.", "Amathus, Limassol, Cyprus", 34.7167, 33.3, ["historic_site", "tourist_attraction"]],
    ]),
    larnaca: city(34.9229, 33.6233, "Larnaca", 15, [
      ["Church of Saint Lazarus", "9th-century church over the saint's tomb.", "Larnaca, Cyprus", 34.9119, 33.6353, ["landmark", "historic_site"]],
      ["Larnaca Salt Lake", "Winter home of flamingos near the airport.", "Larnaca Salt Lake, Cyprus", 34.9, 33.6167, ["lake", "park"]],
      ["Hala Sultan Tekke", "Important Muslim shrine on the salt lake.", "Larnaca, Cyprus", 34.8833, 33.6167, ["historic_site", "landmark"]],
      ["Finikoudes Beach", "Palm-lined city beach and promenade.", "Finikoudes, Larnaca, Cyprus", 34.9167, 33.6333, ["tourist_attraction", "viewpoint"]],
    ]),
    paphos: city(34.772, 32.4297, "Paphos", 15, [
      ["Paphos Archaeological Park", "UNESCO Roman mosaics and ancient ruins.", "Paphos, Cyprus", 34.7558, 32.4067, ["historic_site", "museum"]],
      ["Tombs of the Kings", "Underground tombs carved in rock.", "Paphos, Cyprus", 34.775, 32.4067, ["historic_site", "tourist_attraction"]],
      ["Paphos Castle", "Harbour fortress.", "Paphos, Cyprus", 34.7539, 32.4075, ["castle", "landmark"]],
      ["Aphrodite's Rock", "Birthplace myth of Aphrodite on the coast.", "Petra tou Romiou, Paphos, Cyprus", 34.6647, 32.6267, ["monument", "viewpoint"]],
    ]),
    famagusta: city(35.1253, 33.946, "Famagusta", 12, [
      ["Othello Castle", "Venetian fortress linked to Shakespeare.", "Famagusta, Cyprus", 35.1253, 33.946, ["castle", "historic_site"]],
      ["Lala Mustafa Pasha Mosque", "Gothic cathedral converted to mosque.", "Famagusta, Cyprus", 35.1253, 33.946, ["landmark", "historic_site"]],
      ["Varosha", "Abandoned resort district.", "Varosha, Famagusta, Cyprus", 35.1167, 33.95, ["historic_site", "tourist_attraction"]],
      ["Salamis Ancient City", "Extensive Roman ruins north of Famagusta.", "Salamis, Cyprus", 35.1833, 33.9, ["historic_site", "museum"]],
    ]),
  },
  malta: {
    valletta: city(35.8989, 14.5146, "Valletta", 8, [
      ["St. John's Co-Cathedral", "Baroque cathedral with Caravaggio masterpiece.", "Valletta, Malta", 35.8978, 14.5125, ["landmark", "historic_site"]],
      ["Upper Barrakka Gardens", "Hilltop gardens with Grand Harbour views.", "Valletta, Malta", 35.8967, 14.5122, ["park", "viewpoint"]],
      ["Grand Master's Palace", "Historic palace of the Knights of Malta.", "Valletta, Malta", 35.8989, 14.5146, ["castle", "museum"]],
      ["Fort St. Elmo", "Fortress at the tip of the peninsula.", "Valletta, Malta", 35.9028, 14.5186, ["castle", "historic_site"]],
    ]),
    birkirkara: city(35.8972, 14.4611, "Birkirkara", 8, [
      ["St. Helen's Basilica", "Baroque basilica in the town centre.", "Birkirkara, Malta", 35.8972, 14.4611, ["landmark", "historic_site"]],
      ["Wignacourt Aqueduct", "17th-century aqueduct arches.", "Birkirkara, Malta", 35.8972, 14.4611, ["historic_site", "monument"]],
      ["Ta' Ganu Windmill", "Restored windmill museum.", "Birkirkara, Malta", 35.8972, 14.4611, ["museum", "historic_site"]],
      ["Birkirkara Parish Museum", "Local religious heritage museum.", "Birkirkara, Malta", 35.8972, 14.4611, ["museum"]],
    ]),
    mosta: city(35.9097, 14.4261, "Mosta", 8, [
      ["Rotunda of Mosta", "Dome modelled on the Pantheon.", "Mosta, Malta", 35.9097, 14.4261, ["landmark", "historic_site"]],
      ["Mosta World War II Shelter", "Underground shelter museum.", "Mosta, Malta", 35.9097, 14.4261, ["museum", "historic_site"]],
      ["Ta' Qali National Park", "Park with crafts village.", "Ta' Qali, Malta", 35.9, 14.4167, ["park", "tourist_attraction"]],
      ["Mosta Gardens", "Gardens around the rotunda.", "Mosta, Malta", 35.9097, 14.4261, ["park"]],
    ]),
    sliema: city(35.9125, 14.5019, "Sliema", 8, [
      ["Sliema Promenade", "Seafront walk with Valletta views.", "Sliema, Malta", 35.9125, 14.5019, ["tourist_attraction", "viewpoint"]],
      ["Tigné Point", "Regenerated peninsula with architecture.", "Sliema, Malta", 35.9125, 14.5019, ["landmark", "tourist_attraction"]],
      ["Fort Tigné", "Restored fort at the peninsula tip.", "Sliema, Malta", 35.9125, 14.5019, ["castle", "historic_site"]],
      ["St. Julian's Bay", "Neighbouring bay with nightlife and views.", "St. Julian's, Malta", 35.9167, 14.4917, ["tourist_attraction", "viewpoint"]],
    ]),
    "st-julians": city(35.9167, 14.4917, "St. Julian's", 8, [
      ["Spinola Bay", "Picturesque bay with fishing boats.", "St. Julian's, Malta", 35.9167, 14.4917, ["tourist_attraction", "viewpoint"]],
      ["Love Monument", "Sculpture on the Spinola Bay promenade.", "St. Julian's, Malta", 35.9167, 14.4917, ["monument", "landmark"]],
      ["Balluta Bay", "Art nouveau bay with sea views.", "St. Julian's, Malta", 35.9167, 14.4917, ["viewpoint", "tourist_attraction"]],
      ["Portomaso Marina", "Luxury marina and tower.", "St. Julian's, Malta", 35.9167, 14.4917, ["tourist_attraction", "landmark"]],
    ]),
  },
  iceland: {
    reykjavik: city(64.1466, -21.9426, "Capital Region", 25, [
      ["Hallgrímskirkja", "Lutheran church with tower views over the city.", "Hallgrímstorg 101, Reykjavík, Iceland", 64.142, -21.9267, ["landmark", "viewpoint"]],
      ["Harpa Concert Hall", "Glass honeycomb concert hall on the harbour.", "Austurbakki 2, Reykjavík, Iceland", 64.1503, -21.9326, ["landmark", "tourist_attraction"]],
      ["Sun Voyager", "Steel sculpture on the waterfront.", "Sæbraut, Reykjavík, Iceland", 64.1478, -21.9228, ["monument", "landmark"]],
      ["National Museum of Iceland", "Icelandic history from settlement to present.", "Suðurgata 41, Reykjavík, Iceland", 64.1419, -21.9494, ["museum"]],
    ]),
    akureyri: city(65.6835, -18.0878, "Akureyri", 20, [
      ["Akureyri Church", "Lutheran church overlooking the fjord.", "Akureyri, Iceland", 65.6835, -18.0878, ["landmark", "viewpoint"]],
      ["Botanical Garden", "Northernmost botanical garden in the world.", "Akureyri, Iceland", 65.6835, -18.0878, ["park", "museum"]],
      ["Akureyri Art Museum", "Contemporary art in the north.", "Akureyri, Iceland", 65.6835, -18.0878, ["museum"]],
      ["Eyjarfjörður", "Fjord setting of Iceland's northern capital.", "Akureyri, Iceland", 65.6835, -18.0878, ["viewpoint", "tourist_attraction"]],
    ]),
    keflavik: city(64.0014, -22.5625, "Reykjanes", 20, [
      ["Bridge Between Continents", "Walk between the Eurasian and North American plates.", "Reykjanes, Iceland", 63.8683, -22.6756, ["monument", "tourist_attraction"]],
      ["Gunnuhver Hot Springs", "Boiling mud pools and steam vents.", "Reykjanes, Iceland", 63.82, -22.7, ["tourist_attraction", "viewpoint"]],
      ["Blue Lagoon", "Geothermal spa in a lava field.", "Grindavík, Iceland", 63.8804, -22.4495, ["tourist_attraction", "lake"]],
      ["Viking World Museum", "Viking ship replica museum.", "Keflavík, Iceland", 64.0014, -22.5625, ["museum", "historic_site"]],
    ]),
    hafnarfjordur: city(64.0671, -21.9378, "Capital Region", 15, [
      ["Hafnarfjörður Harbour", "Colourful fishing harbour.", "Hafnarfjörður, Iceland", 64.0671, -21.9378, ["tourist_attraction", "viewpoint"]],
      ["Hellisgerði Park", "Lava rock garden in the centre.", "Hafnarfjörður, Iceland", 64.0671, -21.9378, ["park"]],
      ["Hafnarfjörður Museum", "Local history museum.", "Hafnarfjörður, Iceland", 64.0671, -21.9378, ["museum"]],
      ["Krýsuvík Geothermal Area", "Coloured hot springs nearby.", "Krýsuvík, Iceland", 63.8333, -22.05, ["tourist_attraction", "viewpoint"]],
    ]),
    selfoss: city(63.9331, -21.0014, "Southern Region", 25, [
      ["Selfoss Church", "Modern church above the Ölfusá river.", "Selfoss, Iceland", 63.9331, -21.0014, ["landmark", "historic_site"]],
      ["Golden Circle Gateway", "Starting point for the famous route.", "Selfoss, Iceland", 63.9331, -21.0014, ["tourist_attraction"]],
      ["Kerid Crater", "Volcanic crater lake nearby.", "Kerid, Iceland", 64.0417, -20.8833, ["viewpoint", "lake"]],
      ["Selfoss Town Centre", "Riverside town on the Ring Road.", "Selfoss, Iceland", 63.9331, -21.0014, ["public_square", "tourist_attraction"]],
    ]),
  },
  luxembourg: {
    "luxembourg-city": city(49.6116, 6.1319, "Luxembourg", 12, [
      ["Luxembourg Old Town", "UNESCO fortress city in the Alzette gorge.", "Ville Haute, Luxembourg City, Luxembourg", 49.6116, 6.1319, ["old_town", "historic_site"]],
      ["Bock Casemates", "Underground tunnels carved in the cliff.", "Montée de Clausen, Luxembourg City, Luxembourg", 49.6116, 6.1369, ["castle", "historic_site"]],
      ["Grand Ducal Palace", "Official residence of the Grand Duke.", "17 Rue du Marché-aux-Herbes, Luxembourg City, Luxembourg", 49.6116, 6.1319, ["castle", "landmark"]],
      ["Adolphe Bridge", "Iconic double-arch bridge over the Pétrusse.", "Luxembourg City, Luxembourg", 49.6056, 6.1297, ["bridge", "landmark"]],
    ]),
    "esch-sur-alzette": city(49.4958, 5.9806, "Esch-sur-Alzette", 10, [
      ["Esch-Belval Blast Furnaces", "Industrial heritage of the steelworks.", "Esch-sur-Alzette, Luxembourg", 49.4958, 5.9806, ["historic_site", "monument"]],
      ["National Museum of Resistance", "WWII resistance museum.", "Esch-sur-Alzette, Luxembourg", 49.4958, 5.9806, ["museum", "historic_site"]],
      ["Rockhal", "Concert hall in the Belval district.", "Esch-sur-Alzette, Luxembourg", 49.4958, 5.9806, ["landmark", "tourist_attraction"]],
      ["Esch Town Hall", "Art nouveau town hall.", "Esch-sur-Alzette, Luxembourg", 49.4958, 5.9806, ["landmark", "historic_site"]],
    ]),
    differdange: city(49.5242, 5.8914, "Differdange", 10, [
      ["Differdange Castle", "Medieval castle housing the town hall.", "Differdange, Luxembourg", 49.5242, 5.8914, ["castle", "historic_site"]],
      ["Gaalgebierg Park", "Hilltop park with views.", "Differdange, Luxembourg", 49.5242, 5.8914, ["park", "viewpoint"]],
      ["Differdange Church", "Neo-Gothic parish church.", "Differdange, Luxembourg", 49.5242, 5.8914, ["landmark", "historic_site"]],
      ["Lasauvage Village", "Historic mining village nearby.", "Lasauvage, Luxembourg", 49.5167, 5.85, ["historic_site", "museum"]],
    ]),
    dudelange: city(49.4806, 6.0875, "Dudelange", 10, [
      ["Dudelange Town Hall", "Modern civic building.", "Dudelange, Luxembourg", 49.4806, 6.0875, ["landmark"]],
      ["National Museum of Resistance Dudelange", "Local resistance history.", "Dudelange, Luxembourg", 49.4806, 6.0875, ["museum", "historic_site"]],
      ["Dudelange Park", "Central town park.", "Dudelange, Luxembourg", 49.4806, 6.0875, ["park"]],
      ["Ellergronn Nature Reserve", "Forest nature area on the border.", "Dudelange, Luxembourg", 49.4667, 6.1, ["park", "tourist_attraction"]],
    ]),
    ettelbruck: city(49.8475, 6.1042, "Ettelbruck", 10, [
      ["General Patton Memorial", "Memorial to the liberation of Luxembourg.", "Ettelbruck, Luxembourg", 49.8475, 6.1042, ["monument", "museum"]],
      ["Ettelbruck Church", "Parish church in the town centre.", "Ettelbruck, Luxembourg", 49.8475, 6.1042, ["landmark", "historic_site"]],
      ["Sauer River Valley", "Scenic valley along the river.", "Ettelbruck, Luxembourg", 49.8475, 6.1042, ["viewpoint", "tourist_attraction"]],
      ["Documentation Center", "Battle of the Bulge history centre.", "Ettelbruck, Luxembourg", 49.8475, 6.1042, ["museum", "historic_site"]],
    ]),
  },
  monaco: {
    monaco: city(43.7384, 7.4246, "Monaco", 5, [
      ["Prince's Palace of Monaco", "Cliffside palace of the Grimaldi family.", "Monaco-Ville, Monaco", 43.7322, 7.4206, ["castle", "landmark"]],
      ["Monaco Cathedral", "Roman-Byzantine cathedral where Grace Kelly wed.", "Monaco-Ville, Monaco", 43.7303, 7.4203, ["landmark", "historic_site"]],
      ["Oceanographic Museum", "Cliffside museum founded by Prince Albert I.", "Avenue Saint-Martin, Monaco", 43.731, 7.4256, ["museum", "landmark"]],
      ["Fort Antoine Theatre", "Open-air theatre on the ramparts.", "Monaco-Ville, Monaco", 43.7333, 7.425, ["historic_site", "tourist_attraction"]],
    ]),
    fontvieille: city(43.7267, 7.4167, "Fontvieille", 5, [
      ["Louis II Stadium", "Home of AS Monaco FC.", "Fontvieille, Monaco", 43.7267, 7.4167, ["landmark", "tourist_attraction"]],
      ["Fontvieille Park", "Rose garden and playground by the port.", "Fontvieille, Monaco", 43.7267, 7.4167, ["park"]],
      ["Monaco Heliport", "Helicopter terminal with harbour views.", "Fontvieille, Monaco", 43.7267, 7.4167, ["landmark", "viewpoint"]],
      ["Car Museum of Monaco", "Private collection of vintage cars.", "Fontvieille, Monaco", 43.7267, 7.4167, ["museum"]],
    ]),
    "la-condamine": city(43.735, 7.42, "La Condamine", 5, [
      ["Port Hercules", "Main harbour with luxury yachts.", "La Condamine, Monaco", 43.735, 7.42, ["tourist_attraction", "viewpoint"]],
      ["Condamine Market", "Daily market under coloured awnings.", "La Condamine, Monaco", 43.735, 7.42, ["tourist_attraction", "public_square"]],
      ["Saint Devota Church", "Church of Monaco's patron saint.", "La Condamine, Monaco", 43.735, 7.42, ["landmark", "historic_site"]],
      ["Chapel of Mercy", "Baroque chapel in the old town.", "La Condamine, Monaco", 43.735, 7.42, ["historic_site", "landmark"]],
    ]),
    "monte-carlo": city(43.7396, 7.4275, "Monte Carlo", 5, [
      ["Casino de Monte-Carlo", "Belle Époque casino and opera.", "Place du Casino, Monte Carlo, Monaco", 43.7396, 7.4281, ["landmark", "historic_site"]],
      ["Casino Square", "Glamorous square with fountains and gardens.", "Monte Carlo, Monaco", 43.7396, 7.4275, ["public_square", "landmark"]],
      ["Japanese Garden", "Zen garden overlooking the sea.", "Monte Carlo, Monaco", 43.7396, 7.4275, ["park"]],
      ["Monte Carlo Harbor", "Prestigious marina below the casino.", "Monte Carlo, Monaco", 43.7333, 7.4333, ["tourist_attraction", "viewpoint"]],
    ]),
  },
  andorra: {
    "andorra-la-vella": city(42.5063, 1.5218, "Andorra la Vella", 10, [
      ["Sant Esteve Church", "Romanesque church in the old quarter.", "Andorra la Vella, Andorra", 42.5063, 1.5218, ["landmark", "historic_site"]],
      ["Casa de la Vall", "Historic parliament house.", "Andorra la Vella, Andorra", 42.5063, 1.5218, ["historic_site", "landmark"]],
      ["Caldea Spa", "Europe's largest mountain spa centre.", "Andorra la Vella, Andorra", 42.5063, 1.5218, ["tourist_attraction", "landmark"]],
      ["Nobility Street", "Historic street with manor houses.", "Andorra la Vella, Andorra", 42.5063, 1.5218, ["old_town", "historic_site"]],
    ]),
    "escaldes-engordany": city(42.5089, 1.5375, "Escaldes-Engordany", 10, [
      ["Carmen Thyssen Museum", "Art museum in a historic hotel.", "Escaldes-Engordany, Andorra", 42.5089, 1.5375, ["museum"]],
      ["Engolasters Lake", "Mountain lake above Escaldes.", "Engolasters, Andorra", 42.5167, 1.5667, ["lake", "viewpoint"]],
      ["Sant Miquel d'Engolasters", "Romanesque church near the lake.", "Escaldes-Engordany, Andorra", 42.5089, 1.5375, ["historic_site", "landmark"]],
      ["Rotonda Fountain", "Landmark roundabout fountain.", "Escaldes-Engordany, Andorra", 42.5089, 1.5375, ["monument", "landmark"]],
    ]),
    encamp: city(42.5361, 1.5833, "Encamp", 12, [
      ["National Automobile Museum", "Vintage car collection.", "Encamp, Andorra", 42.5361, 1.5833, ["museum"]],
      ["Funicular to Engolasters", "Funicular to the lake.", "Encamp, Andorra", 42.5361, 1.5833, ["tourist_attraction", "viewpoint"]],
      ["Sant Romà de les Bons", "Romanesque church and medieval village.", "Encamp, Andorra", 42.5361, 1.5833, ["historic_site", "old_town"]],
      ["Engolasters Hydroelectric Dam", "Historic dam above the lake.", "Encamp, Andorra", 42.5167, 1.5667, ["landmark", "historic_site"]],
    ]),
    "sant-julia-de-loria": city(42.4639, 1.4917, "Sant Julià de Lòria", 10, [
      ["Sant Julià de Lòria Church", "Parish church in the town centre.", "Sant Julià de Lòria, Andorra", 42.4639, 1.4917, ["landmark", "historic_site"]],
      ["Tobacco Museum", "Museum of Andorra's tobacco heritage.", "Sant Julià de Lòria, Andorra", 42.4639, 1.4917, ["museum", "historic_site"]],
      ["Naturlandia", "Nature park with activities.", "Sant Julià de Lòria, Andorra", 42.45, 1.4667, ["park", "tourist_attraction"]],
      ["Sant Serni de Nagol", "Romanesque chapel with frescoes.", "Sant Julià de Lòria, Andorra", 42.4639, 1.4917, ["historic_site", "landmark"]],
    ]),
  },
  "san-marino": {
    "san-marino": city(43.9424, 12.4578, "San Marino", 5, [
      ["Guaita Tower", "First of the three iconic fortress towers.", "San Marino", 43.9424, 12.4578, ["castle", "viewpoint"]],
      ["Palazzo Pubblico", "Neo-Gothic government palace on Liberty Square.", "Piazza della Libertà, San Marino", 43.9424, 12.4578, ["landmark", "historic_site"]],
      ["Basilica of San Marino", "Neoclassical basilica of the republic.", "San Marino", 43.9424, 12.4578, ["landmark", "historic_site"]],
      ["Cesta Tower", "Second fortress tower on Mount Titano.", "San Marino", 43.9333, 12.45, ["castle", "viewpoint"]],
    ]),
    serravalle: city(43.9689, 12.4817, "Serravalle", 8, [
      ["Serravalle Castle", "Medieval castle ruins.", "Serravalle, San Marino", 43.9689, 12.4817, ["castle", "historic_site"]],
      ["Serravalle Shopping Outlet", "Designer outlet district.", "Serravalle, San Marino", 43.9689, 12.4817, ["tourist_attraction"]],
      ["St. Andrea Church", "Historic church in Serravalle.", "Serravalle, San Marino", 43.9689, 12.4817, ["landmark", "historic_site"]],
      ["Fiumicello River Park", "Park along the river.", "Serravalle, San Marino", 43.9689, 12.4817, ["park"]],
    ]),
    "borgo-maggiore": city(43.9417, 12.4472, "Borgo Maggiore", 5, [
      ["Borgo Maggiore Cable Car", "Cable car to the historic centre.", "Borgo Maggiore, San Marino", 43.9417, 12.4472, ["tourist_attraction", "viewpoint"]],
      ["Market Square", "Weekly market square.", "Borgo Maggiore, San Marino", 43.9417, 12.4472, ["public_square", "tourist_attraction"]],
      ["Church of San Michele Arcangelo", "Parish church.", "Borgo Maggiore, San Marino", 43.9417, 12.4472, ["landmark", "historic_site"]],
      ["Montale Tower", "Third fortress tower of San Marino.", "Borgo Maggiore, San Marino", 43.9333, 12.45, ["castle", "viewpoint"]],
    ]),
    domagnano: city(43.95, 12.4667, "Domagnano", 8, [
      ["Domagnano Castle", "Medieval tower in the village.", "Domagnano, San Marino", 43.95, 12.4667, ["castle", "historic_site"]],
      ["Church of San Michele", "Parish church.", "Domagnano, San Marino", 43.95, 12.4667, ["landmark", "historic_site"]],
      ["Maranello Rosso Museum", "Ferrari museum near San Marino.", "Domagnano, San Marino", 43.95, 12.4667, ["museum"]],
      ["Domagnano Countryside", "Rolling hills of the republic.", "Domagnano, San Marino", 43.95, 12.4667, ["viewpoint", "park"]],
    ]),
  },
  liechtenstein: {
    vaduz: city(47.141, 9.5209, "Vaduz", 8, [
      ["Vaduz Castle", "Princely castle overlooking the capital.", "Vaduz, Liechtenstein", 47.1394, 9.5247, ["castle", "viewpoint"]],
      ["Kunstmuseum Liechtenstein", "Modern and contemporary art museum.", "Städtle 37, Vaduz, Liechtenstein", 47.141, 9.5209, ["museum", "landmark"]],
      ["Red House", "Landmark hillside house.", "Vaduz, Liechtenstein", 47.141, 9.5209, ["landmark", "historic_site"]],
      ["Government District", "Parliament and government buildings.", "Vaduz, Liechtenstein", 47.141, 9.5209, ["landmark", "public_square"]],
    ]),
    schaan: city(47.1667, 9.5097, "Schaan", 8, [
      ["Schaan Parish Church", "Gothic revival parish church.", "Schaan, Liechtenstein", 47.1667, 9.5097, ["landmark", "historic_site"]],
      ["Schaan Town Hall", "Modern civic building.", "Schaan, Liechtenstein", 47.1667, 9.5097, ["landmark"]],
      ["Dux Factory", "Industrial heritage site.", "Schaan, Liechtenstein", 47.1667, 9.5097, ["historic_site", "museum"]],
      ["Schaan Forest", "Woodland trails above the Rhine valley.", "Schaan, Liechtenstein", 47.1667, 9.5097, ["park", "viewpoint"]],
    ]),
    balzers: city(47.0667, 9.5, "Balzers", 8, [
      ["Gutenberg Castle", "Hilltop castle above Balzers.", "Balzers, Liechtenstein", 47.0667, 9.5, ["castle", "viewpoint"]],
      ["Balzers Parish Church", "Neo-Gothic church.", "Balzers, Liechtenstein", 47.0667, 9.5, ["landmark", "historic_site"]],
      ["Balzers Town Centre", "Village centre along the Rhine.", "Balzers, Liechtenstein", 47.0667, 9.5, ["old_town", "tourist_attraction"]],
      ["Lawena Museum", "Local history museum.", "Balzers, Liechtenstein", 47.0667, 9.5, ["museum"]],
    ]),
    eschen: city(47.2167, 9.5167, "Eschen", 8, [
      ["Eschen Parish Church", "Modern parish church.", "Eschen, Liechtenstein", 47.2167, 9.5167, ["landmark", "historic_site"]],
      ["Pfrundhaus", "Historic building in the centre.", "Eschen, Liechtenstein", 47.2167, 9.5167, ["historic_site", "landmark"]],
      ["Eschen Town Hall", "Civic centre of the municipality.", "Eschen, Liechtenstein", 47.2167, 9.5167, ["landmark"]],
      ["Nendeln Pottery", "Historic pottery workshop.", "Eschen, Liechtenstein", 47.2167, 9.5167, ["museum", "historic_site"]],
    ]),
    triesen: city(47.1, 9.5333, "Triesen", 8, [
      ["Triesen Parish Church", "Romanesque-Gothic church.", "Triesen, Liechtenstein", 47.1, 9.5333, ["landmark", "historic_site"]],
      ["St. Mamerten Chapel", "Oldest chapel in the principality.", "Triesen, Liechtenstein", 47.1, 9.5333, ["historic_site", "landmark"]],
      ["Triesen Museum", "Local heritage museum.", "Triesen, Liechtenstein", 47.1, 9.5333, ["museum"]],
      ["Rhine River Trail", "Riverside walking path.", "Triesen, Liechtenstein", 47.1, 9.5333, ["tourist_attraction", "viewpoint"]],
    ]),
  },
  kyrgyzstan: {
    bishkek: city(42.8746, 74.5698, "Bishkek", 15, [
      ["Ala-Too Square", "Central square with changing of the guard.", "Bishkek, Kyrgyzstan", 42.8746, 74.5698, ["public_square", "landmark"]],
      ["State History Museum", "Soviet-era museum on the main square.", "Bishkek, Kyrgyzstan", 42.8746, 74.5698, ["museum"]],
      ["Osh Bazaar", "Vast market for spices and crafts.", "Bishkek, Kyrgyzstan", 42.8746, 74.5698, ["tourist_attraction", "historic_site"]],
      ["Oak Park", "Central park with sculptures.", "Bishkek, Kyrgyzstan", 42.8746, 74.5698, ["park"]],
    ]),
    osh: city(40.5283, 72.7985, "Osh", 15, [
      ["Sulayman Mountain", "UNESCO sacred mountain in the city.", "Osh, Kyrgyzstan", 40.5283, 72.7985, ["mountain", "historic_site"]],
      ["Osh Bazaar", "Great bazaar along the Ak-Buura river.", "Osh, Kyrgyzstan", 40.5283, 72.7985, ["tourist_attraction", "old_town"]],
      ["Osh History Museum", "Regional history museum.", "Osh, Kyrgyzstan", 40.5283, 72.7985, ["museum"]],
      ["Rabat Abdul Khan Mosque", "16th-century mosque.", "Osh, Kyrgyzstan", 40.5283, 72.7985, ["landmark", "historic_site"]],
    ]),
    jalalabad: city(40.9333, 73.0, "Jalal-Abad", 15, [
      ["Arslanbob Walnut Forest", "World's largest natural walnut forest.", "Arslanbob, Kyrgyzstan", 41.3333, 72.9333, ["park", "tourist_attraction"]],
      ["Jalal-Abad Spa", "Historic mineral springs.", "Jalal-Abad, Kyrgyzstan", 40.9333, 73.0, ["tourist_attraction", "historic_site"]],
      ["Jalal-Abad Regional Museum", "Local history museum.", "Jalal-Abad, Kyrgyzstan", 40.9333, 73.0, ["museum"]],
      ["Lenin Peak Viewpoint", "Views toward the Pamir mountains.", "Jalal-Abad, Kyrgyzstan", 40.9333, 73.0, ["viewpoint", "mountain"]],
    ]),
    karakol: city(42.4907, 78.3936, "Karakol", 20, [
      ["Dungan Mosque", "Wooden mosque built without nails.", "Karakol, Kyrgyzstan", 42.4907, 78.3936, ["landmark", "historic_site"]],
      ["Holy Trinity Cathedral", "Wooden Russian Orthodox church.", "Karakol, Kyrgyzstan", 42.4907, 78.3936, ["landmark", "historic_site"]],
      ["Przhevalsky Museum", "Museum to the Russian explorer.", "Karakol, Kyrgyzstan", 42.4907, 78.3936, ["museum", "historic_site"]],
      ["Jeti-Ögüz Valley", "Red rock valley near Karakol.", "Jeti-Ögüz, Kyrgyzstan", 42.35, 78.25, ["viewpoint", "park"]],
    ]),
    naryn: city(41.4286, 75.9911, "Naryn", 25, [
      ["Tash Rabat Caravanserai", "15th-century stone caravanserai on the Silk Road.", "Tash Rabat, Kyrgyzstan", 41.15, 75.6833, ["historic_site", "landmark"]],
      ["Naryn River", "Mountain river through the town.", "Naryn, Kyrgyzstan", 41.4286, 75.9911, ["river", "viewpoint"]],
      ["At-Bashi Mountains", "High peaks on the road to Torugart.", "Naryn, Kyrgyzstan", 41.4286, 75.9911, ["mountain", "viewpoint"]],
      ["Naryn Regional Museum", "Nomadic culture and history.", "Naryn, Kyrgyzstan", 41.4286, 75.9911, ["museum"]],
    ]),
  },
  tajikistan: {
    dushanbe: city(38.5598, 68.7738, "Dushanbe", 15, [
      ["Rudaki Park", "Central park with monuments and fountains.", "Dushanbe, Tajikistan", 38.5598, 68.7738, ["park", "monument"]],
      ["National Museum of Tajikistan", "Archaeology and cultural history.", "Dushanbe, Tajikistan", 38.5598, 68.7738, ["museum"]],
      ["Ismaili Centre", "Modern religious and cultural centre.", "Dushanbe, Tajikistan", 38.5598, 68.7738, ["landmark", "historic_site"]],
      ["Flagpole Park", "One of the world's tallest flagpoles.", "Dushanbe, Tajikistan", 38.5598, 68.7738, ["monument", "landmark"]],
    ]),
    khujand: city(40.2833, 69.6167, "Khujand", 12, [
      ["Khujand Fortress", "Reconstructed citadel on the Syr Darya.", "Khujand, Tajikistan", 40.2833, 69.6167, ["castle", "museum"]],
      ["Panchshanbe Bazaar", "Grand covered market.", "Khujand, Tajikistan", 40.2833, 69.6167, ["tourist_attraction", "historic_site"]],
      ["Sheikh Muslihiddin Mosque", "Historic Friday mosque.", "Khujand, Tajikistan", 40.2833, 69.6167, ["landmark", "historic_site"]],
      ["Kamoli Khujandi Park", "Riverside park in the city.", "Khujand, Tajikistan", 40.2833, 69.6167, ["park"]],
    ]),
    kulob: city(37.9167, 69.7833, "Kulob", 12, [
      ["Mir Sayyid Ali Hamadani Shrine", "Important Sufi shrine.", "Kulob, Tajikistan", 37.9167, 69.7833, ["historic_site", "landmark"]],
      ["Kulob Regional Museum", "Local history museum.", "Kulob, Tajikistan", 37.9167, 69.7833, ["museum"]],
      ["Kulob Park", "Central city park.", "Kulob, Tajikistan", 37.9167, 69.7833, ["park"]],
      ["Yamchun Fortress", "Ancient fortress in the Pamir foothills.", "Yamchun, Tajikistan", 37.2, 71.9, ["castle", "historic_site"]],
    ]),
    qurghonteppa: city(37.8333, 68.7833, "Qurghonteppa", 12, [
      ["Ajina-Teppa Buddhist Monastery", "Excavated 7th-century Buddhist site.", "Qurghonteppa, Tajikistan", 37.8333, 68.7833, ["historic_site", "museum"]],
      ["Qurghonteppa Regional Museum", "Archaeology and ethnography.", "Qurghonteppa, Tajikistan", 37.8333, 68.7833, ["museum"]],
      ["Vakhsh River Park", "Park along the river.", "Qurghonteppa, Tajikistan", 37.8333, 68.7833, ["park", "viewpoint"]],
      ["Takhti Sangin", "Alexander the Great's Oxus Temple ruins.", "Takhti Sangin, Tajikistan", 37.7667, 68.65, ["historic_site", "tourist_attraction"]],
    ]),
    istaravshan: city(39.9142, 69.0044, "Istaravshan", 12, [
      ["Mugh Teppe", "Ancient settlement mound.", "Istaravshan, Tajikistan", 39.9142, 69.0044, ["historic_site", "viewpoint"]],
      ["Hazrati Shoh Mosque", "Historic Friday mosque.", "Istaravshan, Tajikistan", 39.9142, 69.0044, ["landmark", "historic_site"]],
      ["Kok Gumbaz", "Blue dome mosque.", "Istaravshan, Tajikistan", 39.9142, 69.0044, ["landmark", "historic_site"]],
      ["Istaravshan Bazaar", "Traditional market in the old town.", "Istaravshan, Tajikistan", 39.9142, 69.0044, ["old_town", "tourist_attraction"]],
    ]),
  },
  turkmenistan: {
    ashgabat: city(37.9601, 58.3261, "Ashgabat", 15, [
      ["Neutrality Arch", "Triumphal arch with rotating gold statue.", "Ashgabat, Turkmenistan", 37.9601, 58.3261, ["monument", "landmark"]],
      ["Turkmenistan Independence Monument", "White marble monument complex.", "Ashgabat, Turkmenistan", 37.9601, 58.3261, ["monument", "landmark"]],
      ["National Museum of Turkmenistan", "History from ancient Margiana to today.", "Ashgabat, Turkmenistan", 37.9601, 58.3261, ["museum"]],
      ["Ertugrul Gazi Mosque", "Ottoman-style mosque.", "Ashgabat, Turkmenistan", 37.9601, 58.3261, ["landmark", "historic_site"]],
    ]),
    turkmenabat: city(39.0833, 63.5667, "Turkmenabat", 12, [
      ["Kugitang Nature Reserve", "Dinosaur plateau nearby.", "Turkmenabat, Turkmenistan", 39.0833, 63.5667, ["park", "historic_site"]],
      ["Amu Darya River", "Great river of Central Asia.", "Turkmenabat, Turkmenistan", 39.0833, 63.5667, ["river", "viewpoint"]],
      ["Turkmenabat Regional Museum", "Local history museum.", "Turkmenabat, Turkmenistan", 39.0833, 63.5667, ["museum"]],
      ["Alp Arslan Monument", "Seljuk ruler monument.", "Turkmenabat, Turkmenistan", 39.0833, 63.5667, ["monument", "landmark"]],
    ]),
    mary: city(37.6, 61.8333, "Mary", 20, [
      ["Ancient Merv", "UNESCO ruins of a major Silk Road city.", "Merv, Turkmenistan", 37.6667, 62.1833, ["historic_site", "tourist_attraction"]],
      ["Mary Regional Museum", "Archaeology museum with Margiana artifacts.", "Mary, Turkmenistan", 37.6, 61.8333, ["museum"]],
      ["Sultan Sanjar Mausoleum", "Landmark tomb in ancient Merv.", "Merv, Turkmenistan", 37.6667, 62.1833, ["monument", "historic_site"]],
      ["Great Kyz Kala", "Unfired brick fortress in Merv.", "Merv, Turkmenistan", 37.6667, 62.1833, ["castle", "historic_site"]],
    ]),
    balkanabat: city(39.5108, 54.3675, "Balkanabat", 20, [
      ["Yangykala Canyon", "Colourful canyon formations on the Caspian.", "Yangykala, Turkmenistan", 40.25, 54.5, ["viewpoint", "park"]],
      ["Gozli-Ata Pilgrimage Site", "Sacred site in the desert.", "Balkanabat, Turkmenistan", 39.5108, 54.3675, ["historic_site", "landmark"]],
      ["Balkanabat Regional Museum", "Local history museum.", "Balkanabat, Turkmenistan", 39.5108, 54.3675, ["museum"]],
      ["Underground Lake Kov-Ata", "Warm sulphur lake in a cave.", "Kov-Ata, Turkmenistan", 39.5, 54.2, ["tourist_attraction", "lake"]],
    ]),
    dashoguz: city(41.8333, 59.9667, "Dashoguz", 20, [
      ["Kunya-Urgench", "UNESCO ancient capital of Khorezm.", "Kunya-Urgench, Turkmenistan", 42.3167, 59.15, ["historic_site", "landmark"]],
      ["Turabek Khanum Mausoleum", "Landmark mausoleum in Kunya-Urgench.", "Kunya-Urgench, Turkmenistan", 42.3167, 59.15, ["monument", "historic_site"]],
      ["Kutlug-Timur Minaret", "Tall brick minaret.", "Kunya-Urgench, Turkmenistan", 42.3167, 59.15, ["landmark", "historic_site"]],
      ["Dashoguz Regional Museum", "Regional history museum.", "Dashoguz, Turkmenistan", 41.8333, 59.9667, ["museum"]],
    ]),
  },
  uzbekistan: {
    tashkent: city(41.2995, 69.2401, "Tashkent", 15, [
      ["Khast Imam Complex", "Islamic centre with the Uthman Quran.", "Tashkent, Uzbekistan", 41.3394, 69.2401, ["historic_site", "landmark"]],
      ["Chorsu Bazaar", "Blue-domed market under the old town.", "Tashkent, Uzbekistan", 41.3269, 69.2344, ["tourist_attraction", "historic_site"]],
      ["Amir Timur Square", "Central square with equestrian statue.", "Tashkent, Uzbekistan", 41.3111, 69.2797, ["public_square", "landmark"]],
      ["Tashkent Metro", "Ornate Soviet-era metro stations.", "Tashkent, Uzbekistan", 41.2995, 69.2401, ["landmark", "tourist_attraction"]],
    ]),
    samarkand: city(39.6542, 66.9597, "Samarkand", 15, [
      ["Registan", "Iconic square with three madrasas.", "Registan St, Samarkand, Uzbekistan", 39.6547, 66.9758, ["public_square", "landmark"]],
      ["Gur-e-Amir", "Timur's mausoleum.", "Samarkand, Uzbekistan", 39.6486, 66.9692, ["monument", "historic_site"]],
      ["Shah-i-Zinda", "Avenue of blue-tiled mausoleums.", "Samarkand, Uzbekistan", 39.6622, 66.9792, ["historic_site", "landmark"]],
      ["Bibi-Khanym Mosque", "Monumental mosque built by Timur.", "Samarkand, Uzbekistan", 39.6608, 66.9794, ["landmark", "historic_site"]],
    ]),
    bukhara: city(39.7681, 64.4556, "Bukhara", 12, [
      ["Po-i-Kalyan Complex", "Minaret, mosque, and madrasa ensemble.", "Bukhara, Uzbekistan", 39.7758, 64.4153, ["landmark", "historic_site"]],
      ["Ark Fortress", "Ancient citadel of the emirs.", "Bukhara, Uzbekistan", 39.7778, 64.4083, ["castle", "museum"]],
      ["Lyab-i Hauz", "Plaza around a historic pond.", "Bukhara, Uzbekistan", 39.7731, 64.4214, ["public_square", "historic_site"]],
      ["Chor Minor", "Four-minaret gatehouse.", "Bukhara, Uzbekistan", 39.7708, 64.4264, ["landmark", "historic_site"]],
    ]),
    namangan: city(40.9983, 71.6726, "Namangan", 12, [
      ["Mullah Kyrgyz Madrasa", "Historic Islamic school.", "Namangan, Uzbekistan", 40.9983, 71.6726, ["historic_site", "landmark"]],
      ["Namangan Regional Museum", "Local history and crafts.", "Namangan, Uzbekistan", 40.9983, 71.6726, ["museum"]],
      ["Babur Park", "Central city park.", "Namangan, Uzbekistan", 40.9983, 71.6726, ["park"]],
      ["Ota Mosque", "Grand mosque of Namangan.", "Namangan, Uzbekistan", 40.9983, 71.6726, ["landmark", "historic_site"]],
    ]),
    andijan: city(40.7821, 72.3442, "Andijan", 12, [
      ["Juma Mosque of Andijan", "Historic Friday mosque.", "Andijan, Uzbekistan", 40.7821, 72.3442, ["landmark", "historic_site"]],
      ["Babur Literary Museum", "Museum to the Mughal emperor born here.", "Andijan, Uzbekistan", 40.7821, 72.3442, ["museum", "historic_site"]],
      ["Andijan Regional Museum", "Regional history museum.", "Andijan, Uzbekistan", 40.7821, 72.3442, ["museum"]],
      ["Navoi Park", "Central park of Andijan.", "Andijan, Uzbekistan", 40.7821, 72.3442, ["park"]],
    ]),
  },
};
