"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Loader2, MapPinned, Share2, X } from "lucide-react";
import ShareMapMarkSheet from "@/components/ShareMapMarkSheet";
import { useI18n } from "@/components/I18nProvider";
import { usePostViewerOptional } from "@/components/PostViewerProvider";
import { mapMarkToSharePayload } from "@/lib/cityRoomMapMarkMessage";
import { openGoogleMapsAtCoordinates } from "@/lib/externalMaps";
import {
  deleteMapMark,
  resolveRelatedSpotPostIdForMapMark,
  updateMapMark,
  type MapMark,
} from "@/lib/mapMarks";
import {
  mapMarkCategoryIcon,
  mapMarkCategoryLabelKey,
  normalizeMapMarkCategory,
} from "@/lib/mapMarkCategories";
import { mapMarkAvatarInitial } from "@/lib/mapMarkMarkers";
import { getViewerSpotMediaUrl } from "@/lib/postViewer";
import { pickSpotGalleryPhoto } from "@/lib/pickMediaFromGallery";
import { loadSpotMessagePreview } from "@/lib/spotMessagePreview";
import {
  composerPaddingBottom,
  useChromeNavHidden,
  useKeyboard,
} from "@/lib/keyboardSystem";

type MapMarkDetailSheetProps = {
  mark: MapMark;
  viewerId: string | null;
  embedded?: boolean;
  onClose: () => void;
  onUpdated: (mark: MapMark) => void;
  onDeleted: (markId: string) => void;
};

function formatMarkDate(iso: string, locale: string) {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function MapMarkDetailSheet({
  mark,
  viewerId,
  embedded = false,
  onClose,
  onUpdated,
  onDeleted,
}: MapMarkDetailSheetProps) {
  const { t, locale } = useI18n();
  const postViewer = usePostViewerOptional();
  const isOwner = Boolean(viewerId && viewerId === mark.user_id);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(mark.text);
  const [photoPreview, setPhotoPreview] = useState(mark.photo_url);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [localPhotoObjectUrl, setLocalPhotoObjectUrl] = useState<string | null>(null);
  const [clearPhoto, setClearPhoto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fullscreenPhoto, setFullscreenPhoto] = useState(false);
  const [relatedSpotId, setRelatedSpotId] = useState<string | null>(null);
  const [openingSpot, setOpeningSpot] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const placeLine = useMemo(() => {
    return mark.place_name?.trim() || mark.address?.trim() || t("map.selectedLocation");
  }, [mark.address, mark.place_name, t]);

  const profileHref = `/user?id=${encodeURIComponent(mark.user_id)}`;
  const createdLabel = formatMarkDate(
    mark.created_at,
    locale === "de" ? "de-CH" : locale === "ru" ? "ru-RU" : "en-GB"
  );

  const { isKeyboardOpen } = useKeyboard();
  useChromeNavHidden("map-sheet", embedded || editing);

  const footerPadding =
    embedded && !isKeyboardOpen
      ? composerPaddingBottom("cityRoom", false)
      : composerPaddingBottom("sheet", isKeyboardOpen);

  useEffect(() => {
    let cancelled = false;
    setRelatedSpotId(null);

    void resolveRelatedSpotPostIdForMapMark(mark).then((postId) => {
      if (cancelled) {
        return;
      }

      setRelatedSpotId(postId);
    });

    return () => {
      cancelled = true;
    };
  }, [mark]);

  useEffect(() => {
    return () => {
      if (localPhotoObjectUrl) {
        URL.revokeObjectURL(localPhotoObjectUrl);
      }
    };
  }, [localPhotoObjectUrl]);

  const handleSeeSpot = async () => {
    if (!relatedSpotId || openingSpot) {
      return;
    }

    setOpeningSpot(true);
    setError(null);

    console.log("[Map→Spot] selected map mark related post ID", relatedSpotId);

    const result = await loadSpotMessagePreview(relatedSpotId, locale);
    const viewerItem = result.viewerItem;
    const mediaUrl = viewerItem ? getViewerSpotMediaUrl(viewerItem) : null;

    console.log("[Map→Spot] fetched related post", {
      requestedId: relatedSpotId,
      fetchedId: viewerItem?.id ?? null,
      error: result.error,
      media_url: viewerItem?.media_url ?? null,
      image_url: viewerItem?.image_url ?? null,
      video_url: viewerItem?.video_url ?? null,
      media_type: viewerItem?.media_type ?? null,
      thumbnail_url: viewerItem?.thumbnail_url ?? null,
      normalizedMediaUrl: mediaUrl,
    });

    setOpeningSpot(false);

    if (!viewerItem) {
      console.warn("[Map→Spot] related Spot unavailable", { relatedSpotId, error: result.error });
      setRelatedSpotId(null);
      setError(result.error ?? t("spotShare.spotUnavailable"));
      return;
    }

    if (!mediaUrl && !viewerItem.thumbnail_url && !viewerItem.video_cover_url) {
      console.warn("[Map→Spot] related Spot has no media", { relatedSpotId, fetchedId: viewerItem.id });
      setError(t("spotShare.spotUnavailable"));
      return;
    }

    console.log("[Map→Spot] media load success", {
      fetchedId: viewerItem.id,
      normalizedMediaUrl: mediaUrl,
      mediaType: viewerItem.media_type,
    });

    if (postViewer) {
      // Overlay viewer keeps the Map mounted (zoom/position preserved on close).
      postViewer.openPostViewer([viewerItem], {
        initialSpotId: viewerItem.id,
        initialMediaUrl: result.preview?.thumbnailUrl ?? mediaUrl,
      });
      return;
    }

    window.location.assign(`/posts?id=${encodeURIComponent(relatedSpotId)}`);
  };

  const handleSaveEdit = async () => {
    if (!viewerId || busy) {
      return;
    }

    const trimmed = text.trim();

    if (!trimmed) {
      setError(t("map.markTextRequired"));
      return;
    }

    setBusy(true);
    setError(null);

    const result = await updateMapMark(mark.id, viewerId, {
      text: trimmed,
      photoFile,
      clearPhoto,
    });

    setBusy(false);

    if (result.error || !result.mark) {
      setError(result.error ?? t("map.placeActionFailed"));
      return;
    }

    onUpdated(result.mark);
    setEditing(false);
    setPhotoFile(null);
    setClearPhoto(false);
    setPhotoPreview(result.mark.photo_url);
  };

  const handleDelete = async () => {
    if (!viewerId || busy) {
      return;
    }

    setBusy(true);
    setError(null);

    const result = await deleteMapMark(mark.id, viewerId);
    setBusy(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    onDeleted(mark.id);
  };

  const handlePickPhoto = async () => {
    const file = await pickSpotGalleryPhoto();

    if (!file) {
      return;
    }

    setPhotoFile(file);
    setClearPhoto(false);

    if (localPhotoObjectUrl) {
      URL.revokeObjectURL(localPhotoObjectUrl);
    }

    const nextUrl = URL.createObjectURL(file);
    setLocalPhotoObjectUrl(nextUrl);
    setPhotoPreview(nextUrl);
  };

  const handleOpenGoogleMaps = () => {
    openGoogleMapsAtCoordinates(mark.latitude, mark.longitude);
  };

  const sharePayload = useMemo(() => mapMarkToSharePayload(mark), [mark]);

  if (fullscreenPhoto && photoPreview) {
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black">
        <button
          type="button"
          className="absolute inset-0"
          aria-label={t("common.close")}
          onClick={() => setFullscreenPhoto(false)}
        />
        <img src={photoPreview} alt="" className="relative z-10 max-h-full max-w-full object-contain" />
        <button
          type="button"
          onClick={() => setFullscreenPhoto(false)}
          className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-20 rounded-full bg-black/50 p-2 text-white"
          aria-label={t("common.close")}
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button type="button" className="absolute inset-0 bg-black/45" aria-label={t("common.close")} onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-[#0B1026] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
          <Link href={profileHref} onClick={onClose} className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-cyan-400/35 bg-slate-800 text-sm font-bold text-white">
              {mark.avatar_url ? (
                <img src={mark.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                mapMarkAvatarInitial(mark.username)
              )}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-white">@{mark.username}</span>
              {createdLabel ? <span className="block text-xs text-slate-400">{createdLabel}</span> : null}
            </span>
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"
            aria-label={t("common.close")}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {editing ? (
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={4}
              maxLength={500}
              className="w-full resize-none rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-3 text-sm text-white outline-none focus:border-cyan-400/40"
            />
          ) : (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-white">{mark.text}</p>
          )}

          {(() => {
            const category = normalizeMapMarkCategory(mark.category);
            const Icon = mapMarkCategoryIcon(category);
            return (
              <div className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-cyan-100">
                <Icon className="h-3.5 w-3.5 text-cyan-300" aria-hidden />
                {t(mapMarkCategoryLabelKey(category))}
              </div>
            );
          })()}

          {photoPreview ? (
            <button
              type="button"
              onClick={() => !editing && setFullscreenPhoto(true)}
              className="block w-full overflow-hidden rounded-2xl"
            >
              <img src={photoPreview} alt="" className="max-h-72 w-full object-cover" />
            </button>
          ) : null}

          {editing ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handlePickPhoto()}
                className="rounded-full border border-white/12 px-3 py-2 text-xs font-semibold text-white"
              >
                {t("map.markAddPhotoGallery")}
              </button>
              {photoPreview ? (
                <button
                  type="button"
                  onClick={() => {
                    if (localPhotoObjectUrl) {
                      URL.revokeObjectURL(localPhotoObjectUrl);
                      setLocalPhotoObjectUrl(null);
                    }

                    setPhotoFile(null);
                    setClearPhoto(true);
                    setPhotoPreview(null);
                  }}
                  className="rounded-full border border-white/12 px-3 py-2 text-xs font-semibold text-red-200"
                >
                  {t("common.delete")}
                </button>
              ) : null}
            </div>
          ) : null}

          <p className="flex items-start gap-2 text-xs text-slate-400">
            <MapPinned className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-300" aria-hidden />
            <span>
              {placeLine}
              <span className="mt-0.5 block text-slate-500">
                {mark.latitude.toFixed(5)}, {mark.longitude.toFixed(5)}
              </span>
            </span>
          </p>

          {error ? <p className="text-sm text-red-300">{error}</p> : null}

          {!editing && relatedSpotId ? (
            <button
              type="button"
              onClick={() => void handleSeeSpot()}
              disabled={openingSpot}
              className="flex w-full items-center justify-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-500/10 py-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/15 active:scale-[0.99] disabled:opacity-60"
            >
              {openingSpot ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {t("map.seeSpot")}
            </button>
          ) : null}
        </div>

        <div
          className="shrink-0 space-y-2 border-t border-white/10 bg-[#0B1026] px-4 pt-3"
          style={{ paddingBottom: footerPadding }}
        >
          {editing ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleSaveEdit()}
                disabled={busy}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-cyan-500 px-4 py-3.5 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-500/20 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                {t("common.saving")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setText(mark.text);
                  setPhotoPreview(mark.photo_url);
                  setPhotoFile(null);
                  setClearPhoto(false);
                }}
                className="rounded-full border border-white/12 px-4 py-3.5 text-sm font-semibold text-slate-200"
              >
                {t("common.cancel")}
              </button>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleOpenGoogleMaps}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-cyan-500 py-3.5 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:bg-cyan-400 active:scale-[0.99]"
                >
                  <span aria-hidden>🗺️</span>
                  {t("map.markOpenInGoogleMaps")}
                </button>
                <button
                  type="button"
                  onClick={() => setShareOpen(true)}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-white/12 px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-white/10"
                  aria-label={t("map.shareMark.action")}
                >
                  <Share2 className="h-4 w-4" aria-hidden />
                </button>
              </div>

              {isOwner ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-white/12 px-4 py-3 text-sm font-semibold text-white"
                  >
                    <span aria-hidden>✏️</span>
                    {t("map.markEdit")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete()}
                    disabled={busy}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-100 disabled:opacity-50"
                  >
                    <span aria-hidden>🗑</span>
                    {t("common.delete")}
                  </button>
                </div>
              ) : (
                <Link
                  href={profileHref}
                  onClick={onClose}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/12 px-4 py-3 text-sm font-semibold text-white"
                >
                  <span aria-hidden>👤</span>
                  {t("profile.viewProfile")}
                </Link>
              )}
            </>
          )}
        </div>
      </div>

      <ShareMapMarkSheet
        mark={sharePayload}
        userId={viewerId}
        isOpen={shareOpen}
        onClose={() => setShareOpen(false)}
      />
    </div>
  );
}
