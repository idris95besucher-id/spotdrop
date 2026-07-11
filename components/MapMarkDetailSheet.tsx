"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Loader2, MapPinned, Pencil, Trash2, UserRound, X } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { usePostViewerOptional } from "@/components/PostViewerProvider";
import {
  deleteMapMark,
  resolveRelatedSpotPostIdForMapMark,
  updateMapMark,
  type MapMark,
} from "@/lib/mapMarks";
import { getViewerSpotMediaUrl } from "@/lib/postViewer";
import { pickSpotGalleryPhoto } from "@/lib/pickMediaFromGallery";
import { loadSpotMessagePreview } from "@/lib/spotMessagePreview";

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
  const [clearPhoto, setClearPhoto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fullscreenPhoto, setFullscreenPhoto] = useState(false);
  const [relatedSpotId, setRelatedSpotId] = useState<string | null>(null);
  const [openingSpot, setOpeningSpot] = useState(false);

  const placeLine = useMemo(() => {
    return mark.place_name?.trim() || mark.address?.trim() || t("map.selectedLocation");
  }, [mark.address, mark.place_name, t]);

  const profileHref = `/user?id=${encodeURIComponent(mark.user_id)}`;
  const createdLabel = formatMarkDate(
    mark.created_at,
    locale === "de" ? "de-CH" : locale === "ru" ? "ru-RU" : "en-GB"
  );

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

  const handleSeeSpot = async () => {
    if (!relatedSpotId || openingSpot) {
      return;
    }

    setOpeningSpot(true);
    setError(null);

    const result = await loadSpotMessagePreview(relatedSpotId, locale);
    setOpeningSpot(false);

    if (!result.viewerItem) {
      // Related Spot disappeared — hide the button silently next render.
      setRelatedSpotId(null);
      return;
    }

    if (postViewer) {
      // Overlay viewer keeps the Map mounted (zoom/position preserved on close).
      postViewer.openPostViewer([result.viewerItem], {
        initialSpotId: result.viewerItem.id,
        initialMediaUrl: result.preview?.thumbnailUrl ?? getViewerSpotMediaUrl(result.viewerItem),
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
    setPhotoPreview(URL.createObjectURL(file));
  };

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
        className="relative z-10 max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/10 bg-[#0B1026] shadow-2xl"
        style={{
          paddingBottom: embedded
            ? "max(1rem, calc(env(safe-area-inset-bottom) + 54px))"
            : "max(1rem, env(safe-area-inset-bottom))",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
          <Link href={profileHref} onClick={onClose} className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-cyan-400/35 bg-slate-800">
              {mark.avatar_url ? (
                <img src={mark.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <UserRound className="h-5 w-5 text-slate-400" aria-hidden />
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

        <div className="space-y-4 px-4 py-4">
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
              className="flex w-full items-center justify-center gap-2 rounded-full bg-cyan-500 py-3.5 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:bg-cyan-400 active:scale-[0.99] disabled:opacity-60"
            >
              {openingSpot ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {t("map.seeSpot")}
            </button>
          ) : null}

          {isOwner ? (
            <div className="flex flex-wrap gap-2 pt-1">
              {editing ? (
                <>
                  <button
                    type="button"
                    onClick={() => void handleSaveEdit()}
                    disabled={busy}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-950 disabled:opacity-50"
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
                    className="rounded-full border border-white/12 px-4 py-3 text-sm font-semibold text-slate-200"
                  >
                    {t("common.cancel")}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-white/12 px-4 py-3 text-sm font-semibold text-white"
                  >
                    <Pencil className="h-4 w-4" aria-hidden />
                    {t("map.markEdit")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete()}
                    disabled={busy}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-100 disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                    {t("common.delete")}
                  </button>
                </>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
