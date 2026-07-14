import assert from "node:assert/strict";

const STREET_ADDRESS_TYPES = new Set([
  "road",
  "pedestrian",
  "path",
  "footway",
  "cycleway",
  "living_street",
  "residential",
  "service",
  "track",
  "street",
  "highway",
  "primary",
  "secondary",
  "tertiary",
  "unclassified",
]);

const COARSE_ADDRESS_TYPES = new Set([
  "suburb",
  "neighbourhood",
  "quarter",
  "city",
  "town",
  "village",
  "municipality",
  "county",
  "state",
  "country",
  "region",
  "district",
  "city_district",
  "borough",
  "administrative",
]);

const STREET_NAME_FIELDS = ["road", "pedestrian", "path", "footway", "cycleway", "street"];

function normalizePart(value) {
  const trimmed = value?.trim();
  return trimmed || null;
}

function streetCandidateFromAddress(address) {
  if (!address) return null;
  for (const field of STREET_NAME_FIELDS) {
    const value = normalizePart(address[field]);
    if (value) return value;
  }
  return null;
}

function isCoarseAdminResult(data) {
  const addresstype = (data.addresstype ?? "").toLowerCase();
  const category = (data.category ?? "").toLowerCase();
  if (COARSE_ADDRESS_TYPES.has(addresstype)) return true;
  return category === "boundary" || category === "place";
}

function isStreetLevelFeature(data) {
  const addresstype = (data.addresstype ?? "").toLowerCase();
  const category = (data.category ?? "").toLowerCase();
  const type = (data.type ?? "").toLowerCase();
  if (STREET_ADDRESS_TYPES.has(addresstype) || STREET_ADDRESS_TYPES.has(type)) return true;
  return category === "highway";
}

function extractConfidentStreetName(data) {
  if (isCoarseAdminResult(data)) return null;
  const featureName = normalizePart(data.name);
  const type = (data.type ?? "").toLowerCase();
  const addresstype = (data.addresstype ?? "").toLowerCase();
  if (
    featureName &&
    (type === "path" ||
      type === "footway" ||
      type === "track" ||
      type === "pedestrian" ||
      addresstype === "path" ||
      addresstype === "pedestrian")
  ) {
    return featureName;
  }
  const fromAddress = streetCandidateFromAddress(data.address);
  if (fromAddress) return fromAddress;
  if (isStreetLevelFeature(data)) return featureName;
  return null;
}

function isLikelyFullGeocodeDisplayName(address) {
  const trimmed = address?.trim();
  if (!trimmed) return false;
  return trimmed.split(",").map((p) => p.trim()).filter(Boolean).length >= 3;
}

function getDisplayStreetName(address) {
  const trimmed = address?.trim();
  if (!trimmed || isLikelyFullGeocodeDisplayName(trimmed)) return null;
  return trimmed;
}

assert.equal(
  extractConfidentStreetName({
    addresstype: "suburb",
    category: "place",
    type: "suburb",
    display_name: "Bernstrasse, Köniz, Bern-Mittelland Administrative District, Bern, Switzerland",
    address: {
      road: "Bernstrasse",
      suburb: "Liebefeld",
      town: "Köniz",
      country: "Switzerland",
    },
  }),
  null
);

assert.equal(
  extractConfidentStreetName({
    addresstype: "amenity",
    category: "amenity",
    type: "parking",
    name: "",
    address: {
      road: "Sonnenweg",
      town: "Köniz",
      country: "Switzerland",
    },
  }),
  "Sonnenweg"
);

assert.equal(
  extractConfidentStreetName({
    name: "Brauchbühlhölzli",
    addresstype: "path",
    category: "highway",
    type: "path",
    address: {
      path: "Brauchbühlhölzli",
      road: "Bernstrasse",
      town: "Köniz",
      country: "Switzerland",
    },
  }),
  "Brauchbühlhölzli"
);

assert.equal(
  extractConfidentStreetName({
    name: "Marktgasse",
    addresstype: "road",
    category: "highway",
    type: "residential",
    address: { road: "Marktgasse", city: "Bern", country: "Switzerland" },
  }),
  "Marktgasse"
);

assert.equal(
  isLikelyFullGeocodeDisplayName(
    "Bernstrasse, Köniz, Bern-Mittelland Administrative District, Bern, Switzerland"
  ),
  true
);
assert.equal(getDisplayStreetName("Bernstrasse"), "Bernstrasse");
assert.equal(
  getDisplayStreetName(
    "Bernstrasse, Köniz, Bern-Mittelland Administrative District, Bern, Switzerland"
  ),
  null
);

console.log("spotStreetName checks passed");
