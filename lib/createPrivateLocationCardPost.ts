import { addSpotToCollection, type CollectionWithMeta } from "@/lib/collections";
import { canonicalizeGeoLocationFields } from "@/lib/i18n/canonicalGeo";
import { normalizePostId } from "@/lib/postIds";
import { uploadPostMedia } from "@/lib/postMedia";
import { resolveSpotName } from "@/lib/spotPublish";
import { renderSpotLocationCardFile } from "@/lib/renderSpotLocationCard";
import { spotLocationCardContent } from "@/lib/spotLocationCard";
import type { SpotLocationCardFontStyle } from "@/lib/spotLocationCardStyles";
import type { SpotGeoLocation } from "@/lib/spotLocation";
import { supabase } from "@/lib/supabaseClient";

export type CreatePrivateLocationCardPostInput = {
  userId: string;
  cardText: string;
  fontStyle: SpotLocationCardFontStyle;
  locationLabel: string;
  location: SpotGeoLocation;
  cardFile?: File;
};

function isMissingVideoCoverColumn(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";

  return error?.code === "42703" && message.includes("video_cover_url");
}

function isMissingPublishedToSpotsColumn(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";

  return error?.code === "42703" && message.includes("published_to_spots");
}

function isMissingSpotGpsMetaColumn(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";

  return (
    error?.code === "42703" &&
    (message.includes("spot_accuracy") ||
      message.includes("spot_captured_at") ||
      message.includes("spot_speed") ||
      message.includes("spot_heading"))
  );
}

async function fetchInsertedPost(userId: string, mediaUrl: string) {
  const { data, error } = await supabase
    .from("posts")
    .select("id")
    .eq("user_id", userId)
    .eq("media_url", mediaUrl)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return { data, error };
}

/** Private location card post — excluded from map, search, and public profile grid. */
export async function createPrivateLocationCardPost(input: CreatePrivateLocationCardPostInput) {
  const cardFile =
    input.cardFile ??
    (await renderSpotLocationCardFile({
      cardText: input.cardText,
      fontStyle: input.fontStyle,
      locationLabel: input.locationLabel,
    }));

  const upload = await uploadPostMedia(input.userId, cardFile, { skipVerification: true });
  const canonicalLocation = canonicalizeGeoLocationFields(input.location);

  const row = {
    user_id: input.userId,
    content: spotLocationCardContent(),
    spot_name: resolveSpotName(input.cardText),
    visibility: "private" as const,
    published_to_spots: false,
    content_kind: "spot" as const,
    media_url: upload.mediaUrl,
    media_type: "image" as const,
    image_url: upload.mediaUrl,
    video_url: null,
    video_cover_url: upload.mediaUrl,
    thumbnail_url: upload.mediaUrl,
    spot_latitude: input.location.latitude,
    spot_longitude: input.location.longitude,
    spot_address: input.location.address,
    spot_city: canonicalLocation.city,
    spot_country: canonicalLocation.country,
    spot_accuracy: input.location.accuracy ?? null,
    spot_captured_at:
      input.location.capturedAt != null
        ? new Date(input.location.capturedAt).toISOString()
        : null,
    spot_speed: input.location.speed ?? null,
    spot_heading: input.location.heading ?? null,
  };

  let insertRow: Record<string, unknown> = { ...row };
  let { error: insertError } = await supabase.from("posts").insert(insertRow);

  if (insertError && isMissingVideoCoverColumn(insertError)) {
    const { video_cover_url: _videoCover, thumbnail_url: _thumb, ...legacyRow } = row;
    insertRow = legacyRow;
    ({ error: insertError } = await supabase.from("posts").insert(legacyRow));
  }

  if (insertError && isMissingPublishedToSpotsColumn(insertError)) {
    const { published_to_spots: _published, ...withoutPublished } = insertRow;
    insertRow = withoutPublished;
    ({ error: insertError } = await supabase.from("posts").insert(withoutPublished));
  }

  if (insertError && isMissingSpotGpsMetaColumn(insertError)) {
    const {
      spot_accuracy: _accuracy,
      spot_captured_at: _capturedAt,
      spot_speed: _speed,
      spot_heading: _heading,
      ...withoutGpsMeta
    } = insertRow;
    insertRow = withoutGpsMeta;
    ({ error: insertError } = await supabase.from("posts").insert(withoutGpsMeta));
  }

  if (insertError) {
    return { postId: null, error: insertError.message || "Unable to save card." };
  }

  const { data, error: fetchError } = await fetchInsertedPost(input.userId, upload.mediaUrl);

  if (fetchError) {
    return { postId: null, error: fetchError.message || "Unable to save card." };
  }

  const postId = normalizePostId(data?.id);

  if (!postId) {
    return { postId: null, error: "Unable to save card." };
  }

  return { postId, error: null };
}

export function findMySpotsCollection(
  collections: CollectionWithMeta[],
  mySpotsLabel: string
): CollectionWithMeta | null {
  const normalizedLabel = mySpotsLabel.trim().toLowerCase();

  return (
    collections.find((collection) => collection.name.trim().toLowerCase() === normalizedLabel) ??
    collections.find((collection) => collection.name.trim().toLowerCase() === "my spots") ??
    collections.find((collection) => collection.visibility === "private") ??
    null
  );
}

/** Private Text Card for a collection — never published to feed, map, or search. */
export async function savePrivateLocationCardToCollection(
  input: CreatePrivateLocationCardPostInput & {
    collectionId: string;
    /** When true (map Create Text Card), also publish the card as a public map pin. */
    publishToMap?: boolean;
  }
) {
  const created = await createPrivateLocationCardPost(input);

  if (!created.postId) {
    return created;
  }

  const added = await addSpotToCollection(input.collectionId, created.postId, input.userId);

  if (added.error) {
    return { postId: created.postId, error: added.error };
  }

  if (input.publishToMap) {
    const postId = normalizePostId(created.postId);

    if (postId) {
      const { error: publishError } = await supabase
        .from("posts")
        .update({
          visibility: "public",
          published_to_spots: true,
        })
        .eq("id", postId)
        .eq("user_id", input.userId);

      if (publishError) {
        return { postId: created.postId, error: publishError.message };
      }
    }
  }

  return { postId: created.postId, error: null };
}

/** @deprecated Use savePrivateLocationCardToCollection */
export async function savePrivateLocationCardToMySpots(
  input: CreatePrivateLocationCardPostInput & {
    mySpotsCollectionId: string;
  }
) {
  return savePrivateLocationCardToCollection({
    ...input,
    collectionId: input.mySpotsCollectionId,
  });
}
