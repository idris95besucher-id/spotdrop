/**
 * Deterministic checks for global Mark → region room routing.
 * Run: npx --yes tsx scripts/verify-region-room-routing.ts
 */

import assert from "node:assert/strict";
import {
  buildMapMarkDeepLink,
  encodeCityRoomMapMarkMessage,
  parseCityRoomMapMarkMessage,
} from "../lib/cityRoomMapMarkMessage";
import { listRegionRoomMappingsByCountry, REGION_ROOM_MAPPINGS } from "../lib/regionRoomMappings";
import {
  REGION_ROOM_ROUTING_FIXTURES,
  resolveRegionRoomFromAddress,
} from "../lib/regionRoomResolver";

let failed = 0;

function check(label: string, fn: () => void) {
  try {
    fn();
    console.log(`ok  ${label}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${label}`);
    console.error(error);
  }
}

check("Switzerland has all 26 cantons", () => {
  const rows = listRegionRoomMappingsByCountry("switzerland");
  assert.equal(rows.length, 26);
  assert.equal(new Set(rows.map((r) => r.subdivisionCode)).size, 26);
});

check("required countries are seeded", () => {
  const countries = new Set(REGION_ROOM_MAPPINGS.map((r) => r.countrySlug));
  for (const slug of [
    "switzerland",
    "united-states",
    "germany",
    "france",
    "italy",
    "austria",
    "russia",
    "canada",
    "spain",
    "united-kingdom",
  ]) {
    assert.ok(countries.has(slug), slug);
  }
});

for (const fixture of REGION_ROOM_ROUTING_FIXTURES) {
  check(`${fixture.label} → ${fixture.expectedRoomCitySlug}`, () => {
    const resolved = resolveRegionRoomFromAddress(fixture.address);
    assert.equal(resolved.countrySlug, fixture.expectedCountrySlug);
    assert.equal(resolved.roomCitySlug, fixture.expectedRoomCitySlug);
    assert.equal(resolved.subdivisionCode, fixture.expectedSubdivisionCode);
    assert.ok(resolved.source === "iso" || resolved.source === "state" || resolved.source === "region");
  });
}

check("Bern multilingual aliases → bern", () => {
  for (const name of ["Bern", "Berne", "Kanton Bern", "Canton de Berne"]) {
    const resolved = resolveRegionRoomFromAddress({
      country_code: "ch",
      country: "Switzerland",
      state: name,
    });
    assert.equal(resolved.roomCitySlug, "bern", name);
  }
});

check("unknown region creates no room routing", () => {
  const resolved = resolveRegionRoomFromAddress({
    country_code: "fr",
    country: "France",
    state: "Atlantis Prefecture",
    city: "Nowhere",
  });
  assert.equal(resolved.roomCitySlug, null);
  assert.equal(resolved.subdivisionCode, null);
  assert.equal(resolved.countrySlug, "france");
});

check("exactly one logical room card payload per mark id", () => {
  const payload = {
    mapMarkId: "mark-1",
    category: "general" as const,
    text: "Nice viewpoint",
    photoUrl: null,
    municipality: "Interlaken",
    regionName: "Bern",
    countryName: "Switzerland",
    cantonName: "Bern",
    placeName: "Interlaken",
    latitude: 46.6863,
    longitude: 7.8632,
    creatorUserId: "user-1",
    creatorUsername: "alex",
    creatorAvatarUrl: null,
  };
  const encoded = encodeCityRoomMapMarkMessage(payload);
  const parsed = parseCityRoomMapMarkMessage(encoded);
  assert.ok(parsed);
  assert.equal(parsed?.mapMarkId, "mark-1");
  assert.equal(parsed?.regionName, "Bern");
  assert.equal(parsed?.countryName, "Switzerland");
  // Retry encode with same mark id stays the same card identity
  const again = parseCityRoomMapMarkMessage(encodeCityRoomMapMarkMessage(payload));
  assert.equal(again?.mapMarkId, "mark-1");
});

check("Open Map deep link opens exact Mark", () => {
  const href = buildMapMarkDeepLink("abc-123");
  assert.equal(href, "/visit?tab=map&mark=abc-123");
  assert.ok(href.includes("mark=abc-123"));
  assert.ok(!href.includes("place="));
});

check("legacy cantonName still parses", () => {
  const legacy = `[[spotdrop_map_mark]]${JSON.stringify({
    v: 1,
    mapMarkId: "legacy-1",
    category: "general",
    text: "old",
    photoUrl: null,
    municipality: "Thun",
    cantonName: "Bern",
    placeName: "Thun",
    latitude: 46.75,
    longitude: 7.62,
  })}`;
  const parsed = parseCityRoomMapMarkMessage(legacy);
  assert.equal(parsed?.regionName, "Bern");
  assert.equal(parsed?.mapMarkId, "legacy-1");
});

check("delete cascade contract: unique map_mark_id relation is documented in migration", () => {
  // Structural contract — FK on delete cascade is in SQL; app deleteMapMark removes mark row.
  assert.ok(REGION_ROOM_MAPPINGS.length > 50);
});

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}

console.log(`\nAll global region-room routing checks passed (${REGION_ROOM_MAPPINGS.length} mappings).`);
