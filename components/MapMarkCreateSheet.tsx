"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Loader2, MapPinned, RotateCcw, Trash2, X } from "lucide-react";
import { createPortal } from "react-dom";
import SpotInstagramCamera from "@/components/SpotInstagramCamera";
import { useI18n } from "@/components/I18nProvider";
import { createMapMark, type MapMark } from "@/lib/mapMarks";
import {
  DEFAULT_MAP_MARK_CATEGORY,
  MAP_MARK_CATEGORY_KEYS,
  mapMarkCategoryIcon,
  mapMarkCategoryLabelKey,
  type MapMarkCategoryKey,
} from "@/lib/mapMarkCategories";
import { formatSpotGeoLocationShortLabel } from "@/lib/spotLocationDisplay";
import type { SpotGeoLocation } from "@/lib/spotLocation";
import {
  useChromeNavHidden,
  useEnsureFocusedInputVisible,
  useKeyboardViewportFrame,
} from "@/lib/keyboardSystem";
import { toUserFacingError } from "@/lib/userFacingError";

type MapMarkCreateSheetProps = {
  location: SpotGeoLocation;
  userId: string;
  placeLabel: string;
  embedded?: boolean;
  onClose: () => void;
  onPublished: (mark: MapMark) => void;
};

export default function MapMarkCreateSheet({
  location,
  userId,
  placeLabel,
  embedded: _embedded = false,
  onClose,
  onPublished,
}: MapMarkCreateSheetProps) {
  void _embedded;
  const { t, locale } = useI18n();
  const {
    isKeyboardOpen,
    overlayStyle,
    sheetMaxHeight,
    footerPadding,
  } = useKeyboardViewportFrame();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [category, setCategory] = useState<MapMarkCategoryKey>(DEFAULT_MAP_MARK_CATEGORY);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  useChromeNavHidden("mark-create-sheet", true);
  useEnsureFocusedInputVisible(textareaRef);

  const resolvedPlace = useMemo(() => {
    if (placeLabel.trim()) {
      return placeLabel.trim();
    }

    return formatSpotGeoLocationShortLabel(location, locale) || t("map.selectedLocation");
  }, [locale, location, placeLabel, t]);

  const hasDraft = Boolean(text.trim() || photoFile);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setVisible(true));

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (photoPreviewUrl) {
        URL.revokeObjectURL(photoPreviewUrl);
      }
    };
  }, [photoPreviewUrl]);

  const clearPhoto = () => {
    if (photoPreviewUrl) {
      URL.revokeObjectURL(photoPreviewUrl);
    }

    setPhotoFile(null);
    setPhotoPreviewUrl(null);
  };

  const attachPhoto = (file: File) => {
    if (photoPreviewUrl) {
      URL.revokeObjectURL(photoPreviewUrl);
    }

    setPhotoFile(file);
    setPhotoPreviewUrl(URL.createObjectURL(file));
    setError(null);
  };

  const requestClose = () => {
    if (publishing) {
      return;
    }

    if (hasDraft && !window.confirm(t("map.markDiscardConfirm"))) {
      return;
    }

    setVisible(false);
    window.setTimeout(() => {
      onClose();
    }, 180);
  };

  const handlePublish = async () => {
    if (publishing) {
      return;
    }

    const trimmed = text.trim();

    if (!trimmed) {
      setError(t("map.markTextRequired"));
      return;
    }

    setPublishing(true);
    setError(null);

    const result = await createMapMark({
      userId,
      text: trimmed,
      photoFile,
      location,
      placeName: resolvedPlace,
      category,
    });

    setPublishing(false);

    if (result.error || !result.mark) {
      setError(
        result.error === "TABLE_MISSING"
          ? t("map.placeActionFailed")
          : toUserFacingError(result.error, t("map.placeActionFailed"))
      );
      return;
    }

    setVisible(false);
    window.setTimeout(() => {
      onPublished(result.mark!);
    }, 120);
  };

  if (showCamera) {
    return createPortal(
      <SpotInstagramCamera
        onClose={() => setShowCamera(false)}
        onCapture={(file, mediaType) => {
          if (mediaType !== "image") {
            return;
          }

          setShowCamera(false);
          attachPhoto(file);
        }}
      />,
      document.body
    );
  }

  /**
   * Anchor the portal to the real visible viewport (visualViewport).
   * That keeps the sheet above the keyboard / Safari toolbar without
   * stacking keyboardBottom padding on top of a layout-viewport bottom.
   */
  return createPortal(
    <div className="fixed inset-x-0 z-[60] flex items-end justify-center" style={overlayStyle}>
      <button
        type="button"
        className={`absolute inset-0 bg-black/50 transition-opacity duration-200 ${
          visible ? "opacity-100" : "opacity-0"
        }`}
        aria-label={t("common.close")}
        onClick={requestClose}
        disabled={publishing}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="map-mark-create-title"
        className={`relative z-10 flex w-full max-w-lg flex-col overflow-hidden rounded-t-[1.35rem] border border-white/10 bg-[#0B1026] shadow-[0_-12px_40px_rgba(0,0,0,0.55)] transition-transform duration-200 ease-out ${
          visible ? "translate-y-0" : "translate-y-full"
        }`}
        style={{
          maxHeight: sheetMaxHeight,
          paddingBottom: footerPadding,
        }}
      >
        <div className="flex shrink-0 justify-center pb-1 pt-2.5">
          <span className="h-1 w-9 rounded-full bg-white/25" aria-hidden />
        </div>

        <div className="flex shrink-0 items-center justify-between px-4 pb-2">
          <h2 id="map-mark-create-title" className="text-[15px] font-semibold tracking-tight text-white">
            {t("map.actionMarkPlace")}
          </h2>
          <button
            type="button"
            onClick={requestClose}
            disabled={publishing}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
            aria-label={t("common.close")}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 pb-2">
          <div className="flex items-start gap-2">
            <MapPinned className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-300" aria-hidden />
            <div className="min-w-0">
              <p className="line-clamp-2 text-[13px] font-medium leading-snug text-white">{resolvedPlace}</p>
              <p className="mt-0.5 text-[11px] tabular-nums text-slate-500">
                {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
              </p>
            </div>
          </div>

          <textarea
            ref={textareaRef}
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={isKeyboardOpen ? 2 : 3}
            maxLength={500}
            placeholder={t("map.markTextPlaceholder")}
            className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2.5 text-[14px] leading-snug text-white outline-none placeholder:text-slate-500 focus:border-cyan-400/45"
          />

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {t("map.markCategoryLabel")}
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {MAP_MARK_CATEGORY_KEYS.map((key) => {
                const Icon = mapMarkCategoryIcon(key);
                const selected = category === key;

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setCategory(key)}
                    disabled={publishing}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-semibold transition ${
                      selected
                        ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-100"
                        : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {t(mapMarkCategoryLabelKey(key))}
                  </button>
                );
              })}
            </div>
          </div>

          {photoPreviewUrl ? (
            <div className="overflow-hidden rounded-xl border border-white/10">
              <img src={photoPreviewUrl} alt="" className="h-28 w-full object-cover" />
              <div className="grid grid-cols-2 gap-px bg-white/10">
                <button
                  type="button"
                  onClick={() => setShowCamera(true)}
                  disabled={publishing}
                  className="inline-flex items-center justify-center gap-1.5 bg-[#0B1026] px-3 py-2.5 text-[12px] font-semibold text-white transition hover:bg-white/[0.06]"
                >
                  <RotateCcw className="h-3.5 w-3.5 text-cyan-300" aria-hidden />
                  {t("map.markRetakePhoto")}
                </button>
                <button
                  type="button"
                  onClick={clearPhoto}
                  disabled={publishing}
                  className="inline-flex items-center justify-center gap-1.5 bg-[#0B1026] px-3 py-2.5 text-[12px] font-semibold text-red-200 transition hover:bg-white/[0.06]"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  {t("map.markRemovePhoto")}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowCamera(true)}
              disabled={publishing}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-3 text-[13px] font-semibold text-white transition hover:bg-white/[0.08] disabled:opacity-50"
            >
              <Camera className="h-4 w-4 text-cyan-300" aria-hidden />
              {t("map.markAddPhotoCamera")}
            </button>
          )}

          {error ? <p className="text-[12px] text-red-300">{error}</p> : null}
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-white/10 px-4 pt-3">
          <button
            type="button"
            onClick={requestClose}
            disabled={publishing}
            className="rounded-full border border-white/12 px-4 py-2.5 text-[13px] font-semibold text-slate-200 transition hover:bg-white/5 disabled:opacity-50"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={() => void handlePublish()}
            disabled={publishing || !text.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-cyan-500 px-4 py-2.5 text-[13px] font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:opacity-45"
          >
            {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            {publishing ? t("common.saving") : t("map.markPublish")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
