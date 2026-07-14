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
import { uploadPostMedia } from "@/lib/postMedia";
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
  `id, user_id, content, created_at, media_url, media_type, image_url, video_cover_url, thumbnail_url, spot_name, spot_latitude, spot_longitude, spot_address, spot_city, spot_country, discovery_place_id, visited_count, discovery_places(name), ${POST_AUTHOR_PROFILES_INNER}(username, avatar_url, is_private, is_demo)`;

const MAP_SPOT_SELECT_LEGACY =
  `id, user_id, content, created_at, media_url, media_type, image_url, thumbnail_url, spot_name, spot_latitude, spot_longitude, spot_address, spot_city, spot_country, discovery_place_id, ${POST_AUTHOR_PROFILES_INNER}(username, avatar_url, is_private, is_demo)`;

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
  }>;
  accessToken?: string;
  onMediaUploadProgress?: (percent: number) => void;
  onCoverUploadProgress?: (percent: number) => void;
  onPublishStage?: (stage: SpotPublishStage, percent: number) => void;
  onTiming?: (phase: "thumbnail" | "storage" | "postInsert", durationMs: number) => void;
  /** Generated SpotDrop location card (text-only spot). */
  locationCard?: boolean;
  /** Optional user caption — stored in posts.content. */
  caption?: string;
};

export type CreateGeoSpotResult = {
  postId: string | null;
  matchedPlace: DiscoveryPlace | null;
  error: string | null;
  carouselWarning?: string | null;
  failedPhotoIndex?: number | null;
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

  const uploadOptions = {
    accessToken: input.accessToken,
    skipVerification: true,
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

    if (primaryItem.mediaType === "video") {
      const mediaUploadPromise = uploadPostMedia(input.userId, primaryItem.file, {
        ...uploadOptions,
        onProgress: (percent) => {
          input.onMediaUploadProgress?.(percent);
          input.onPublishStage?.("uploading_primary", mapPublishPercent(percent, 12, 42));
        },
      });

      const coverUploadPromise = (async () => {
        let cover = primaryItem.coverFile ?? null;

        if (cover) {
          input.onTiming?.("thumbnail", 0);
        } else {
          const finishThumbnail = timeUploadStep("[UPLOAD] Thumbnail");
          cover = await resolveVideoCoverFile(primaryItem.file, null, 1);
          input.onTiming?.("thumbnail", finishThumbnail());
        }

        return uploadPostMedia(input.userId, cover, {
          ...uploadOptions,
          onProgress: input.onCoverUploadProgress,
        });
      })();

      const [uploadResult, coverUploadResult] = await Promise.all([
        mediaUploadPromise,
        coverUploadPromise,
      ]);

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

    await rollbackUploadedMedia();
    console.log("UPLOAD FILE RESULT", { step: "createGeoSpot", failed: true, error: message });
    return {
      postId: null,
      matchedPlace: null,
      error: message,
      failedPhotoIndex,
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

  if (inCollection) {
    publishedToSpots = false;
    const { collection } = await loadCollectionById(input.collectionId!);

    if (collection && collection.user_id === input.userId) {
      spotVisibility = spotVisibilityForCollection(collection.visibility);
    } else {
      spotVisibility = "private";
    }
  }

  const canonicalLocation = canonicalizeGeoLocationFields(input.location);

  const primaryItem = carouselPrepared[0]!;
  const primaryAudioMuted =
    primaryItem.mediaType === "video" ? Boolean(primaryItem.audioMuted) : false;

  const row = {
    user_id: input.userId,
    content: input.locationCard ? spotLocationCardContent() : input.caption?.trim() ?? "",
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
    | { username?: string; avatar_url?: string | null; is_private?: boolean; is_demo?: boolean }
    | { username?: string; avatar_url?: string | null; is_private?: boolean; is_demo?: boolean }[]
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

async function queryMapSpotPins(select: string, limit: number) {
  return supabase
    .from("posts")
    .select(select)
    .eq("content_kind", "spot")
    .eq("visibility", "public")
    .eq("published_to_spots", true)
    .not("spot_latitude", "is", null)
    .not("spot_longitude", "is", null)
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
  let result = await queryMapSpotPins(MAP_SPOT_SELECT, limit);

  if (result.error && result.error.code === "42703") {
    result = await queryMapSpotPins(MAP_SPOT_SELECT_LEGACY, limit);
  }

  if (isMissingSpotColumns(result.error)) {
    result = await queryMapSpotPins(MAP_SPOT_SELECT_LEGACY, limit);
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
