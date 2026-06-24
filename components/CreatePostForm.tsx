"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { FormEvent } from "react";
import { ArrowLeft, Loader2, MapPin, X } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { canonicalizeGeoLocationFields } from "@/lib/i18n/canonicalGeo";
import SpotLocationPicker from "@/components/SpotLocationPicker";
import { setImmersiveOverlayActive } from "@/lib/immersiveOverlay";
import { getPostMediaType, NOT_SIGNED_IN_UPLOAD_MESSAGE, uploadPostMedia } from "@/lib/postMedia";
import { pickMediaFromGallery } from "@/lib/pickMediaFromGallery";
import { uploadVideoCoverForPublish } from "@/lib/publishVideoCover";
import {
  requestDeviceLocation,
  type PlaceSearchResult,
  type SpotGeoLocation,
} from "@/lib/spotLocation";
import { supabase } from "@/lib/supabaseClient";

export type CreatedProfilePost = {
  id: string;
  user_id: string;
  content: string;
  visibility: "public" | "private";
  image_url?: string | null;
  video_url?: string | null;
  video_cover_url?: string | null;
  media_url?: string | null;
  media_type?: string | null;
  created_at: string;
  updated_at: string;
};

type CreatePostFormProps = {
  userId: string;
  onCreated: (post: CreatedProfilePost) => void;
  isOpen?: boolean;
  onClose?: () => void;
};

type PostInsertRow = {
  user_id: string;
  content: string;
  visibility: "public" | "private";
  content_kind: "post";
  published_to_spots: false;
  media_url: string | null;
  media_type: string | null;
  image_url: string | null;
  video_url: string | null;
  video_cover_url: string | null;
  thumbnail_url: string | null;
  spot_latitude: number | null;
  spot_longitude: number | null;
  spot_address: string | null;
  spot_city: string | null;
  spot_country: string | null;
};

function buildPostInsertRow(
  authUserId: string,
  content: string,
  mediaUrl: string | null,
  mediaType: string | null,
  videoCoverUrl: string | null,
  location: SpotGeoLocation | null
): PostInsertRow {
  const canonicalLocation = location
    ? canonicalizeGeoLocationFields({ city: location.city, country: location.country })
    : { city: null, country: null };

  const row: PostInsertRow = {
    user_id: authUserId,
    content,
    visibility: "public",
    content_kind: "post",
    published_to_spots: false,
    media_url: mediaUrl,
    media_type: mediaType,
    image_url: null,
    video_url: null,
    video_cover_url: videoCoverUrl,
    thumbnail_url: videoCoverUrl,
    spot_latitude: location?.latitude ?? null,
    spot_longitude: location?.longitude ?? null,
    spot_address: location?.address ?? null,
    spot_city: canonicalLocation.city,
    spot_country: canonicalLocation.country,
  };

  if (mediaUrl && mediaType === "image") {
    row.image_url = mediaUrl;
  } else if (mediaUrl && mediaType === "video") {
    row.video_url = mediaUrl;
    row.image_url = videoCoverUrl;
  }

  return row;
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

function isMissingSpotColumns(error: { code?: string; message?: string } | null) {
  if (!error) {
    return false;
  }

  const message = error.message?.toLowerCase() ?? "";

  return error.code === "42703" && message.includes("spot_");
}

export default function CreatePostForm({
  userId,
  onCreated,
  isOpen: isOpenProp,
  onClose,
}: CreatePostFormProps) {
  const { t } = useI18n();
  const controlled = isOpenProp !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = controlled ? Boolean(isOpenProp) : internalOpen;

  const [picking, setPicking] = useState(false);
  const [content, setContent] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<"image" | "video" | null>(null);
  const [showLocation, setShowLocation] = useState(false);
  const [location, setLocation] = useState<SpotGeoLocation | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationHint, setLocationHint] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pickSessionRef = useRef(0);

  useEffect(() => {
    if (!isOpen) {
      setImmersiveOverlayActive(false);
      return;
    }

    setImmersiveOverlayActive(true);

    return () => {
      setImmersiveOverlayActive(false);
    };
  }, [isOpen]);

  const closeForm = () => {
    if (controlled) {
      onClose?.();
      return;
    }

    setInternalOpen(false);
  };

  const resetForm = () => {
    if (mediaPreviewUrl) {
      URL.revokeObjectURL(mediaPreviewUrl);
    }

    setPicking(false);
    setContent("");
    setMediaFile(null);
    setMediaPreviewUrl(null);
    setMediaType(null);
    setShowLocation(false);
    setLocation(null);
    setLocating(false);
    setLocationHint(null);
    setError(null);
  };

  const handleClose = () => {
    if (publishing || picking) {
      return;
    }

    resetForm();
    closeForm();
  };

  const applySelectedFile = (file: File) => {
    const nextMediaType = getPostMediaType(file);

    if (!nextMediaType) {
      setError("Only photos and videos are allowed.");
      return false;
    }

    if (mediaPreviewUrl) {
      URL.revokeObjectURL(mediaPreviewUrl);
    }

    setError(null);
    setMediaFile(file);
    setMediaPreviewUrl(URL.createObjectURL(file));
    setMediaType(nextMediaType);
    return true;
  };

  const openGallery = async ({ closeOnCancel = true }: { closeOnCancel?: boolean } = {}) => {
    const sessionId = pickSessionRef.current + 1;
    pickSessionRef.current = sessionId;
    setPicking(true);
    setError(null);

    try {
      const file = await pickMediaFromGallery();

      if (pickSessionRef.current !== sessionId) {
        return;
      }

      if (!file) {
        if (closeOnCancel) {
          handleClose();
        }
        return;
      }

      if (!applySelectedFile(file) && closeOnCancel) {
        handleClose();
      }
    } finally {
      if (pickSessionRef.current === sessionId) {
        setPicking(false);
      }
    }
  };

  useEffect(() => {
    if (!isOpen) {
      pickSessionRef.current += 1;
      return;
    }

    resetForm();
    void openGallery({ closeOnCancel: true });

    return () => {
      pickSessionRef.current += 1;
    };
  }, [isOpen]);

  const resolveFromDevice = async () => {
    setLocating(true);
    setLocationHint(null);
    setError(null);

    try {
      const detected = await requestDeviceLocation();
      setLocation(detected);
    } catch (caught) {
      setLocationHint(caught instanceof Error ? caught.message : "Unable to get your location.");
    } finally {
      setLocating(false);
    }
  };

  const applySearchPlace = async (place: PlaceSearchResult) => {
    setLocating(true);
    setLocationHint(null);

    try {
      const { spotLocationFromCoordinates } = await import("@/lib/spotLocation");
      const resolved = await spotLocationFromCoordinates(place.latitude, place.longitude);
      setLocation(resolved);
    } catch (caught) {
      setLocation({
        latitude: place.latitude,
        longitude: place.longitude,
        address: place.label,
        city: place.city,
        country: place.country,
      });
      setLocationHint(
        caught instanceof Error ? caught.message : "Using place name without full address."
      );
    } finally {
      setLocating(false);
    }
  };

  const handlePublish = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!mediaFile || !mediaType) {
      setError("Choose a photo or video to publish.");
      return;
    }

    setPublishing(true);
    setError(null);

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        setError(NOT_SIGNED_IN_UPLOAD_MESSAGE);
        return;
      }

      if (user.id !== userId) {
        setError(NOT_SIGNED_IN_UPLOAD_MESSAGE);
        return;
      }

      const { data: profileRow, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        console.error("Failed to verify profile before post:", profileError);
        throw new Error(profileError.message || "Unable to verify your profile.");
      }

      if (!profileRow) {
        setError("Complete your profile before posting.");
        return;
      }

      const uploadResult = await uploadPostMedia(user.id, mediaFile);
      let videoCoverUrl: string | null = null;

      if (uploadResult.mediaType === "video") {
        videoCoverUrl = await uploadVideoCoverForPublish(user.id, mediaFile, null);
      }

      const postLocation = showLocation ? location : null;
      const postRow = buildPostInsertRow(
        user.id,
        content.trim(),
        uploadResult.mediaUrl,
        uploadResult.mediaType,
        videoCoverUrl,
        postLocation
      );

      let { data: insertedPost, error: insertError } = await supabase
        .from("posts")
        .insert(postRow)
        .select(
          "id, user_id, content, visibility, image_url, video_url, video_cover_url, media_url, media_type, created_at, updated_at"
        )
        .single();

      if (insertError && (isMissingVideoCoverColumn(insertError) || isMissingSpotColumns(insertError))) {
        const {
          video_cover_url: _videoCover,
          thumbnail_url: _thumb,
          spot_latitude: _lat,
          spot_longitude: _lng,
          spot_address: _addr,
          spot_city: _city,
          spot_country: _country,
          ...legacyRow
        } = postRow;
        const retry = await supabase
          .from("posts")
          .insert(legacyRow)
          .select("id, user_id, content, visibility, image_url, video_url, media_url, media_type, created_at, updated_at")
          .single();
        insertedPost = retry.data as typeof insertedPost;
        insertError = retry.error;
      }

      if (insertError) {
        console.error("Failed to create post:", insertError);
        throw new Error(insertError.message || "Unable to publish your post.");
      }

      if (!insertedPost) {
        throw new Error("Unable to publish your post.");
      }

      onCreated(insertedPost as CreatedProfilePost);
      resetForm();
      closeForm();
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "Unable to publish your post.");
    } finally {
      setPublishing(false);
    }
  };

  if (!isOpen) {
    if (controlled) {
      return null;
    }

    return (
      <button
        type="button"
        onClick={() => setInternalOpen(true)}
        className="inline-flex flex-1 items-center justify-center rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
      >
        Add Post
      </button>
    );
  }

  if (picking || !mediaFile || !mediaPreviewUrl || !mediaType) {
    return typeof document !== "undefined"
      ? createPortal(
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80">
            <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
            <span className="sr-only">Opening photo library…</span>
          </div>,
          document.body
        )
      : null;
  }

  const preview = (
    <div className="fixed inset-0 z-[120] flex flex-col bg-[#050816]">
      <form onSubmit={handlePublish} className="flex min-h-0 flex-1 flex-col">
        <header
          className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3"
          style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
        >
          <button
            type="button"
            onClick={handleClose}
            disabled={publishing}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-300 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
            aria-label={t("common.close")}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
          <h2 className="text-sm font-semibold text-white">New post</h2>
          <button
            type="submit"
            disabled={publishing}
            className="inline-flex min-w-[5.5rem] items-center justify-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-[#050816] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {publishing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                …
              </>
            ) : (
              "Publish"
            )}
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex min-h-[40dvh] items-center justify-center bg-black">
            {mediaType === "video" ? (
              <video
                src={mediaPreviewUrl}
                controls
                playsInline
                className="max-h-[50dvh] w-full object-contain"
              />
            ) : (
              <img
                src={mediaPreviewUrl}
                alt="Selected post preview"
                className="max-h-[50dvh] w-full object-contain"
              />
            )}
          </div>

          <div className="space-y-4 p-4">
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder={t("spotEditor.captionPlaceholder")}
              rows={3}
              disabled={publishing}
              className="w-full resize-none rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm leading-7 text-white placeholder:text-slate-500 focus:border-cyan-400/50 focus:outline-none focus:ring-2 focus:ring-cyan-400/20 disabled:opacity-60"
            />

            <button
              type="button"
              onClick={() => void openGallery({ closeOnCancel: false })}
              disabled={publishing}
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-400 transition hover:text-white disabled:opacity-50"
            >
              <ArrowLeft className="h-4 w-4 rotate-180" aria-hidden />
              Choose different media
            </button>

            <div className="rounded-2xl border border-white/10 bg-slate-900/80">
              <button
                type="button"
                onClick={() => setShowLocation((current) => !current)}
                disabled={publishing}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <span className="inline-flex items-center gap-2 text-sm font-medium text-white">
                  <MapPin className="h-4 w-4 text-cyan-300" aria-hidden />
                  {t("spotEditor.addLocation")}
                  <span className="text-xs font-normal text-slate-500">(optional)</span>
                </span>
                <span className="text-xs text-slate-400">{showLocation ? "On" : "Off"}</span>
              </button>

              {showLocation ? (
                <div className="space-y-3 border-t border-white/10 px-4 pb-4 pt-3">
                  <SpotLocationPicker
                    locating={locating}
                    location={location}
                    locationSource={location ? "search" : null}
                    matchedPlaceName={null}
                    needsLocationChoice={!location}
                    locationHint={locationHint}
                    disabled={publishing}
                    onUseCurrentLocation={() => void resolveFromDevice()}
                    onSelectPlace={(place) => void applySearchPlace(place)}
                  />
                  {location ? (
                    <button
                      type="button"
                      onClick={() => {
                        setLocation(null);
                        setLocationHint(null);
                      }}
                      disabled={publishing}
                      className="text-xs font-medium text-slate-400 transition hover:text-white disabled:opacity-50"
                    >
                      Remove location
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>

            {error ? <p className="text-sm text-red-300">{error}</p> : null}
          </div>
        </div>
      </form>
    </div>
  );

  if (typeof document !== "undefined") {
    return createPortal(preview, document.body);
  }

  return preview;
}
