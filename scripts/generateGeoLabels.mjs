#!/usr/bin/env node
/**
 * Generates geo label translation files from database city seeds.
 * Run: node scripts/generateGeoLabels.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const SUPPLEMENTAL_RU = {
  "Aachen": "\u0410\u0430\u0445\u0435\u043d",
  "Aargau": "\u0410\u0440\u0433\u0430\u0443",
  "Alicante": "\u0410\u043b\u0438\u043a\u0430\u043d\u0442\u0435",
  "Annecy": "\u0410\u043d\u043d\u0435\u0441\u0438",
  "Appenzell": "\u0410\u043f\u043f\u0435\u043d\u0446\u0435\u043b\u043b\u044c",
  "Astrakhan": "\u0410\u0441\u0442\u0440\u0430\u0445\u0430\u043d\u044c",
  "Augsburg": "\u0410\u0443\u0433\u0441\u0431\u0443\u0440\u0433",
  "Aveiro": "\u0410\u0432\u0435\u0439\u0440\u0443",
  "Avignon": "\u0410\u0432\u0438\u043d\u044c\u043e\u043d",
  "Bari": "\u0411\u0430\u0440\u0438",
  "Barnaul": "\u0411\u0430\u0440\u043d\u0430\u0443\u043b",
  "Bath": "\u0411\u0430\u0442",
  "Belfast": "\u0411\u0435\u043b\u0444\u0430\u0441\u0442",
  "Bergamo": "\u0411\u0435\u0440\u0433\u0430\u043c\u043e",
  "Bia\u0142ystok": "\u0411\u0435\u043b\u043e\u0441\u0442\u043e\u043a",
  "Bologna": "\u0411\u043e\u043b\u043e\u043d\u044c\u044f",
  "Bonn": "\u0411\u043e\u043d\u043d",
  "Bremen": "\u0411\u0440\u0435\u043c\u0435\u043d",
  "Brighton": "\u0411\u0440\u0430\u0439\u0442\u043e\u043d",
  "Bydgoszcz": "\u0411\u044b\u0434\u0433\u043e\u0449",
  "Cambridge": "\u041a\u0435\u043c\u0431\u0440\u0438\u0434\u0436",
  "Cannes": "\u041a\u0430\u043d\u043d\u044b",
  "Cardiff": "\u041a\u0430\u0440\u0434\u0438\u0444\u0444",
  "Catania": "\u041a\u0430\u0442\u0430\u043d\u0438\u044f",
  "Chania": "\u0425\u0430\u043d\u044c\u044f",
  "Charleroi": "\u0428\u0430\u0440\u043b\u0435\u0440\u0443\u0430",
  "Cherkessk": "\u0427\u0435\u0440\u043a\u0435\u0441\u0441\u043a",
  "Clermont-Ferrand": "\u041a\u043b\u0435\u0440\u043c\u043e\u043d-\u0424\u0435\u0440\u0440\u0430\u043d",
  "Como": "\u041a\u043e\u043c\u043e",
  "Constan\u021ba": "\u041a\u043e\u043d\u0441\u0442\u0430\u043d\u0446\u0430",
  "Davos": "\u0414\u0430\u0432\u043e\u0441",
  "Delft": "\u0414\u0435\u043b\u0444\u0442",
  "Dijon": "\u0414\u0438\u0436\u043e\u043d",
  "Dortmund": "\u0414\u043e\u0440\u0442\u043c\u0443\u043d\u0434",
  "Drammen": "\u0414\u0440\u0430\u043c\u043c\u0435\u043d",
  "Dresden": "\u0414\u0440\u0435\u0437\u0434\u0435\u043d",
  "D\u00fcsseldorf": "\u0414\u044e\u0441\u0441\u0435\u043b\u044c\u0434\u043e\u0440\u0444",
  "Eger": "\u042d\u0433\u0435\u0440",
  "Essen": "\u042d\u0441\u0441\u0435\u043d",
  "Freiburg": "\u0424\u0440\u0430\u0439\u0431\u0443\u0440\u0433",
  "Funchal": "\u0424\u0443\u043d\u0448\u0430\u043b",
  "Genoa": "\u0413\u0435\u043d\u0443\u044f",
  "Granada": "\u0413\u0440\u0430\u043d\u0430\u0434\u0430",
  "Graub\u00fcnden": "\u0413\u0440\u0430\u0443\u0431\u044e\u043d\u0434\u0435\u043d",
  "Grenoble": "\u0413\u0440\u0435\u043d\u043e\u0431\u043b\u044c",
  "Grindelwald": "\u0413\u0440\u0438\u043d\u0434\u0435\u043b\u044c\u0432\u0430\u043b\u044c\u0434",
  "Groningen": "\u0413\u0440\u043e\u043d\u0438\u043d\u0433\u0435\u043d",
  "Grozny": "\u0413\u0440\u043e\u0437\u043d\u044b\u0439",
  "Gy\u0151r": "\u0414\u044c\u0451\u0440",
  "Haarlem": "\u0425\u0430\u0430\u0440\u043b\u0435\u043c",
  "Hallstatt": "\u0425\u0430\u043b\u044c\u0448\u0442\u0430\u0442\u0442",
  "Hanover": "\u0413\u0430\u043d\u043d\u043e\u0432\u0435\u0440",
  "Heidelberg": "\u0413\u0435\u0439\u0434\u0435\u043b\u044c\u0431\u0435\u0440\u0433",
  "Helsingborg": "\u0425\u0435\u043b\u044c\u0441\u0438\u043d\u0431\u043e\u0440\u0433",
  "Irkutsk": "\u0418\u0440\u043a\u0443\u0442\u0441\u043a",
  "Jura": "\u042e\u0440\u0430",
  "Jyv\u00e4skyl\u00e4": "\u042e\u0432\u044f\u0441\u043a\u044e\u043b\u044f",
  "J\u00f6nk\u00f6ping": "\u0419\u0451\u043d\u0447\u0435\u043f\u0438\u043d\u0433",
  "Kaliningrad": "\u041a\u0430\u043b\u0438\u043d\u0438\u043d\u0433\u0440\u0430\u0434",
  "Karlovy Vary": "\u041a\u0430\u0440\u043b\u043e\u0432\u044b-\u0412\u0430\u0440\u044b",
  "Karlsruhe": "\u041a\u0430\u0440\u043b\u0441\u0440\u0443\u044d",
  "Katowice": "\u041a\u0430\u0442\u043e\u0432\u0438\u0446\u0435",
  "Kemerovo": "\u041a\u0435\u043c\u0435\u0440\u043e\u0432\u043e",
  "Khabarovsk": "\u0425\u0430\u0431\u0430\u0440\u043e\u0432\u0441\u043a",
  "Kiel": "\u041a\u0438\u043b\u044c",
  "Kilkenny": "\u041a\u0438\u043b\u043a\u0435\u043d\u043d\u0438",
  "Klagenfurt": "\u041a\u043b\u0430\u0433\u0435\u043d\u0444\u0443\u0440\u0442",
  "Koper": "\u041a\u043e\u043f\u0435\u0440",
  "Kotor": "\u041a\u043e\u0442\u043e\u0440",
  "Kristiansand": "\u041a\u0440\u0438\u0441\u0442\u0438\u0430\u043d\u0441\u0430\u043d",
  "Las Palmas": "\u041b\u0430\u0441-\u041f\u0430\u043b\u044c\u043c\u0430\u0441",
  "Leeds": "\u041b\u0438\u0434\u0441",
  "Leiden": "\u041b\u0435\u0439\u0434\u0435\u043d",
  "Leipzig": "\u041b\u0435\u0439\u043f\u0446\u0438\u0433",
  "Leuven": "\u041b\u044e\u0432\u0435\u043d",
  "Liberec": "\u041b\u0438\u0431\u0435\u0440\u0435\u0446",
  "Lille": "\u041b\u0438\u043b\u043b\u044c",
  "Liverpool": "\u041b\u0438\u0432\u0435\u0440\u043f\u0443\u043b\u044c",
  "Lublin": "\u041b\u044e\u0431\u043b\u0438\u043d",
  "Lund": "\u041b\u044e\u043d\u0434",
  "Maastricht": "\u041c\u0430\u0430\u0441\u0442\u0440\u0438\u0445\u0442",
  "Magas": "\u041c\u0430\u0433\u0430\u0441",
  "Makhachkala": "\u041c\u0430\u0445\u0430\u0447\u043a\u0430\u043b\u0430",
  "Mannheim": "\u041c\u0430\u043d\u043d\u0433\u0435\u0439\u043c",
  "Maykop": "\u041c\u0430\u0439\u043a\u043e\u043f",
  "Mdina": "\u041c\u0434\u0438\u043d\u0430",
  "Mechelen": "\u041c\u0435\u0445\u0435\u043b\u0435\u043d",
  "Metz": "\u041c\u0435\u0446",
  "Montpellier": "\u041c\u043e\u043d\u043f\u0435\u043b\u044c\u0435",
  "Murcia": "\u041c\u0443\u0440\u0441\u0438\u044f",
  "Murmansk": "\u041c\u0443\u0440\u043c\u0430\u043d\u0441\u043a",
  "M\u00fcnster": "\u041c\u044e\u043d\u0441\u0442\u0435\u0440",
  "Nalchik": "\u041d\u0430\u043b\u044c\u0447\u0438\u043a",
  "Namur": "\u041d\u0430\u043c\u044e\u0440",
  "Nancy": "\u041d\u0430\u043d\u0441\u0438",
  "Nantes": "\u041d\u0430\u043d\u0442",
  "Nazran": "\u041d\u0430\u0437\u0440\u0430\u043d",
  "Newcastle": "\u041d\u044c\u044e\u043a\u0430\u0441\u043b",
  "Nijmegen": "\u041d\u0435\u0439\u043c\u0435\u0433\u0435\u043d",
  "Nottingham": "\u041d\u043e\u0442\u0442\u0438\u043d\u0433\u0435\u043c",
  "Nuremberg": "\u041d\u044e\u0440\u043d\u0431\u0435\u0440\u0433",
  "Ostend": "\u041e\u0441\u0442\u0435\u043d\u0434\u0435",
  "Oxford": "\u041e\u043a\u0441\u0444\u043e\u0440\u0434",
  "Padua": "\u041f\u0430\u0434\u0443\u044f",
  "Palermo": "\u041f\u0430\u043b\u0435\u0440\u043c\u043e",
  "Palma": "\u041f\u0430\u043b\u044c\u043c\u0430",
  "Pisa": "\u041f\u0438\u0437\u0430",
  "Potsdam": "\u041f\u043e\u0442\u0441\u0434\u0430\u043c",
  "Pula": "\u041f\u0443\u043b\u0430",
  "Pyatigorsk": "\u041f\u044f\u0442\u0438\u0433\u043e\u0440\u0441\u043a",
  "Reims": "\u0420\u0435\u0439\u043c\u0441",
  "Rennes": "\u0420\u0435\u043d\u043d",
  "Rhodes": "\u0420\u043e\u0434\u043e\u0441",
  "Rimini": "\u0420\u0438\u043c\u0438\u043d\u0438",
  "Roskilde": "\u0420\u043e\u0441\u043a\u0438\u043b\u044c\u0435",
  "Rostock": "\u0420\u043e\u0441\u0442\u043e\u043a",
  "Rovaniemi": "\u0420\u043e\u0432\u0430\u043d\u0438\u0435\u043c\u0438",
  "Ryazan": "\u0420\u044f\u0437\u0430\u043d\u044c",
  "Saint-\u00c9tienne": "\u0421\u0435\u043d-\u042d\u0442\u044c\u0435\u043d",
  "Salamanca": "\u0421\u0430\u043b\u0430\u043c\u0430\u043d\u043a\u0430",
  "Samara": "\u0421\u0430\u043c\u0430\u0440\u0430",
  "San Sebasti\u00e1n": "\u0421\u0430\u043d-\u0421\u0435\u0431\u0430\u0441\u0442\u044c\u044f\u043d",
  "Santiago de Compostela": "\u0421\u0430\u043d\u0442\u044c\u044f\u0433\u043e-\u0434\u0435-\u041a\u043e\u043c\u043f\u043e\u0441\u0442\u0435\u043b\u0430",
  "Santorini": "\u0421\u0430\u043d\u0442\u043e\u0440\u0438\u043d\u0438",
  "Saratov": "\u0421\u0430\u0440\u0430\u0442\u043e\u0432",
  "Schaffhausen": "\u0428\u0430\u0444\u0445\u0430\u0443\u0437\u0435\u043d",
  "Schwyz": "\u0428\u0432\u0438\u0446",
  "Sheffield": "\u0428\u0435\u0444\u0444\u0438\u043b\u0434",
  "Sibiu": "\u0421\u0438\u0431\u0438\u0443",
  "Siena": "\u0421\u044c\u0435\u043d\u0430",
  "Sintra": "\u0421\u0438\u043d\u0442\u0440\u0430",
  "Sochi": "\u0421\u043e\u0447\u0438",
  "St. Moritz": "\u0421\u0435\u043d-\u041c\u043e\u0440\u0438\u0446",
  "Stavropol": "\u0421\u0442\u0430\u0432\u0440\u043e\u043f\u043e\u043b\u044c",
  "Strasbourg": "\u0421\u0442\u0440\u0430\u0441\u0431\u0443\u0440\u0433",
  "Szczecin": "\u0429\u0435\u0446\u0438\u043d",
  "Sz\u00e9kesfeh\u00e9rv\u00e1r": "\u0421\u0435\u043a\u0435\u0448\u0444\u0435\u0445\u0435\u0440\u0432\u0430\u0440",
  "Thurgau": "\u0422\u0443\u0440\u0433\u0430\u0443",
  "Ticino": "\u0422\u0438\u0447\u0438\u043d\u043e",
  "Tilburg": "\u0422\u0438\u043b\u0431\u044e\u0440\u0433",
  "Tomsk": "\u0422\u043e\u043c\u0441\u043a",
  "Toulon": "\u0422\u0443\u043b\u043e\u043d",
  "Trieste": "\u0422\u0440\u0438\u0435\u0441\u0442",
  "Tula": "\u0422\u0443\u043b\u0430",
  "Tyumen": "\u0422\u044e\u043c\u0435\u043d\u044c",
  "Vaasa": "\u0412\u0430\u0430\u0441\u0430",
  "Valais": "\u0412\u0430\u043b\u0435",
  "Vatican City": "\u0412\u0430\u0442\u0438\u043a\u0430\u043d",
  "Vaud": "\u0412\u043e",
  "Verona": "\u0412\u0435\u0440\u043e\u043d\u0430",
  "Villach": "\u0412\u0438\u043b\u044c\u0430\u0445",
  "Visby": "\u0412\u0438\u0441\u0431\u044e",
  "Vladikavkaz": "\u0412\u043b\u0430\u0434\u0438\u043a\u0430\u0432\u043a\u0430\u0437",
  "Vladivostok": "\u0412\u043b\u0430\u0434\u0438\u0432\u043e\u0441\u0442\u043e\u043a",
  "Wels": "\u0412\u0435\u043b\u044c\u0441",
  "Wichtrach": "\u0412\u0438\u0445\u0442\u0440\u0430\u0445",
  "Wiesbaden": "\u0412\u0438\u0441\u0431\u0430\u0434\u0435\u043d",
  "W\u00fcrzburg": "\u042e\u0440\u0446\u0431\u0443\u0440\u0433",
  "Yaroslavl": "\u042f\u0440\u043e\u0441\u043b\u0430\u0432\u043b\u044c",
  "York": "\u0419\u043e\u0440\u043a",
  "Zadar": "\u0417\u0430\u0434\u0430\u0440",
  "Zaragoza": "\u0421\u0430\u0440\u0430\u0433\u043e\u0441\u0430",
  "Zermatt": "\u0426\u0435\u0440\u043c\u0430\u0442\u0442",
  "\u010cesk\u00e9 Bud\u011bjovice": "\u0427\u0435\u0448\u0441\u043a\u0435-\u0411\u0443\u0434\u0435\u0451\u0432\u0438\u0446\u0435",
  "\u0141\u00f3d\u017a": "\u041b\u043e\u0434\u0437\u044c",
};

/** Geocoder-only localities (not in DB city seeds) — still need RU/DE display names. */
const GEOCODER_ONLY_NAMES = {
  Wichtrach: { ru: "\u0412\u0438\u0445\u0442\u0440\u0430\u0445", de: "Wichtrach" },
};

const SUPPLEMENTAL_DE = {
  "Aachen": "Aachen",
  "Aargau": "Aargau",
  "Alicante": "Alicante",
  "Annecy": "Annecy",
  "Appenzell": "Appenzell",
  "Astrakhan": "Astrachan",
  "Augsburg": "Augsburg",
  "Aveiro": "Aveiro",
  "Avignon": "Avignon",
  "Bari": "Bari",
  "Barnaul": "Barnaul",
  "Bath": "Bath",
  "Belfast": "Belfast",
  "Bergamo": "Bergamo",
  "Bia\u0142ystok": "Bialystok",
  "Bologna": "Bologna",
  "Bonn": "Bonn",
  "Bremen": "Bremen",
  "Brighton": "Brighton",
  "Bydgoszcz": "Bydgoszcz",
  "Cambridge": "Cambridge",
  "Cannes": "Cannes",
  "Cardiff": "Cardiff",
  "Catania": "Catania",
  "Chania": "Chania",
  "Charleroi": "Charleroi",
  "Cherkessk": "Tscherkessk",
  "Clermont-Ferrand": "Clermont-Ferrand",
  "Como": "Como",
  "Constan\u021ba": "Konstanza",
  "Davos": "Davos",
  "Delft": "Delft",
  "Dijon": "Dijon",
  "Dortmund": "Dortmund",
  "Drammen": "Drammen",
  "Dresden": "Dresden",
  "D\u00fcsseldorf": "D\u00fcsseldorf",
  "Eger": "Eger",
  "Essen": "Essen",
  "Freiburg": "Freiburg",
  "Funchal": "Funchal",
  "Genoa": "Genua",
  "Granada": "Granada",
  "Graub\u00fcnden": "Graub\u00fcnden",
  "Grenoble": "Grenoble",
  "Grindelwald": "Grindelwald",
  "Groningen": "Groningen",
  "Grozny": "Grosny",
  "Gy\u0151r": "Raab",
  "Haarlem": "Haarlem",
  "Hallstatt": "Hallstatt",
  "Hanover": "Hannover",
  "Heidelberg": "Heidelberg",
  "Helsingborg": "Helsingborg",
  "Irkutsk": "Irkutsk",
  "Jura": "Jura",
  "Jyv\u00e4skyl\u00e4": "Jyv\u00e4skyl\u00e4",
  "J\u00f6nk\u00f6ping": "J\u00f6nk\u00f6ping",
  "Kaliningrad": "Kaliningrad",
  "Karlovy Vary": "Karlsbad",
  "Karlsruhe": "Karlsruhe",
  "Katowice": "Kattowitz",
  "Kemerovo": "Kemerowo",
  "Khabarovsk": "Chabarowsk",
  "Kiel": "Kiel",
  "Kilkenny": "Kilkenny",
  "Klagenfurt": "Klagenfurt",
  "Koper": "Koper",
  "Kotor": "Kotor",
  "Kristiansand": "Kristiansand",
  "Las Palmas": "Las Palmas",
  "Leeds": "Leeds",
  "Leiden": "Leiden",
  "Leipzig": "Leipzig",
  "Leuven": "L\u00f6wen",
  "Liberec": "Reichenberg",
  "Lille": "Lille",
  "Liverpool": "Liverpool",
  "Lublin": "Lublin",
  "Lund": "Lund",
  "Maastricht": "Maastricht",
  "Magas": "Magas",
  "Makhachkala": "Machatschkala",
  "Mannheim": "Mannheim",
  "Maykop": "Maikop",
  "Mdina": "Mdina",
  "Mechelen": "Mecheln",
  "Metz": "Metz",
  "Montpellier": "Montpellier",
  "Murcia": "Murcia",
  "Murmansk": "Murmansk",
  "M\u00fcnster": "M\u00fcnster",
  "Nalchik": "Naltschik",
  "Namur": "Namur",
  "Nancy": "Nancy",
  "Nantes": "Nantes",
  "Nazran": "Nasran",
  "Newcastle": "Newcastle upon Tyne",
  "Nijmegen": "Nimwegen",
  "Nottingham": "Nottingham",
  "Nuremberg": "N\u00fcrnberg",
  "Ostend": "Ostende",
  "Oxford": "Oxford",
  "Padua": "Padua",
  "Palermo": "Palermo",
  "Palma": "Palma",
  "Pisa": "Pisa",
  "Potsdam": "Potsdam",
  "Pula": "Pula",
  "Pyatigorsk": "Pjatigorsk",
  "Reims": "Reims",
  "Rennes": "Rennes",
  "Rhodes": "Rhodos",
  "Rimini": "Rimini",
  "Roskilde": "Roskilde",
  "Rostock": "Rostock",
  "Rovaniemi": "Rovaniemi",
  "Ryazan": "Rjasan",
  "Saint-\u00c9tienne": "Saint-\u00c9tienne",
  "Salamanca": "Salamanca",
  "Samara": "Samara",
  "San Sebasti\u00e1n": "San Sebasti\u00e1n",
  "Santiago de Compostela": "Santiago de Compostela",
  "Santorini": "Santorin",
  "Saratov": "Saratow",
  "Schaffhausen": "Schaffhausen",
  "Schwyz": "Schwyz",
  "Sheffield": "Sheffield",
  "Sibiu": "Hermannstadt",
  "Siena": "Siena",
  "Sintra": "Sintra",
  "Sochi": "Sotschi",
  "St. Moritz": "St. Moritz",
  "Stavropol": "Stawropol",
  "Strasbourg": "Stra\u00dfburg",
  "Szczecin": "Stettin",
  "Sz\u00e9kesfeh\u00e9rv\u00e1r": "Stuhlwei\u00dfenburg",
  "Thurgau": "Thurgau",
  "Ticino": "Tessin",
  "Tilburg": "Tilburg",
  "Tomsk": "Tomsk",
  "Toulon": "Toulon",
  "Trieste": "Triest",
  "Tula": "Tula",
  "Tyumen": "Tjumen",
  "Vaasa": "Vaasa",
  "Valais": "Wallis",
  "Vatican City": "Vatikanstadt",
  "Vaud": "Waadt",
  "Verona": "Verona",
  "Villach": "Villach",
  "Visby": "Visby",
  "Vladikavkaz": "Wladikawkas",
  "Vladivostok": "Wladiwostok",
  "Wels": "Wels",
  "Wichtrach": "Wichtrach",
  "Wiesbaden": "Wiesbaden",
  "W\u00fcrzburg": "W\u00fcrzburg",
  "Yaroslavl": "Jaroslawl",
  "York": "York",
  "Zadar": "Zadar",
  "Zaragoza": "Saragossa",
  "Zermatt": "Zermatt",
  "\u010cesk\u00e9 Bud\u011bjovice": "Budweis",
  "\u0141\u00f3d\u017a": "Lodz",
};

const REGION_LABELS_RU = {
  "aargau": "\u0410\u0440\u0433\u0430\u0443",
  "appenzell": "\u0410\u043f\u043f\u0435\u043d\u0446\u0435\u043b\u043b\u044c",
  "appenzell ausserrhoden": "\u0410\u043f\u043f\u0435\u043d\u0446\u0435\u043b\u043b \u0410\u0443\u0441\u0441\u0435\u0440\u0440\u043e\u0434\u0435\u043d",
  "appenzell innerrhoden": "\u0410\u043f\u043f\u0435\u043d\u0446\u0435\u043b\u043b \u0418\u043d\u043d\u0435\u0440\u0440\u043e\u0434\u0435\u043d",
  "basel": "\u0411\u0430\u0437\u0435\u043b\u044c",
  "basel-landschaft": "\u0411\u0430\u0437\u0435\u043b\u044c-\u041b\u0430\u043d\u0434",
  "basel-stadt": "\u0411\u0430\u0437\u0435\u043b\u044c-\u0428\u0442\u0430\u0434\u0442",
  "bern": "\u0411\u0435\u0440\u043d",
  "bern & oberland": "\u0411\u0435\u0440\u043d \u0438 \u041e\u0431\u0435\u0440\u043b\u0430\u043d\u0434",
  "bern area": "\u0411\u0435\u0440\u043d \u0438 \u041e\u0431\u0435\u0440\u043b\u0430\u043d\u0434",
  "berne": "\u0411\u0435\u0440\u043d",
  "chechen republic": "\u0427\u0435\u0447\u0435\u043d\u0441\u043a\u0430\u044f \u0420\u0435\u0441\u043f\u0443\u0431\u043b\u0438\u043a\u0430",
  "chechnya": "\u0427\u0435\u0447\u043d\u044f",
  "dagestan": "\u0414\u0430\u0433\u0435\u0441\u0442\u0430\u043d",
  "freiburg": "\u0424\u0440\u0438\u0431\u0443\u0440",
  "fribourg": "\u0424\u0440\u0438\u0431\u0443\u0440",
  "geneva": "\u0416\u0435\u043d\u0435\u0432\u0430",
  "genf": "\u0416\u0435\u043d\u0435\u0432\u0430",
  "gen\u00e8ve": "\u0416\u0435\u043d\u0435\u0432\u0430",
  "glarus": "\u0413\u043b\u0430\u0440\u0443\u0441",
  "graub\u00fcnden": "\u0413\u0440\u0430\u0443\u0431\u044e\u043d\u0434\u0435\u043d",
  "grisons": "\u0413\u0440\u0430\u0443\u0431\u044e\u043d\u0434\u0435\u043d",
  "ingushetia": "\u0418\u043d\u0433\u0443\u0448\u0435\u0442\u0438\u044f",
  "jura": "\u042e\u0440\u0430",
  "krasnodar": "\u041a\u0440\u0430\u0441\u043d\u043e\u0434\u0430\u0440",
  "krasnodar krai": "\u041a\u0440\u0430\u0441\u043d\u043e\u0434\u0430\u0440\u0441\u043a\u0438\u0439 \u043a\u0440\u0430\u0439",
  "lucerne": "\u041b\u044e\u0446\u0435\u0440\u043d",
  "luzern": "\u041b\u044e\u0446\u0435\u0440\u043d",
  "moscow oblast": "\u041c\u043e\u0441\u043a\u043e\u0432\u0441\u043a\u0430\u044f \u043e\u0431\u043b\u0430\u0441\u0442\u044c",
  "neuchatel": "\u041d\u0435\u0432\u0448\u0430\u0442\u0435\u043b\u044c",
  "neuch\u00e2tel": "\u041d\u0435\u0432\u0448\u0430\u0442\u0435\u043b\u044c",
  "neuenburg": "\u041d\u0435\u0432\u0448\u0430\u0442\u0435\u043b\u044c",
  "nidwalden": "\u041d\u0438\u0434\u0432\u0430\u043b\u0434\u0435\u043d",
  "obwalden": "\u041e\u0431\u0432\u0430\u043b\u044c\u0434\u0435\u043d",
  "saint petersburg": "\u0421\u0430\u043d\u043a\u0442-\u041f\u0435\u0442\u0435\u0440\u0431\u0443\u0440\u0433",
  "schaffhausen": "\u0428\u0430\u0444\u0445\u0430\u0443\u0437\u0435\u043d",
  "schwyz": "\u0428\u0432\u0438\u0446",
  "solothurn": "\u0417\u043e\u043b\u043e\u0442\u0443\u0440\u043d",
  "st gallen": "\u0421\u0430\u043d\u043a\u0442-\u0413\u0430\u043b\u043b\u0435\u043d",
  "st. gallen": "\u0421\u0430\u043d\u043a\u0442-\u0413\u0430\u043b\u043b\u0435\u043d",
  "stavropol krai": "\u0421\u0442\u0430\u0432\u0440\u043e\u043f\u043e\u043b\u044c\u0441\u043a\u0438\u0439 \u043a\u0440\u0430\u0439",
  "tatarstan": "\u0422\u0430\u0442\u0430\u0440\u0441\u0442\u0430\u043d",
  "tessin": "\u0422\u0438\u0447\u0438\u043d\u043e",
  "thurgau": "\u0422\u0443\u0440\u0433\u0430\u0443",
  "ticino": "\u0422\u0438\u0447\u0438\u043d\u043e",
  "uri": "\u0423\u0440\u0438",
  "valais": "\u0412\u0430\u043b\u0435",
  "vaud": "\u0412\u043e",
  "waadt": "\u0412\u043e",
  "wallis": "\u0412\u0430\u043b\u0435",
  "zug": "\u0426\u044e\u0433",
  "zurich": "\u0426\u044e\u0440\u0438\u0445",
  "z\u00fcrich": "\u0426\u044e\u0440\u0438\u0445",
};

const REGION_LABELS_DE = {
  "aargau": "Aargau",
  "appenzell": "Appenzell",
  "appenzell ausserrhoden": "Appenzell Ausserrhoden",
  "appenzell innerrhoden": "Appenzell Innerrhoden",
  "basel": "Basel",
  "basel-landschaft": "Basel-Landschaft",
  "basel-stadt": "Basel-Stadt",
  "bern": "Bern",
  "bern & oberland": "Bern & Oberland",
  "bern area": "Bern & Oberland",
  "berne": "Bern",
  "chechen republic": "Tschetschenien",
  "chechnya": "Tschetschenien",
  "dagestan": "Dagestan",
  "freiburg": "Freiburg",
  "fribourg": "Freiburg",
  "geneva": "Genf",
  "genf": "Genf",
  "gen\u00e8ve": "Genf",
  "glarus": "Glarus",
  "graub\u00fcnden": "Graub\u00fcnden",
  "grisons": "Graub\u00fcnden",
  "ingushetia": "Inguschetien",
  "jura": "Jura",
  "krasnodar": "Krasnodar",
  "krasnodar krai": "Region Krasnodar",
  "lucerne": "Luzern",
  "luzern": "Luzern",
  "moscow oblast": "Oblast Moskau",
  "neuchatel": "Neuenburg",
  "neuch\u00e2tel": "Neuenburg",
  "neuenburg": "Neuenburg",
  "nidwalden": "Nidwalden",
  "obwalden": "Obwalden",
  "saint petersburg": "Sankt Petersburg",
  "schaffhausen": "Schaffhausen",
  "schwyz": "Schwyz",
  "solothurn": "Solothurn",
  "st gallen": "St. Gallen",
  "st. gallen": "St. Gallen",
  "stavropol krai": "Region Stawropol",
  "tatarstan": "Tatarstan",
  "tessin": "Tessin",
  "thurgau": "Thurgau",
  "ticino": "Tessin",
  "uri": "Uri",
  "valais": "Wallis",
  "vaud": "Waadt",
  "waadt": "Waadt",
  "wallis": "Wallis",
  "zug": "Zug",
  "zurich": "Z\u00fcrich",
  "z\u00fcrich": "Z\u00fcrich",
};

const CROSS_JOIN_FILES = [
  "seed-missing-cities.sql",
  "add-switzerland-featured-cities.sql",
  "import-russia-cities.sql",
  "update-russia-rooms.sql",
];

function buildCodeToSlug(schema) {
  const map = {};
  for (const m of schema.matchAll(/\('([^']+)',\s*'([A-Z]{2})',\s*'([^']+)'/g)) {
    map[m[2]] = m[3];
  }
  return map;
}

function parseSchemaCities(schema, codeToSlug) {
  const cities = new Map();
  const re =
    /\(\(select id from countries where (?:slug = '([^']+)'|code = '([A-Z]{2})')\),\s*'((?:[^'\\]|\\.)*)',\s*'([^']+)'\)/g;
  for (const m of schema.matchAll(re)) {
    const country = m[1] || codeToSlug[m[2]];
    const name = m[3].replace(/\\'/g, "'");
    const slug = m[4];
    cities.set(`${country}/${slug}`, { country, name, slug });
  }
  return cities;
}

function parseCrossJoinCities(sql) {
  const cities = new Map();
  const blocks = sql.split(/cross join \(values/i);
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];
    const countryMatch = block.match(/where c\.slug = '([^']+)'/);
    if (!countryMatch) continue;
    const country = countryMatch[1];
    const valuesEnd = block.indexOf(") as v");
    const valuesBlock = block.slice(0, valuesEnd);
    const re = /\(\s*'((?:[^'\\]|\\.)*)',\s*'([^']+)'\s*\)/g;
    for (const m of valuesBlock.matchAll(re)) {
      const name = m[1].replace(/\\'/g, "'");
      const slug = m[2];
      cities.set(`${country}/${slug}`, { country, name, slug });
    }
  }
  return cities;
}

function parseExistingLabels(ts) {
  const ru = {};
  const de = {};
  for (const [varName, target] of [
    ["CITY_LABELS_RU", ru],
    ["CITY_LABELS_DE", de],
  ]) {
    const block = ts.split(`export const ${varName}`)[1]?.split(/^export const /m)[0] ?? "";
    for (const m of block.matchAll(/^\s+"([^"]+)":\s+"((?:\\.|[^"\\])*)",/gm)) {
      target[m[1]] = m[2].replace(/\\"/g, '"');
    }
  }
  return { ru, de };
}

function tsString(s) {
  return JSON.stringify(s);
}

function emitRecord(obj, exportName, comment) {
  const lines = Object.keys(obj)
    .sort((a, b) => a.localeCompare(b))
    .map((key) => `  ${tsString(key)}: ${tsString(obj[key])},`);
  return comment + "\n\nexport const " + exportName + ": Record<string, string> = {\n" + lines.join("\n") + "\n};\n";
}

function loadAllCities() {
  const schema = readFileSync(join(root, "database/schema.sql"), "utf8");
  const codeToSlug = buildCodeToSlug(schema);
  const cities = parseSchemaCities(schema, codeToSlug);
  for (const file of CROSS_JOIN_FILES) {
    const sql = readFileSync(join(root, "database", file), "utf8");
    for (const [key, city] of parseCrossJoinCities(sql)) {
      cities.set(key, city);
    }
  }
  return cities;
}

function main() {
  const cities = loadAllCities();
  const labelsPath = join(root, "lib/i18n/geoCityLabels.ts");
  const existing = existsSync(labelsPath)
    ? parseExistingLabels(readFileSync(labelsPath, "utf8"))
    : { ru: {}, de: {} };

  const cityLabelsRu = {};
  const cityLabelsDe = {};
  const geoNameRu = {};
  const geoNameDe = {};
  const missingRu = [];

  for (const [key, city] of [...cities.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const ru = existing.ru[key] ?? SUPPLEMENTAL_RU[city.name] ?? null;
    const de = existing.de[key] ?? SUPPLEMENTAL_DE[city.name] ?? city.name;

    if (!ru) {
      missingRu.push(`${key} (${city.name})`);
    } else {
      cityLabelsRu[key] = ru;
      cityLabelsDe[key] = de;
      geoNameRu[city.name] = ru;
      geoNameDe[city.name] = de;
    }
  }

  for (const [key, label] of Object.entries(existing.ru)) {
    const city = cities.get(key);
    if (city) {
      geoNameRu[city.name] = label;
      geoNameDe[city.name] = existing.de[key] ?? geoNameDe[city.name] ?? city.name;
    }
  }

  for (const [englishName, labels] of Object.entries(GEOCODER_ONLY_NAMES)) {
    geoNameRu[englishName] = labels.ru;
    geoNameDe[englishName] = labels.de;
  }

  if (missingRu.length > 0) {
    console.error("Missing RU translations for:", missingRu.length);
    for (const item of missingRu) console.error(" ", item);
    process.exit(1);
  }

  const i18nDir = join(root, "lib/i18n");
  writeFileSync(
    join(i18nDir, "geoCityLabels.ts"),
    emitRecord(
      cityLabelsRu,
      "CITY_LABELS_RU",
      "/** City display names for RU locale. Keys: `${countrySlug}/${citySlug}`. Generated by scripts/generateGeoLabels.mjs. */",
    ) +
      "\n" +
      emitRecord(
        cityLabelsDe,
        "CITY_LABELS_DE",
        "/** City display names for DE locale. Keys: `${countrySlug}/${citySlug}`. Generated by scripts/generateGeoLabels.mjs. */",
      ),
    "utf8",
  );

  writeFileSync(
    join(i18nDir, "geoNameTranslationsRu.ts"),
    emitRecord(
      geoNameRu,
      "GEO_NAME_RU",
      "/** English city/region name -> Russian display label. Generated by scripts/generateGeoLabels.mjs. */",
    ),
    "utf8",
  );

  writeFileSync(
    join(i18nDir, "geoNameTranslationsDe.ts"),
    emitRecord(
      geoNameDe,
      "GEO_NAME_DE",
      "/** English city/region name -> German display label. Generated by scripts/generateGeoLabels.mjs. */",
    ),
    "utf8",
  );

  writeFileSync(
    join(i18nDir, "geoRegionLabels.ts"),
    emitRecord(
      REGION_LABELS_RU,
      "REGION_LABELS_RU",
      "/** Region/canton labels for RU locale. Keys: lowercase normalized English names. Generated by scripts/generateGeoLabels.mjs. */",
    ) +
      "\n" +
      emitRecord(
        REGION_LABELS_DE,
        "REGION_LABELS_DE",
        "/** Region/canton labels for DE locale. Keys: lowercase normalized English names. Generated by scripts/generateGeoLabels.mjs. */",
      ),
    "utf8",
  );

  console.log(`Generated geo labels for ${cities.size} cities (${Object.keys(SUPPLEMENTAL_RU).length} supplemental names).`);
  console.log("  lib/i18n/geoCityLabels.ts");
  console.log("  lib/i18n/geoNameTranslationsRu.ts");
  console.log("  lib/i18n/geoNameTranslationsDe.ts");
  console.log("  lib/i18n/geoRegionLabels.ts");
  console.log("Missing RU translations: 0");
}

main();
