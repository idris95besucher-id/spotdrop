type SupabaseQueryError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
  status?: number;
} | null;

type SpotLoadRowSnapshot = {
  id?: unknown;
  user_id?: unknown;
  content_kind?: unknown;
  spot_name?: unknown;
  media_url?: unknown;
  video_url?: unknown;
  image_url?: unknown;
  thumbnail_url?: unknown;
  video_cover_url?: unknown;
  media_type?: unknown;
} | null;

function summarizeSpotRow(row: SpotLoadRowSnapshot) {
  if (!row) {
    return null;
  }

  return {
    id: row.id ?? null,
    user_id: row.user_id ?? null,
    content_kind: row.content_kind ?? null,
    spot_name: row.spot_name ?? null,
    media_url: row.media_url ?? null,
    video_url: row.video_url ?? null,
    image_url: row.image_url ?? null,
    thumbnail_url: row.thumbnail_url ?? null,
    video_cover_url: row.video_cover_url ?? null,
    media_type: row.media_type ?? null,
  };
}

/** Explain empty .single() results — wrong id, RLS, deleted row, etc. */
export function describeSpotQueryFailure(
  error: SupabaseQueryError,
  hasRow: boolean
) {
  if (hasRow) {
    return null;
  }

  if (!error) {
    return "query returned no error but row is null — unexpected empty result";
  }

  const code = error.code ?? "";
  const message = (error.message ?? "").toLowerCase();

  if (code === "PGRST116" || message.includes("0 rows")) {
    return "no rows — wrong spotId, post deleted, or RLS hid the row (.single() on empty set)";
  }

  if (code === "42501" || message.includes("permission denied")) {
    return "RLS / permission denied — authenticated user cannot read this posts row";
  }

  if (code === "22P02" || message.includes("invalid input syntax")) {
    return "wrong spotId format — id type does not match posts.id column";
  }

  if (code === "42703" || message.includes("does not exist")) {
    return "query failure — selected column or relation missing in schema";
  }

  if (code === "PGRST200" || message.includes("foreign key")) {
    return "query failure — join/embed relation missing (e.g. profiles, guide_places)";
  }

  return `query failure — code=${code || "unknown"} message=${error.message ?? "none"}`;
}

export function logSpotLoadQueryStart(
  context: string,
  receivedSpotId: string,
  queryId: string | number
) {
  console.log("[Spot load] query start", {
    context,
    receivedSpotId,
    queryId,
  });
}

export function logSpotLoadQueryResult(options: {
  context: string;
  receivedSpotId: string;
  queryId: string | number;
  data: SpotLoadRowSnapshot;
  error: SupabaseQueryError;
  select?: string;
}) {
  const { context, receivedSpotId, queryId, data, error, select } = options;
  const returnedRow = summarizeSpotRow(data);
  const hasRow = returnedRow !== null;
  const noRowReason = describeSpotQueryFailure(error, hasRow);

  const payload = {
    context,
    receivedSpotId,
    queryId,
    select: select ?? "posts *",
    errorCode: error?.code ?? null,
    errorMessage: error?.message ?? null,
    errorDetails: error?.details ?? null,
    errorHint: error?.hint ?? null,
    errorStatus: error?.status ?? null,
    hasRow,
    returnedRow,
    noRowReason,
  };

  if (error || !hasRow) {
    console.error("[Spot load] query result — FAILED", payload);
    return;
  }

  console.log("[Spot load] query result — OK", payload);
}

export function logSpotLoadUiFailure(
  context: string,
  reason: string,
  details: Record<string, unknown>
) {
  console.error("[Spot load] UI showing load failure", {
    context,
    reason,
    ...details,
  });
}
