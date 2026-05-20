export type GuidePlace = {
  id?: string;
  post_id?: string;
  title: string;
  location_name?: string | null;
  canton?: string | null;
  city?: string | null;
  description?: string | null;
  opening_hours?: string | null;
  price_info?: string | null;
  official_url?: string | null;
  read_more_text?: string | null;
  media_url?: string | null;
  media_type?: string | null;
  source_url?: string | null;
};

export function normalizeGuidePlace(value: GuidePlace | GuidePlace[] | null | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

export function isGuidePlaceRelationMissing(error: { code?: string; message?: string } | null | undefined) {
  if (!error) {
    return false;
  }

  return (
    error.code === "42703" ||
    error.code === "42P01" ||
    error.code === "PGRST200" ||
    error.message?.toLowerCase().includes("guide_places") === true
  );
}
