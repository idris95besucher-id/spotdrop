import { canonicalizeGeoLocationFields } from "@/lib/i18n/canonicalGeo";
import {
  BERN_DISCOVERY_PLACES_FALLBACK,
  BERN_DISCOVERY_REGION_SLUG,
  BERN_MAP_BOUNDS,
  type DiscoveryPlace,
  type MapBounds,
} from "@/lib/discoveryMap";
import { formatSpotLocationDisplay } from "@/lib/spotLocationDisplay";
import { spotLocationCardContent } from "@/lib/spotLocationCard";
import { haversineKm, type SpotGeoLocation } from "@/lib/spotLocation";
import { hasSpotPublishLocation, resolveSpotName, SPOT_LOCATION_REQUIRED_MESSAGE } from "@/lib/spotPublish";
import { POST_AUTHOR_PROFILES_INNER } from "@/lib/posts";
import { insertPostMediaCarouselItems } from "@/lib/postMediaItems";
import { uploadPostMedia, POST_MEDIA_BUCKET } from "@/lib/postMedia";
import type { RetryAttemptInfo } from "@/lib/uploadRetry";
import { uploadNativeSpotVideo } from "@/lib/spotDropCamera";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabaseClient";
import { getFreshAccessToken } from "@/lib/storageUpload";
import { postIdForQuery } from "@/lib/postIds";
import {
  logSpotPublishPostMediaItemsInsertResult,
  logSpotPublishUploadedMediaItems,
} from "@/lib/spotMediaLog";
import {
  logSpotPublish,
  logSpotPublishStage,
  mapPublishPercent,
  SPOT_PUBLISH_MEDIA_ITEMS_TIMEOUT_MS,
  SPOT_PUBLISH_POST_INSERT_TIMEOUT_MS,
  type SpotPublishStage,
  withSpotPublishTimeout,
} from "@/lib/spotPublishProgress";
import { resolveVideoCoverFile } from "@/lib/videoCover";
import { timeUploadStep } from "@/lib/spotUploadTiming";
import { isGuideAccountUsername, publicProfileUsername } from "@/lib/publicProfile";
import { addSpotToCollection, loadCollectionById, spotVisibilityForCollection } from "@/lib/collections";
import { removeStorageObjectsForUrls } from "@/lib/deleteContent";
import { SPOT_MAX_PHOTOS } from "@/lib/spotMaxPhotos";
import { checkSpotPhotoModeration, SPOT_PHOTO_REJECTED_MESSAGE } from "@/lib/spotPhotoModeration";
import {
  logSpotPublishStep,
  spotPublishFail,
} from "@/lib/spotPublishError";
import { supabase } from "@/lib/supabaseClient";

export type MapSpotPin = {
  id: string;
  user_id: string;
  username: string;
  avatar_url: string | null;
  is_verified: boolean | null;
  latitude: number;
  longitude: number;
  spot_name: string | null;
  spot_address: string | null;
  spot_city: string | null;
  spot_country: string | null;
  label: string;
  location_line: string | null;
  content: string | null;
  created_at: string | null;
  media_url: string | null;
  media_type: "image" | "video" | null;
  video_cover_url: string | null;
  thumbnail_url: string | null;
  discovery_place_id: string | null;
  visited_count: number;
};

const MAP_SPOT_SELECT =
  `id, user_id, content, created_at, media_url, media_type, image_url, video_cover_url, thumbnail_url, spot_name, spot_latitude, spot_longitude, spot_address, spot_city, spot_country, discovery_place_id, visited_count, discovery_places(name), ${POST_AUTHOR_PROFILES_INNER}(username, avatar_url, is_private, is_demo, is_verified)`;

const MAP_SPOT_SELECT_LEGACY =
  `id, user_id, content, created_at, media_url, media_type, image_url, thumbnail_url, spot_name, spot_latitude, spot_longitude, spot_address, spot_city, spot_country, discovery_place_id, ${POST_AUTHOR_PROFILES_INNER}(username, avatar_url, is_private, is_demo, is_verified)`;

export type CreateSpotInput = {
  userId: string;
  file: File;
  mediaType: "image" | "video";
  spotName: string;
  location: SpotGeoLocation;
  /** Spots are always public for place discovery. */
  visibility?: "public";
  /** When user picks a map place manually, link this discovery place directly. */
  manualPlaceId?: string | null;
  /** JPEG frame chosen as video poster (videos only). */
  coverFile?: File | null;
  /** Optional collection to add this spot into after publish. */
  collectionId?: string | null;
  /** Skip discovery_regions query when places were preloaded in the camera flow. */
  discoveryPlaces?: DiscoveryPlace[];
  /** When publishing a carousel Spot, all prepared files in order (includes primary). */
  carouselPreparedItems?: Array<{
    file: File;
    mediaType: "image" | "video";
    coverFile?: File | null;
    audioMuted?: boolean;
    /** Absolute iOS path — video uploads via native URLSession (no JS File bytes). */
    nativeFilePath?: string | null;
    nativeFileSizeBytes?: number | null;
  }>;
  accessToken?: string;
  /** "My Spots" destination — private to the owner, independent of the collections system. */
  publishToMySpots?: boolean;
  /** Ties every upload log line for this publish back to one attempt — see lib/uploadLifecycleTrace.ts. */
  requestId?: string;
  /** Cancels in-flight uploads (and any pending retry backoff) — a real publish timeout or the user leaving the screen. */
  signal?: AbortSignal;
  /** Fired before each automatic upload retry so the UI can show retry status without losing progress. */
  onUploadRetry?: (info: RetryAttemptInfo) => void;
  onMediaUploadProgress?: (percent: number) => void;
  onCoverUploadProgress?: (percent: number) => void;
  onPublishStage?: (stage: SpotPublishStage, percent: number) => void;
  onTiming?: (phase: "thumbnail" | "storage" | "postInsert", durationMs: number) => void;
  /** Generated SpotDrop location card (text-only spot). */
  locationCard?: boolean;
  /** Optional user caption — stored in posts.content. */
  caption?: string;
  /**
   * User left the caption to SpotDrop's AI (the "Write myself" toggle was
   * off). Only takes effect when there's no manual caption, this isn't a
   * location card, and the Spot is publishing to public Spots — matching the
   * same scope as photo moderation below. See database/add-ai-post-captions.sql.
   */
  autoCaption?: boolean;
};

export type CreateGeoSpotResult = {
  postId: string | null;
  matchedPlace: DiscoveryPlace | null;
  error: string | null;
  carouselWarning?: string | null;
  failedPhotoIndex?: number | null;
  /** Classifies `error` for UI messaging (no internet / timeout / auth expired / etc.) — see lib/storageUpload.ts. */
  errorKind?: string | null;
};

const NEAREST_PLACE_KM = 8;

function isMissingSpotColumns(error: { code?: string; message?: string } | null) {
  if (!error) {
    return false;
  }

  const message = error.message?.toLowerCase() ?? "";

  return (
    error.code === "42703" &&
    (message.includes("spot_latitude") ||
      message.includes("spot_longitude") ||
      message.includes("spot_address") ||
      message.includes("spot_city") ||
      message.includes("spot_country") ||
      message.includes("discovery_place_id"))
  );
}

function isMissingSpotNameColumn(error: { code?: string; message?: string } | null) {
  if (!error) {
    return false;
  }

  return error.code === "42703" && (error.message?.toLowerCase().includes("spot_name") ?? false);
}

export async function loadDiscoveryPlacesForMatching(): Promise<DiscoveryPlace[]> {
  const { data: region } = await supabase
    .from("discovery_regions")
    .select("id")
    .eq("slug", BERN_DISCOVERY_REGION_SLUG)
    .maybeSingle();

  if (!region?.id) {
    return BERN_DISCOVERY_PLACES_FALLBACK.map((place, index) => ({
      ...place,
      id: `fallback-${place.slug}`,
      region_id: "fallback-region",
      sort_order: place.sort_order || (index + 1) * 10,
    }));
  }

  const { data, error } = await supabase
    .from("discovery_places")
    .select("id, region_id, slug, name, category, latitude, longitude, short_description, official_summary, hero_image_url, official_url, sort_order")
    .eq("region_id", region.id);

  if (error || !data?.length) {
    return BERN_DISCOVERY_PLACES_FALLBACK.map((place, index) => ({
      ...place,
      id: `fallback-${place.slug}`,
      region_id: region.id,
      sort_order: place.sort_order || (index + 1) * 10,
    }));
  }

  return data.map((row) => ({
    id: String(row.id),
    region_id: String(row.region_id),
    slug: String(row.slug),
    name: String(row.name),
    category: row.category as DiscoveryPlace["category"],
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    short_description: row.short_description ?? null,
    official_summary: row.official_summary ?? null,
    hero_image_url: row.hero_image_url ?? null,
    official_url: row.official_url ?? null,
    sort_order: Number(row.sort_order ?? 0),
  }));
}

export function findNearestDiscoveryPlace(location: SpotGeoLocation, places: DiscoveryPlace[]) {
  let nearest: DiscoveryPlace | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const place of places) {
    const distance = haversineKm(location.latitude, location.longitude, place.latitude, place.longitude);

    if (distance < nearestDistance) {
      nearest = place;
      nearestDistance = distance;
    }
  }

  if (!nearest || nearestDistance > NEAREST_PLACE_KM || nearest.id.startsWith("fallback-")) {
    return null;
  }

  return nearest;
}

function isMissingVideoCoverColumn(error: { code?: string; message?: string } | null) {
  if (!error) {
    return false;
  }

  const message = error.message?.toLowerCase() ?? "";

  return (
    error.code === "42703" &&
    (message.includes("video_cover_url") || message.includes("thumbnail_url"))
  );
}

function isInsertSelectError(error: { code?: string; message?: string } | null) {
  if (!error) {
    return false;
  }

  return error.code === "PGRST116" || error.message?.includes("JSON object requested") === true;
}

function isMissingAudioMutedColumn(error: { code?: string; message?: string } | null) {
  if (!error) {
    return false;
  }

  const message = error.message?.toLowerCase() ?? "";

  return error.code === "42703" && message.includes("audio_muted");
}

function isMissingSpotGpsMetaColumn(error: { code?: string; message?: string } | null) {
  if (!error) {
    return false;
  }

  const message = error.message?.toLowerCase() ?? "";

  return (
    error.code === "42703" &&
    (message.includes("spot_accuracy") ||
      message.includes("spot_captured_at") ||
      message.includes("spot_speed") ||
      message.includes("spot_heading"))
  );
}

async function uploadCarouselMediaItem(
  userId: string,
  item: { file: File; mediaType: "image" | "video"; coverFile?: File | null },
  uploadOptions: {
    accessToken?: string;
    skipVerification?: boolean;
    signal?: AbortSignal;
    onRetry?: (info: RetryAttemptInfo) => void;
    requestId?: string;
    onProgress?: (percent: number) => void;
  }
) {
  const upload = await uploadPostMedia(userId, item.file, {
    ...uploadOptions,
    onProgress: uploadOptions.onProgress,
  });
  let videoCoverUrl: string | null = null;

  if (item.mediaType === "video") {
    const cover = item.coverFile ?? (await resolveVideoCoverFile(item.file, null, 1));
    const coverUpload = await uploadPostMedia(userId, cover, uploadOptions);
    videoCoverUrl = coverUpload.mediaUrl;
  }

  return {
    mediaUrl: upload.mediaUrl,
    mediaType: item.mediaType,
    videoCoverUrl,
    storagePath: upload.storagePath,
  };
}

async function fetchInsertedPost(userId: string, mediaUrl: string) {
  logSpotPublishStep("fetch_post", { userId, mediaUrl });

  const { data, error } = await supabase
    .from("posts")
    .select("id, spot_name, media_url, video_url, thumbnail_url, video_cover_url, media_type, image_url")
    .eq("user_id", userId)
    .eq("media_url", mediaUrl)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  console.log("POST FETCH RESULT", {
    found: Boolean(data?.id),
    postId: data?.id ?? null,
    error: error
      ? {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        }
      : null,
  });

  return { data, error };
}

export async function createGeoSpot(input: CreateSpotInput): Promise<CreateGeoSpotResult> {
  if (!hasSpotPublishLocation(input.location)) {
    return { postId: null, matchedPlace: null, error: SPOT_LOCATION_REQUIRED_MESSAGE };
  }

  // My Spots is photos/images only — reject videos before any upload starts.
  const hasVideoMedia =
    input.mediaType === "video" ||
    Boolean(input.carouselPreparedItems?.some((item) => item.mediaType === "video"));

  if (input.publishToMySpots && hasVideoMedia) {
    return {
      postId: null,
      matchedPlace: null,
      error: "Videos can only be shared to Public Spot.",
      errorKind: "validation",
    };
  }

  const uploadOptions = {
    accessToken: input.accessToken,
    skipVerification: true,
    signal: input.signal,
    onRetry: input.onUploadRetry,
    requestId: input.requestId,
  };

  const placesPromise =
    input.discoveryPlaces && input.discoveryPlaces.length > 0
      ? Promise.resolve(input.discoveryPlaces)
      : loadDiscoveryPlacesForMatching();

  const carouselPrepared =
    input.carouselPreparedItems && input.carouselPreparedItems.length > 0
      ? input.carouselPreparedItems.slice(0, SPOT_MAX_PHOTOS)
      : [
          {
            file: input.file,
            mediaType: input.mediaType,
            coverFile: input.coverFile ?? null,
          },
        ];

  if (carouselPrepared.length > SPOT_MAX_PHOTOS) {
    return {
      postId: null,
      matchedPlace: null,
      error: `A Spot can include at most ${SPOT_MAX_PHOTOS} photos.`,
    };
  }

  const uploadedMediaUrls: string[] = [];

  async function rollbackUploadedMedia() {
    if (uploadedMediaUrls.length === 0) {
      return;
    }

    await removeStorageObjectsForUrls(uploadedMediaUrls);
    uploadedMediaUrls.length = 0;
  }

  async function rollbackCreatedPost(postId: string) {
    await supabase
      .from("posts")
      .delete()
      .eq("id", postIdForQuery(postId))
      .eq("user_id", input.userId);
  }

  type UploadedCarouselPayload = {
    mediaUrl: string;
    mediaType: "image" | "video";
    videoCoverUrl: string | null;
    storagePath: string;
  };

  let primaryUpload: UploadedCarouselPayload;
  const carouselPayload: Array<{
    mediaUrl: string;
    mediaType: "image" | "video";
    videoCoverUrl: string | null;
    audioMuted: boolean;
  }> = [];

  try {
    const finishStorage = timeUploadStep("[UPLOAD] Storage Upload");
    const primaryItem = carouselPrepared[0]!;

    logSpotPublishStage("uploading_primary");
    input.onPublishStage?.("uploading_primary", 12);

    if (primaryItem.mediaType === "video" && primaryItem.nativeFilePath) {
      // Physical iPhone path: stream from disk via URLSession. Never base64 / FileReader /
      // ArrayBuffer the video into JS. Native side compresses once (1080p / ≤15s / <30 MB).
      console.log("[SPOT-VIDEO-TIMING] upload_start — native disk URLSession", {
        nativeFilePath: primaryItem.nativeFilePath,
        originalSizeBytes: primaryItem.nativeFileSizeBytes ?? 0,
        readIntoMemoryMs: 0,
      });

      const accessToken = (await getFreshAccessToken()) ?? input.accessToken;
      if (!accessToken || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
        throw new Error("Please sign in to upload files.");
      }

      const nativeResult = await uploadNativeSpotVideo({
        nativePath: primaryItem.nativeFilePath,
        userId: input.userId,
        accessToken,
        apikey: SUPABASE_ANON_KEY,
        supabaseUrl: SUPABASE_URL,
        bucket: POST_MEDIA_BUCKET,
        onProgress: (percent) => {
          input.onMediaUploadProgress?.(percent);
          input.onPublishStage?.("uploading_primary", mapPublishPercent(percent, 12, 42));
        },
      });

      input.onTiming?.("thumbnail", nativeResult.diagnostics.stagesMs.prepare ?? 0);
      primaryUpload = {
        mediaUrl: nativeResult.mediaUrl,
        mediaType: "video",
        videoCoverUrl: nativeResult.coverMediaUrl,
        storagePath: nativeResult.storagePath,
      };
      uploadedMediaUrls.push(nativeResult.mediaUrl);
      if (nativeResult.coverMediaUrl) {
        uploadedMediaUrls.push(nativeResult.coverMediaUrl);
      }
    } else if (primaryItem.mediaType === "video") {
      // Web / gallery path — single XHR upload of the prepared File (no auto-retries).
      console.log("[SPOT-VIDEO-TIMING] upload_start — web XHR", {
        fileName: primaryItem.file.name,
        finalSizeBytes: primaryItem.file.size,
        finalSizeMb: Math.round((primaryItem.file.size / (1024 * 1024)) * 100) / 100,
      });

      const uploadResult = await uploadPostMedia(input.userId, primaryItem.file, {
        ...uploadOptions,
        onProgress: (percent) => {
          input.onMediaUploadProgress?.(percent);
          input.onPublishStage?.("uploading_primary", mapPublishPercent(percent, 12, 40));
        },
      });

      let cover = primaryItem.coverFile ?? null;

      if (cover) {
        input.onTiming?.("thumbnail", 0);
      } else {
        const finishThumbnail = timeUploadStep("[UPLOAD] Thumbnail");
        cover = await resolveVideoCoverFile(primaryItem.file, null, 1);
        input.onTiming?.("thumbnail", finishThumbnail());
      }

      input.onPublishStage?.("uploading_primary", 40);

      const coverUploadResult = await uploadPostMedia(input.userId, cover, {
        ...uploadOptions,
        onProgress: (percent) => {
          input.onCoverUploadProgress?.(percent);
          input.onPublishStage?.("uploading_primary", mapPublishPercent(percent, 40, 42));
        },
      });

      primaryUpload = {
        mediaUrl: uploadResult.mediaUrl,
        mediaType: "video",
        videoCoverUrl: coverUploadResult.mediaUrl,
        storagePath: uploadResult.storagePath,
      };
      uploadedMediaUrls.push(uploadResult.mediaUrl, coverUploadResult.mediaUrl);
    } else {
      const uploadResult = await uploadPostMedia(input.userId, primaryItem.file, {
        ...uploadOptions,
        onProgress: (percent) => {
          input.onMediaUploadProgress?.(percent);
          input.onCoverUploadProgress?.(100);
          input.onPublishStage?.("uploading_primary", mapPublishPercent(percent, 12, 42));
        },
      });

      primaryUpload = {
        mediaUrl: uploadResult.mediaUrl,
        mediaType: "image",
        videoCoverUrl: null,
        storagePath: uploadResult.storagePath,
      };
      uploadedMediaUrls.push(uploadResult.mediaUrl);
    }

    logSpotPublish("primary uploaded", { mediaUrl: primaryUpload.mediaUrl });
    carouselPayload.push({
      mediaUrl: primaryUpload.mediaUrl,
      mediaType: primaryUpload.mediaType,
      videoCoverUrl: primaryUpload.videoCoverUrl,
      audioMuted: primaryItem.mediaType === "video" ? Boolean(primaryItem.audioMuted) : false,
    });
    input.onPublishStage?.("uploading_primary", 42);

    const extras = carouselPrepared.slice(1);

    if (extras.length > 0) {
      logSpotPublishStage("uploading_extra", { count: extras.length });
    }

    for (let index = 0; index < extras.length; index += 1) {
      const extra = extras[index]!;
      const extraStart = 42;
      const extraEnd = 72;

      logSpotPublish("extra media upload start", {
        index: index + 1,
        total: extras.length,
      });

      input.onPublishStage?.(
        "uploading_extra",
        extraStart + (index / extras.length) * (extraEnd - extraStart)
      );

      let uploaded;

      try {
        uploaded = await uploadCarouselMediaItem(input.userId, extra, {
          ...uploadOptions,
          onProgress: (percent) => {
            const local = (index + percent / 100) / extras.length;
            input.onPublishStage?.("uploading_extra", extraStart + local * (extraEnd - extraStart));
          },
        });
      } catch (extraUploadError) {
        const wrapped =
          extraUploadError instanceof Error
            ? extraUploadError
            : new Error("Unable to upload media.");
        (wrapped as Error & { failedPhotoIndex?: number }).failedPhotoIndex = index + 1;
        throw wrapped;
      }

      logSpotPublish("extra media uploaded", {
        index: index + 1,
        mediaUrl: uploaded.mediaUrl,
      });

      carouselPayload.push({
        mediaUrl: uploaded.mediaUrl,
        mediaType: uploaded.mediaType,
        videoCoverUrl: uploaded.videoCoverUrl,
        audioMuted: extra.mediaType === "video" ? Boolean(extra.audioMuted) : false,
      });

      uploadedMediaUrls.push(uploaded.mediaUrl);

      if (uploaded.videoCoverUrl) {
        uploadedMediaUrls.push(uploaded.videoCoverUrl);
      }
    }

    if (extras.length > 0) {
      input.onPublishStage?.("uploading_extra", 72);
    }

    logSpotPublishUploadedMediaItems(
      carouselPayload.map((item, index) => ({
        mediaType: item.mediaType,
        mediaUrl: item.mediaUrl,
        sortOrder: index,
      }))
    );

    const storageMs = finishStorage();
    input.onTiming?.("storage", storageMs);
  } catch (uploadError) {
    const message = spotPublishFail(
      uploadedMediaUrls.length === 0 ? "upload_primary" : "upload_extra",
      uploadError,
      {
        uploadedCount: uploadedMediaUrls.length,
        preparedCount: carouselPrepared.length,
      }
    );
    const failedPhotoIndex =
      typeof (uploadError as { failedPhotoIndex?: number }).failedPhotoIndex === "number"
        ? (uploadError as { failedPhotoIndex?: number }).failedPhotoIndex!
        : carouselPayload.length;
    const errorKind =
      uploadError instanceof DOMException && uploadError.name === "AbortError"
        ? "aborted"
        : ((uploadError as { errorKind?: string }).errorKind ?? null);

    await rollbackUploadedMedia();
    console.log("UPLOAD FILE RESULT", { step: "createGeoSpot", failed: true, error: message, errorKind });
    return {
      postId: null,
      matchedPlace: null,
      error: message,
      failedPhotoIndex,
      errorKind,
    };
  }

  const upload = {
    mediaUrl: primaryUpload!.mediaUrl,
    mediaType: primaryUpload!.mediaType,
    storagePath: primaryUpload!.storagePath,
  };
  const videoCoverUrl = primaryUpload!.videoCoverUrl;

  const finishLocation = performance.now();
  const places = await placesPromise;
  console.log("[UPLOAD] discovery places ready", {
    elapsedMs: Math.round(performance.now() - finishLocation),
    count: places.length,
  });

  const manualPlace =
    input.manualPlaceId && !input.manualPlaceId.startsWith("fallback-")
      ? places.find((place) => place.id === input.manualPlaceId) ?? null
      : null;
  const matchedPlace = manualPlace ?? findNearestDiscoveryPlace(input.location, places);

  const inCollection = Boolean(input.collectionId);
  let spotVisibility: "public" | "private" = "public";
  let publishedToSpots = true;

  if (input.publishToMySpots) {
    // "My Spots" destination — private to the owner. No collections row is required or
    // created; this is just a visibility/published_to_spots flag on the post itself, which
    // is exactly the signal the My Spots profile tab (lib/mySpots.ts) queries for.
    // Videos are rejected earlier (before upload) — My Spots is photos/images only.
    publishedToSpots = false;
    spotVisibility = "private";
  } else if (inCollection) {
    publishedToSpots = false;
    const { collection } = await loadCollectionById(input.collectionId!);

    if (collection && collection.user_id === input.userId) {
      spotVisibility = spotVisibilityForCollection(collection.visibility);
    } else {
      spotVisibility = "private";
    }
  }

  // Public Spot photos only — selfies/portraits/group photos where a person is the main
  // subject don't belong in Public Spots. Runs after upload (we need a fetchable URL) and
  // before the posts insert (so a rejection never creates a post at all — nothing to hide
  // or clean up afterward). Videos and non-public destinations (My Spots, collections) are
  // out of scope for this check.
  if (spotVisibility === "public" && publishedToSpots === true && upload.mediaType === "image") {
    logSpotPublishStep("moderate_photo", { mediaUrl: upload.mediaUrl });
    input.onPublishStage?.("moderating_photo", 73);

    let moderation: Awaited<ReturnType<typeof checkSpotPhotoModeration>>;

    try {
      const moderationToken = (await getFreshAccessToken()) ?? input.accessToken;
      moderation = moderationToken
        ? await checkSpotPhotoModeration(upload.mediaUrl, moderationToken)
        : { outcome: "error" };
    } catch (moderationError) {
      console.error("[UPLOAD] photo moderation threw", moderationError);
      moderation = { outcome: "error" };
    }

    // "person" is a confirmed violation — the specific, user-facing rejection message.
    if (moderation.outcome === "person") {
      await rollbackUploadedMedia();
      console.log("UPLOAD FILE RESULT", { step: "createGeoSpot", failed: true, reason: "person" });
      return {
        postId: null,
        matchedPlace: null,
        error: SPOT_PHOTO_REJECTED_MESSAGE,
      };
    }

    // "uncertain" (the AI itself couldn't tell) and "error" (network/timeout/invalid
    // response) are both treated the same way: never publish, never accuse the user of a
    // violation, show a generic retryable error like any other publish failure.
    if (moderation.outcome === "uncertain" || moderation.outcome === "error") {
      await rollbackUploadedMedia();
      const message = spotPublishFail(
        "moderate_photo",
        moderation.outcome === "uncertain" ? "Unable to verify this photo." : "Photo check failed."
      );
      return {
        postId: null,
        matchedPlace: null,
        error: message,
      };
    }
    // moderation.outcome === "place" — fall through and publish.
  }

  const canonicalLocation = canonicalizeGeoLocationFields(input.location);

  const primaryItem = carouselPrepared[0]!;
  const primaryAudioMuted =
    primaryItem.mediaType === "video" ? Boolean(primaryItem.audioMuted) : false;

  const trimmedCaption = input.caption?.trim() ?? "";
  // Same scope as the photo-moderation gate above: public Spots only, never
  // a location card (its content is a generated template, not a caption).
  const eligibleForAutoCaption =
    !input.locationCard &&
    !trimmedCaption &&
    input.autoCaption === true &&
    spotVisibility === "public" &&
    publishedToSpots === true;
  const captionSource: "manual" | "ai_pending" = eligibleForAutoCaption ? "ai_pending" : "manual";

  const row = {
    user_id: input.userId,
    content: input.locationCard ? spotLocationCardContent() : trimmedCaption,
    caption_source: captionSource,
    spot_name: resolveSpotName(input.spotName),
    visibility: spotVisibility,
    published_to_spots: publishedToSpots,
    content_kind: "spot" as const,
    media_url: upload.mediaUrl,
    media_type: upload.mediaType,
    image_url: upload.mediaType === "image" ? upload.mediaUrl : videoCoverUrl,
    video_url: upload.mediaType === "video" ? upload.mediaUrl : null,
    video_cover_url: videoCoverUrl,
    thumbnail_url: videoCoverUrl,
    audio_muted: primaryAudioMuted,
    discovery_place_id: matchedPlace?.id ?? null,
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

  console.log("POST INSERT payload", {
    storage_path: upload.storagePath,
    media_url: row.media_url,
    video_url: row.video_url,
    thumbnail_url: row.thumbnail_url,
    video_cover_url: row.video_cover_url,
    spot_name: row.spot_name,
    media_type: row.media_type,
    spot_address: row.spot_address,
    spot_city: row.spot_city,
    spot_country: row.spot_country,
    spot_latitude: row.spot_latitude,
    spot_longitude: row.spot_longitude,
    visibility: row.visibility,
    content_kind: row.content_kind,
    carousel_count: carouselPayload.length,
  });

  const finishDbInsert = timeUploadStep("[UPLOAD] Post Insert");

  try {
    logSpotPublish("post insert start", { postIdType: "bigint" });
    logSpotPublishStage("creating_post");
    logSpotPublishStep("create_post", { mediaUrl: row.media_url });
    input.onPublishStage?.("creating_post", 74);

    const insertOutcome = await withSpotPublishTimeout(
      (async () => {
        let insertRow: typeof row | Omit<typeof row, "video_cover_url" | "thumbnail_url" | "audio_muted"> | Omit<
          typeof row,
          "spot_accuracy" | "spot_captured_at" | "spot_speed" | "spot_heading"
        > | Omit<
          typeof row,
          | "video_cover_url"
          | "thumbnail_url"
          | "audio_muted"
          | "spot_accuracy"
          | "spot_captured_at"
          | "spot_speed"
          | "spot_heading"
        > = row;

        // Prefer insert+select so we get the id without a separate read race.
        let insertResult = await supabase.from("posts").insert(insertRow).select(
          "id, spot_name, media_url, video_url, thumbnail_url, video_cover_url, media_type, image_url"
        ).maybeSingle();
        let insertError = insertResult.error;
        let data = insertResult.data;

        if (insertError && isMissingVideoCoverColumn(insertError)) {
          const {
            video_cover_url: _videoCover,
            thumbnail_url: _thumb,
            ...legacyRow
          } = row;
          insertRow = legacyRow;
          insertResult = await supabase.from("posts").insert(legacyRow).select(
            "id, spot_name, media_url, video_url, thumbnail_url, video_cover_url, media_type, image_url"
          ).maybeSingle();
          insertError = insertResult.error;
          data = insertResult.data;
        }

        if (insertError && isMissingAudioMutedColumn(insertError)) {
          const { audio_muted: _audioMuted, ...withoutAudioMuted } = insertRow as typeof row;
          insertRow = withoutAudioMuted;
          insertResult = await supabase.from("posts").insert(withoutAudioMuted).select(
            "id, spot_name, media_url, video_url, thumbnail_url, video_cover_url, media_type, image_url"
          ).maybeSingle();
          insertError = insertResult.error;
          data = insertResult.data;
        }

        if (insertError && isMissingSpotGpsMetaColumn(insertError)) {
          const {
            spot_accuracy: _accuracy,
            spot_captured_at: _capturedAt,
            spot_speed: _speed,
            spot_heading: _heading,
            ...withoutGpsMeta
          } = insertRow as typeof row & {
            spot_accuracy?: number | null;
            spot_captured_at?: string | null;
            spot_speed?: number | null;
            spot_heading?: number | null;
          };
          insertRow = withoutGpsMeta;
          insertResult = await supabase.from("posts").insert(withoutGpsMeta).select(
            "id, spot_name, media_url, video_url, thumbnail_url, video_cover_url, media_type, image_url"
          ).maybeSingle();
          insertError = insertResult.error;
          data = insertResult.data;
        }

        // Insert may have committed even when Prefer: return=representation fails (PGRST116).
        if ((!data || insertError) && (isInsertSelectError(insertError) || !data)) {
          const fetched = await fetchInsertedPost(input.userId, upload.mediaUrl);

          if (fetched.data) {
            data = fetched.data;
            if (isInsertSelectError(insertError)) {
              insertError = null;
            }
          }

          return { insertError, data, fetchError: fetched.error };
        }

        return { insertError, data, fetchError: null };
      })(),
      SPOT_PUBLISH_POST_INSERT_TIMEOUT_MS,
      "Creating Spot"
    );

    const { insertError, data, fetchError } = insertOutcome;

    console.log("POST INSERT RESULT", {
      insertError: insertError
        ? {
            message: insertError.message,
            code: insertError.code,
            details: insertError.details,
            hint: insertError.hint,
          }
        : null,
      fetchError: fetchError
        ? {
            message: fetchError.message,
            code: fetchError.code,
            details: fetchError.details,
            hint: fetchError.hint,
          }
        : null,
      storage_path: upload.storagePath,
      media_url: data?.media_url ?? row.media_url,
      video_url: data?.video_url ?? row.video_url,
      thumbnail_url: data?.thumbnail_url ?? row.thumbnail_url,
      video_cover_url: data?.video_cover_url ?? row.video_cover_url,
      spot_name: data?.spot_name ?? row.spot_name,
      media_type: data?.media_type ?? row.media_type,
      postId: data?.id ?? null,
      postIdQuery: data?.id != null ? postIdForQuery(String(data.id)) : null,
    });

    if (insertError && !data) {
      const message = spotPublishFail("create_post", insertError, {
        storage_path: upload.storagePath,
        media_url: row.media_url,
      });
      logSpotPublish("post insert error", { message });
      await rollbackUploadedMedia();

      if (isMissingSpotNameColumn(insertError)) {
        return {
          postId: null,
          matchedPlace,
          error: "Spot names are temporarily unavailable. Please try again later.",
        };
      }

      if (isMissingSpotColumns(insertError)) {
        return {
          postId: null,
          matchedPlace,
          error: "Location tagging is temporarily unavailable. Please try again later.",
        };
      }

      return { postId: null, matchedPlace, error: message };
    }

    if (!data && fetchError) {
      const message = spotPublishFail("fetch_post", fetchError, {
        storage_path: upload.storagePath,
        media_url: row.media_url,
        note: "Insert may have succeeded; storage was NOT rolled back to avoid orphans.",
      });
      logSpotPublish("post insert error", { message });
      // Do not delete uploaded files here — the post row may already exist.
      return {
        postId: null,
        matchedPlace,
        error: message,
      };
    }

    const postId = data?.id ? String(data.id) : null;

    if (!postId) {
      const message = spotPublishFail(
        "fetch_post",
        "Post insert returned no id (insert had no error, fetch found no row).",
        {
          storage_path: upload.storagePath,
          media_url: row.media_url,
        }
      );
      logSpotPublish("post insert error", { message });
      // Do not delete uploaded files — row may exist under a delayed read.
      return {
        postId: null,
        matchedPlace,
        error: message,
      };
    }

    logSpotPublish("post insert success", {
      postId,
      postIdQuery: postIdForQuery(postId),
    });

    if (carouselPayload.length > 1) {
      logSpotPublishStage("saving_media_items", { itemCount: carouselPayload.length });
      input.onPublishStage?.("saving_media_items", 86);

      try {
        const mediaItemsResult = await withSpotPublishTimeout(
          insertPostMediaCarouselItems(postId, carouselPayload),
          SPOT_PUBLISH_MEDIA_ITEMS_TIMEOUT_MS,
          "Saving media items"
        );

        logSpotPublishPostMediaItemsInsertResult({
          ok: mediaItemsResult.ok,
          error: mediaItemsResult.error,
          itemCount: carouselPayload.length,
        });

        if (!mediaItemsResult.ok) {
          const message = spotPublishFail(
            "save_media_items",
            mediaItemsResult.error ?? "Unable to save all photos for this Spot.",
            { postId, itemCount: carouselPayload.length }
          );

          await rollbackCreatedPost(postId);
          await rollbackUploadedMedia();

          return {
            postId: null,
            matchedPlace,
            error: message,
          };
        }
      } catch (mediaItemsError) {
        const message = spotPublishFail("save_media_items", mediaItemsError, {
          postId,
          itemCount: carouselPayload.length,
        });

        logSpotPublishPostMediaItemsInsertResult({
          ok: false,
          error: message,
          itemCount: carouselPayload.length,
        });

        logSpotPublish("media items insert error", { postId, message });

        await rollbackCreatedPost(postId);
        await rollbackUploadedMedia();

        return {
          postId: null,
          matchedPlace,
          error: message,
        };
      }
    }

    if (postId && input.collectionId) {
      const addResult = await addSpotToCollection(input.collectionId, postId, input.userId);

      if (addResult.error) {
        console.warn("POST INSERT collection add failed (non-fatal)", {
          postId,
          collectionId: input.collectionId,
          error: addResult.error,
        });
      }
    }

    logSpotPublishStage("finalizing");
    input.onPublishStage?.("finalizing", 98);

    return { postId, matchedPlace, error: null };
  } finally {
    const postInsertMs = finishDbInsert();
    input.onTiming?.("postInsert", postInsertMs);
  }
}

function withinBounds(lat: number, lng: number, bounds: MapBounds) {
  return lat <= bounds.north && lat >= bounds.south && lng <= bounds.east && lng >= bounds.west;
}

function mapRowToMapSpotPin(row: Record<string, unknown>): MapSpotPin | null {
  const latitude = Number(row.spot_latitude);
  const longitude = Number(row.spot_longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  const profileJoin = row.profiles as
    | {
        username?: string;
        avatar_url?: string | null;
        is_private?: boolean;
        is_demo?: boolean;
        is_verified?: boolean | null;
      }
    | {
        username?: string;
        avatar_url?: string | null;
        is_private?: boolean;
        is_demo?: boolean;
        is_verified?: boolean | null;
      }[]
    | null;
  const profile = Array.isArray(profileJoin) ? profileJoin[0] : profileJoin;

  if (profile?.is_private || profile?.is_demo || isGuideAccountUsername(profile?.username)) {
    return null;
  }

  const placeJoin = row.discovery_places as { name?: string } | { name?: string }[] | null;
  const placeName = Array.isArray(placeJoin) ? placeJoin[0]?.name : placeJoin?.name;
  const spotName = (row.spot_name as string | null)?.trim() || null;
  const locationLine = formatSpotLocationDisplay({
    spot_name: spotName,
    spot_address: row.spot_address as string | null,
    spot_city: row.spot_city as string | null,
    spot_country: row.spot_country as string | null,
    placeName: placeName ?? null,
  });
  const label = spotName || placeName || locationLine?.split(",")[0] || "Spot";
  const mediaTypeRaw = row.media_type as string | null;

  return {
    id: String(row.id),
    user_id: String(row.user_id),
    username: publicProfileUsername(profile?.username),
    avatar_url: profile?.avatar_url ?? null,
    is_verified: profile?.is_verified ?? null,
    latitude,
    longitude,
    spot_name: spotName,
    spot_address: (row.spot_address as string | null) ?? null,
    spot_city: (row.spot_city as string | null) ?? null,
    spot_country: (row.spot_country as string | null) ?? null,
    label: String(label),
    location_line: locationLine,
    content: (row.content as string | null) ?? null,
    created_at: (row.created_at as string | null) ?? null,
    media_url: (row.media_url as string | null) ?? null,
    media_type: mediaTypeRaw === "video" ? "video" : mediaTypeRaw === "image" ? "image" : null,
    video_cover_url:
      (row.video_cover_url as string | null) ??
      (row.thumbnail_url as string | null) ??
      (row.image_url as string | null) ??
      null,
    thumbnail_url:
      (row.video_cover_url as string | null) ??
      (row.thumbnail_url as string | null) ??
      (row.image_url as string | null) ??
      null,
    discovery_place_id: (row.discovery_place_id as string | null) ?? null,
    visited_count: Math.max(0, Number(row.visited_count ?? 0) || 0),
  };
}

async function queryMapSpotPins(select: string, limit: number, bounds: MapBounds) {
  return supabase
    .from("posts")
    .select(select)
    .in("content_kind", ["spot", "post"])
    .eq("visibility", "public")
    .not("spot_latitude", "is", null)
    .not("spot_longitude", "is", null)
    // Bounds are applied in SQL, not just client-side after the fact — with
    // only `.order(created_at).limit(n)` and no lat/lng filter, a `limit`
    // count of the platform's most-recent public posts could all be
    // elsewhere, silently pushing an older-but-perfectly-valid Spot (e.g. in
    // Gstaad) out of the result set before the bounds check ever saw it.
    .gte("spot_latitude", bounds.south)
    .lte("spot_latitude", bounds.north)
    .gte("spot_longitude", bounds.west)
    .lte("spot_longitude", bounds.east)
    // Dedicated Spots (content_kind = "spot") still respect published_to_spots
    // (e.g. Spots saved into a non-public collection stay off the map).
    // Regular posts with a tagged public location (content_kind = "post",
    // e.g. from the gallery "New Post" flow) always carry published_to_spots
    // = false since that flag doesn't apply to them, so they're included here
    // as long as they have real coordinates — matching the coordinate-based
    // `isSpotContent` check profile/search already use.
    .or("content_kind.neq.spot,published_to_spots.eq.true")
    .order("created_at", { ascending: false })
    .limit(limit);
}

export async function loadNearbyMapSpotPins(
  latitude: number,
  longitude: number,
  radiusKm = 45,
  limit = 200
) {
  const latDelta = radiusKm / 111;
  const lngDelta = radiusKm / (111 * Math.cos((latitude * Math.PI) / 180));
  const bounds: MapBounds = {
    north: latitude + latDelta,
    south: latitude - latDelta,
    east: longitude + lngDelta,
    west: longitude - lngDelta,
  };

  const { pins, error } = await loadMapSpotPins(bounds, Math.max(limit, 240));

  if (error) {
    return { pins: [] as MapSpotPin[], error };
  }

  const nearby = pins
    .map((pin) => ({
      pin,
      distance: haversineKm(latitude, longitude, pin.latitude, pin.longitude),
    }))
    .filter(({ distance }) => distance <= radiusKm)
    .sort((left, right) => left.distance - right.distance)
    .slice(0, limit)
    .map(({ pin }) => pin);

  return { pins: nearby, error: null };
}

export async function loadMapSpotPins(bounds: MapBounds = BERN_MAP_BOUNDS, limit = 120) {
  let result = await queryMapSpotPins(MAP_SPOT_SELECT, limit, bounds);

  if (result.error && result.error.code === "42703") {
    result = await queryMapSpotPins(MAP_SPOT_SELECT_LEGACY, limit, bounds);
  }

  if (isMissingSpotColumns(result.error)) {
    result = await queryMapSpotPins(MAP_SPOT_SELECT_LEGACY, limit, bounds);
  }

  if (result.error) {
    if (isMissingSpotColumns(result.error)) {
      return { pins: [] as MapSpotPin[], error: null };
    }

    return { pins: [] as MapSpotPin[], error: result.error.message };
  }

  const pins: MapSpotPin[] = [];

  for (const row of result.data ?? []) {
    const pin = mapRowToMapSpotPin(row as unknown as Record<string, unknown>);

    if (!pin || !withinBounds(pin.latitude, pin.longitude, bounds)) {
      continue;
    }

    pins.push(pin);
  }

  return { pins, error: null };
}

export async function loadSavedMapSpotPinIds(userId: string) {
  const { data, error } = await supabase
    .from("post_reactions")
    .select("post_id")
    .eq("user_id", userId)
    .eq("reaction_type", "useful");

  if (error) {
    if (error.code === "42P01" || error.message?.includes("post_reactions")) {
      return { ids: [] as string[], error: null };
    }

    return { ids: [] as string[], error: error.message };
  }

  return { ids: (data ?? []).map((row) => String(row.post_id)), error: null };
}
