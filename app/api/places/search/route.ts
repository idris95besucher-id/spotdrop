import { NextResponse } from "next/server";
import type { PlaceSearchHit } from "@/lib/placeSearchApi";
import {
  listBrowseCityRoomPlaces,
  listFeaturedCityRoomPlaces,
  resolveScopeFromRequest,
  searchGeneralCityRoomPlaces,
} from "@/lib/cityRoomPlacesSearch";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  const featured = url.searchParams.get("featured") === "1";
  const browse = url.searchParams.get("browse") === "1";
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? (browse ? "24" : "8")), 1), 24);

  if (!featured && !browse && query.length < 2) {
    return NextResponse.json({ results: [] as PlaceSearchHit[] });
  }

  const countrySlug = url.searchParams.get("countrySlug")?.trim() ?? "";
  const countryName = url.searchParams.get("countryName")?.trim() ?? "";
  const citySlug = url.searchParams.get("citySlug")?.trim() ?? "";
  const cityName = url.searchParams.get("cityName")?.trim() ?? "";
  const region = url.searchParams.get("region")?.trim() || null;

  if (!countrySlug || !citySlug || !cityName) {
    return NextResponse.json({ error: "City room context is required." }, { status: 400 });
  }

  const scope = await resolveScopeFromRequest({
    countrySlug,
    countryName: countryName || countrySlug,
    citySlug,
    cityName,
    region,
  });

  if (!scope) {
    return NextResponse.json(
      { error: `Unable to locate ${cityName} for places to visit.` },
      { status: 400 }
    );
  }

  const googleKey = process.env.GOOGLE_PLACES_API_KEY?.trim() ?? null;

  try {
    if (browse) {
      const { results, usingFallback } = await listBrowseCityRoomPlaces({ limit, scope, googleKey });

      return NextResponse.json({
        results,
        usingFallback,
        provider: "curated",
      });
    }

    const results = featured
      ? await listFeaturedCityRoomPlaces({ limit, scope, googleKey })
      : await searchGeneralCityRoomPlaces({ query, limit, scope, googleKey });

    return NextResponse.json({
      results,
      provider: featured ? "featured" : googleKey ? "google-or-open-data" : "open-data",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Place search failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
