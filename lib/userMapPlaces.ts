import { canonicalizeGeoLocationFields } from "@/lib/i18n/canonicalGeo";
import type { SpotGeoLocation } from "@/lib/spotLocation";
import { supabase } from "@/lib/supabaseClient";

/** ~1.1m — used for duplicate prevention at the same map tap. */
const COORD_KEY_DECIMALS = 5;

export type UserMapPlaceRow = {
  id: string;
  user_id: string;
  latitude: number;
  longitude: number;
  coord_key: string;
  name: string;
  address: string | null;
  city: string | null;
  country: string | null;
  created_at: string;
};

export function mapPlaceCoordKey(latitude: number, longitude: number) {
  return `${latitude.toFixed(COORD_KEY_DECIMALS)},${longitude.toFixed(COORD_KEY_DECIMALS)}`;
}

function placeNameFromLocation(location: SpotGeoLocation, fallback: string) {
  const address = location.address?.trim();

  if (address) {
    const short = address
      .split(",")
      .slice(0, 2)
      .map((part) => part.trim())
      .filter(Boolean)
      .join(", ");

    if (short) {
      return short;
    }
  }

  const city = location.city?.trim();
  const country = location.country?.trim();

  if (city && country) {
    return `${city}, ${country}`;
  }

  if (city) {
    return city;
  }

  if (country) {
    return country;
  }

  return fallback;
}

function placeInsertRow(userId: string, location: SpotGeoLocation, fallbackName: string) {
  const canonical = canonicalizeGeoLocationFields(location);
  const name = placeNameFromLocation(
    {
      ...location,
      city: canonical.city,
      country: canonical.country,
    },
    fallbackName
  );

  return {
    user_id: userId,
    latitude: location.latitude,
    longitude: location.longitude,
    coord_key: mapPlaceCoordKey(location.latitude, location.longitude),
    name,
    address: location.address?.trim() || null,
    city: canonical.city,
    country: canonical.country,
  };
}

function isUniqueViolation(error: { code?: string } | null) {
  return error?.code === "23505";
}

function isMissingTable(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "42P01" || message.includes("does not exist");
}

export async function saveUserMapPlace(userId: string, location: SpotGeoLocation, fallbackName: string) {
  const row = placeInsertRow(userId, location, fallbackName);

  const { data, error } = await supabase
    .from("user_saved_places")
    .upsert(row, { onConflict: "user_id,coord_key", ignoreDuplicates: true })
    .select("id,user_id,latitude,longitude,coord_key,name,address,city,country,created_at")
    .maybeSingle();

  if (error) {
    if (isMissingTable(error)) {
      return { place: null as UserMapPlaceRow | null, alreadySaved: false, error: "TABLE_MISSING" as const };
    }

    if (isUniqueViolation(error)) {
      return { place: null as UserMapPlaceRow | null, alreadySaved: true, error: null };
    }

    return { place: null as UserMapPlaceRow | null, alreadySaved: false, error: error.message };
  }

  // ignoreDuplicates upsert returns null when the row already existed.
  if (!data) {
    return { place: null as UserMapPlaceRow | null, alreadySaved: true, error: null };
  }

  return { place: data as UserMapPlaceRow, alreadySaved: false, error: null };
}

export async function markUserMapPlace(userId: string, location: SpotGeoLocation, fallbackName: string) {
  const row = placeInsertRow(userId, location, fallbackName);

  const { data, error } = await supabase
    .from("user_map_markers")
    .upsert(row, { onConflict: "user_id,coord_key", ignoreDuplicates: true })
    .select("id,user_id,latitude,longitude,coord_key,name,address,city,country,created_at")
    .maybeSingle();

  if (error) {
    if (isMissingTable(error)) {
      return { marker: null as UserMapPlaceRow | null, alreadyMarked: false, error: "TABLE_MISSING" as const };
    }

    if (isUniqueViolation(error)) {
      return { marker: null as UserMapPlaceRow | null, alreadyMarked: true, error: null };
    }

    return { marker: null as UserMapPlaceRow | null, alreadyMarked: false, error: error.message };
  }

  if (!data) {
    return { marker: null as UserMapPlaceRow | null, alreadyMarked: true, error: null };
  }

  return { marker: data as UserMapPlaceRow, alreadyMarked: false, error: null };
}

export async function loadUserMapMarkers(userId: string) {
  const { data, error } = await supabase
    .from("user_map_markers")
    .select("id,user_id,latitude,longitude,coord_key,name,address,city,country,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    if (isMissingTable(error)) {
      return { markers: [] as UserMapPlaceRow[], error: "TABLE_MISSING" as const };
    }

    return { markers: [] as UserMapPlaceRow[], error: error.message };
  }

  return { markers: (data ?? []) as UserMapPlaceRow[], error: null };
}
