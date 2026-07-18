"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  Check,
  Loader2,
  RotateCw,
  SlidersHorizontal,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { GALLERY_DESCRIPTION_MAX_LENGTH } from "@/lib/profileGallery";
import {
  DEFAULT_CROP_TRANSFORM,
  GALLERY_PHOTO_EFFECTS,
  type CropTransform,
  type GalleryAspectRatio,
  type GalleryPhotoEffect,
  exportEditedGalleryPhoto,
  getAspectRatioValue,
  getBaseCoverScale,
  getEffectCssFilter,
  getRotatedImageSize,
  renderEffectPreviewDataUrl,
} from "@/lib/profileGalleryPhotoEditor";

type EditorStep = "crop" | "effects" | "caption";

type ProfileGalleryPhotoEditorScreenProps = {
  file: File;
  uploading?: boolean;
  onCancel: () => void;
  onConfirm: (editedFile: File, caption: string) => void;
};

type PointerState = {
  pointerId: number;
  x: number;
  y: number;
};

const MIN_SCALE = 1;
const MAX_SCALE = 4;

export default function ProfileGalleryPhotoEditorScreen({
  file,
  uploading = false,
  onCancel,
  onConfirm,
}: ProfileGalleryPhotoEditorScreenProps) {
  const { t } = useI18n();
  const frameRef = useRef<HTMLDivElement>(null);
  const pointersRef = useRef<Map<number, PointerState>>(new Map());
  const pinchStartDistanceRef = useRef<number | null>(null);
  const pinchStartScaleRef = useRef(1);
  const dragStartRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(
    null
  );

  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<EditorStep>("crop");
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [loadingImage, setLoadingImage] = useState(true);
  const [aspectRatio, setAspectRatio] = useState<GalleryAspectRatio>("portrait");
  const [transform, setTransform] = useState<CropTransform>(DEFAULT_CROP_TRANSFORM);
  const [effect, setEffect] = useState<GalleryPhotoEffect>("original");
  const [caption, setCaption] = useState("");
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });
  const [effectPreviews, setEffectPreviews] = useState<Partial<Record<GalleryPhotoEffect, string>>>(
    {}
  );
  const [exporting, setExporting] = useState(false);
  const [imageRenderFallback, setImageRenderFallback] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  // Keyed on `file` — every field here is state for *this* photo only. If this screen is ever
  // reused for a different photo without unmounting, this reset is what stops a previous photo's
  // crop/effect selection from leaking into the next one instead of each photo getting its own.
  useEffect(() => {
    setStep("crop");
    setAspectRatio("portrait");
    setTransform(DEFAULT_CROP_TRANSFORM);
    setEffect("original");
    setCaption("");
    setEffectPreviews({});
    setImageRenderFallback(false);
  }, [file]);

  useEffect(() => {
    let cancelled = false;
    const previewUrl = URL.createObjectURL(file);

    setLoadingImage(true);
    setImage(null);

    const element = new Image();
    element.onload = () => {
      if (!cancelled) {
        setImage(element);
        setLoadingImage(false);
      }
    };
    element.onerror = () => {
      if (!cancelled) {
        setLoadingImage(false);
      }
    };
    element.src = previewUrl;

    return () => {
      cancelled = true;
      URL.revokeObjectURL(previewUrl);
    };
  }, [file]);

  useEffect(() => {
    const frame = frameRef.current;

    if (!frame) {
      return;
    }

    const updateSize = () => {
      const rect = frame.getBoundingClientRect();
      setFrameSize({
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
    };

    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(frame);

    return () => {
      observer.disconnect();
    };
  }, [step, aspectRatio, image]);

  const ratioValue = useMemo(() => {
    if (!image) {
      return 4 / 5;
    }

    return getAspectRatioValue(aspectRatio, image.naturalWidth, image.naturalHeight);
  }, [aspectRatio, image]);

  const displayScale = useMemo(() => {
    if (!image || frameSize.width <= 0 || frameSize.height <= 0) {
      return 1;
    }

    const baseScale = getBaseCoverScale(
      frameSize.width,
      frameSize.height,
      image.naturalWidth,
      image.naturalHeight,
      transform.rotation
    );

    return baseScale * transform.scale;
  }, [frameSize.height, frameSize.width, image, transform.rotation, transform.scale]);

  const rotatedSize = useMemo(() => {
    if (!image) {
      return { width: 0, height: 0 };
    }

    return getRotatedImageSize(image.naturalWidth, image.naturalHeight, transform.rotation);
  }, [image, transform.rotation]);

  // Baked-in (not transform: scale()) on-screen size for previews that apply a CSS `filter`.
  // WebKit has to rasterize a filtered layer at its *layout* box size before any transform is
  // composited on top — laying the element out at the photo's full native resolution (a modern
  // phone photo is easily 3000-4000px on a side) and shrinking it via `scale()` still forces an
  // offscreen filter buffer that large. WebKit silently renders that as a black layer once it
  // exceeds its backing-store limit, which is exactly the "picking any effect turns the preview
  // black" bug — the unfiltered crop step never allocates that buffer, so it never shows it.
  // Baking the scale into width/height instead keeps the filtered raster at the actual on-screen
  // size (a few hundred px), the same trick browsers already do for non-filtered scaled images.
  const filteredPreviewSize = useMemo(
    () => ({
      width: rotatedSize.width * displayScale,
      height: rotatedSize.height * displayScale,
    }),
    [rotatedSize.height, rotatedSize.width, displayScale]
  );

  const resetTransform = useCallback(() => {
    setTransform(DEFAULT_CROP_TRANSFORM);
  }, []);

  const handleRotate = () => {
    setTransform((current) => ({
      ...current,
      rotation: (current.rotation + 90) % 360,
    }));
  };

  const handleZoom = (direction: "in" | "out") => {
    setTransform((current) => ({
      ...current,
      scale: Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, current.scale + (direction === "in" ? 0.15 : -0.15))
      ),
    }));
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (step !== "crop") {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    });

    if (pointersRef.current.size === 1) {
      dragStartRef.current = {
        x: event.clientX,
        y: event.clientY,
        offsetX: transform.offsetX,
        offsetY: transform.offsetY,
      };
    }

    if (pointersRef.current.size === 2) {
      const points = Array.from(pointersRef.current.values());
      const dx = points[0]!.x - points[1]!.x;
      const dy = points[0]!.y - points[1]!.y;
      pinchStartDistanceRef.current = Math.hypot(dx, dy);
      pinchStartScaleRef.current = transform.scale;
      dragStartRef.current = null;
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (step !== "crop" || !pointersRef.current.has(event.pointerId)) {
      return;
    }

    pointersRef.current.set(event.pointerId, {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    });

    if (pointersRef.current.size >= 2) {
      const points = Array.from(pointersRef.current.values());
      const dx = points[0]!.x - points[1]!.x;
      const dy = points[0]!.y - points[1]!.y;
      const distance = Math.hypot(dx, dy);

      if (pinchStartDistanceRef.current && pinchStartDistanceRef.current > 0) {
        const nextScale =
          pinchStartScaleRef.current * (distance / pinchStartDistanceRef.current);

        setTransform((current) => ({
          ...current,
          scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale)),
        }));
      }

      return;
    }

    const dragStart = dragStartRef.current;

    if (!dragStart) {
      return;
    }

    setTransform((current) => ({
      ...current,
      offsetX: dragStart.offsetX + (event.clientX - dragStart.x),
      offsetY: dragStart.offsetY + (event.clientY - dragStart.y),
    }));
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);

    if (pointersRef.current.size < 2) {
      pinchStartDistanceRef.current = null;
    }

    if (pointersRef.current.size === 0) {
      dragStartRef.current = null;
    }
  };

  const buildPreviewCanvas = useCallback(async () => {
    if (!image || frameSize.width <= 0 || frameSize.height <= 0) {
      return null;
    }

    const previewCanvas = document.createElement("canvas");
    previewCanvas.width = 240;
    previewCanvas.height = Math.round(240 / ratioValue);

    const ctx = previewCanvas.getContext("2d");

    if (!ctx) {
      return null;
    }

    const scaleFactor = previewCanvas.width / frameSize.width;
    const baseScale = getBaseCoverScale(
      frameSize.width,
      frameSize.height,
      image.naturalWidth,
      image.naturalHeight,
      transform.rotation
    );
    const totalScale = baseScale * transform.scale;

    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
    ctx.save();
    ctx.translate(
      previewCanvas.width / 2 + transform.offsetX * scaleFactor,
      previewCanvas.height / 2 + transform.offsetY * scaleFactor
    );
    ctx.rotate((transform.rotation * Math.PI) / 180);
    ctx.scale(totalScale * scaleFactor, totalScale * scaleFactor);
    ctx.drawImage(
      image,
      -image.naturalWidth / 2,
      -image.naturalHeight / 2,
      image.naturalWidth,
      image.naturalHeight
    );
    ctx.restore();

    return previewCanvas;
  }, [frameSize.height, frameSize.width, image, ratioValue, transform]);

  useEffect(() => {
    if (step !== "effects") {
      return;
    }

    let cancelled = false;

    void (async () => {
      const previewCanvas = await buildPreviewCanvas();

      if (!previewCanvas || cancelled) {
        return;
      }

      const entries = await Promise.all(
        GALLERY_PHOTO_EFFECTS.map(async (item) => {
          const dataUrl = await renderEffectPreviewDataUrl(previewCanvas, item);
          return [item, dataUrl] as const;
        })
      );

      if (!cancelled) {
        setEffectPreviews(Object.fromEntries(entries));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [buildPreviewCanvas, step]);

  const handleConfirmUpload = async () => {
    if (!image || frameSize.width <= 0 || frameSize.height <= 0 || exporting || uploading) {
      return;
    }

    setExporting(true);

    try {
      const editedFile = await exportEditedGalleryPhoto({
        image,
        aspectRatio,
        transform,
        effect,
        frameWidth: frameSize.width,
        frameHeight: frameSize.height,
        fileName: file.name,
      });

      onConfirm(editedFile, caption.trim());
    } catch (error) {
      console.error("[Gallery editor] export failed", error);
    } finally {
      setExporting(false);
    }
  };

  const stepTitle =
    step === "crop"
      ? t("profile.galleryEditor.crop")
      : step === "effects"
        ? t("profile.galleryEditor.effects")
        : t("profile.galleryEditor.caption");

  if (!mounted || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[220] flex flex-col bg-black" role="dialog" aria-modal="true">
      <header className="flex shrink-0 items-center justify-between px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => {
            if (step === "crop") {
              onCancel();
              return;
            }

            setStep(step === "caption" ? "effects" : "crop");
          }}
          className="inline-flex h-10 min-w-10 items-center justify-center rounded-full px-2 text-sm font-medium text-white transition hover:bg-white/10"
        >
          {step === "crop" ? (
            <>
              <X className="mr-1 h-4 w-4" aria-hidden />
              {t("common.cancel")}
            </>
          ) : (
            <>
              <ArrowLeft className="mr-1 h-4 w-4" aria-hidden />
              {t("common.back")}
            </>
          )}
        </button>

        <p className="text-sm font-semibold text-white">{stepTitle}</p>

        {step === "crop" ? (
          <button
            type="button"
            onClick={() => setStep("effects")}
            disabled={loadingImage || !image}
            className="inline-flex h-10 min-w-10 items-center justify-center rounded-full px-3 text-sm font-semibold text-cyan-300 transition hover:bg-white/10 disabled:opacity-50"
          >
            {t("profile.galleryEditor.next")}
          </button>
        ) : step === "effects" ? (
          <button
            type="button"
            onClick={() => setStep("caption")}
            className="inline-flex h-10 min-w-10 items-center justify-center rounded-full px-3 text-sm font-semibold text-cyan-300 transition hover:bg-white/10"
          >
            {t("profile.galleryEditor.next")}
          </button>
        ) : (
          <button
            type="button"
            disabled={exporting || uploading || !image}
            onClick={() => void handleConfirmUpload()}
            className="inline-flex h-10 min-w-10 items-center justify-center rounded-full px-3 text-sm font-semibold text-cyan-300 transition hover:bg-white/10 disabled:opacity-50"
          >
            {exporting || uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <>
                <Check className="mr-1 h-4 w-4" aria-hidden />
                {t("profile.galleryEditor.upload")}
              </>
            )}
          </button>
        )}
      </header>

      {step === "crop" ? (
        <>
          <div className="flex min-h-0 flex-1 items-center justify-center px-4">
            <div
              ref={frameRef}
              className="relative w-full max-w-md overflow-hidden bg-black touch-none"
              style={{ aspectRatio: ratioValue }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerEnd}
              onPointerCancel={handlePointerEnd}
            >
              {loadingImage || !image ? (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-white/70" aria-hidden />
                </div>
              ) : (
                <div className="absolute inset-0 overflow-hidden">
                  <img
                    src={image.src}
                    alt=""
                    draggable={false}
                    className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
                    style={{
                      width: rotatedSize.width,
                      height: rotatedSize.height,
                      transform: `translate(calc(-50% + ${transform.offsetX}px), calc(-50% + ${transform.offsetY}px)) rotate(${transform.rotation}deg) scale(${displayScale})`,
                      transformOrigin: "center center",
                    }}
                  />
                  <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/25" />
                </div>
              )}
            </div>
          </div>

          <div className="shrink-0 space-y-3 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center justify-center gap-2">
              {(["portrait", "square", "original"] as GalleryAspectRatio[]).map((ratio) => (
                <button
                  key={ratio}
                  type="button"
                  onClick={() => {
                    setAspectRatio(ratio);
                    resetTransform();
                  }}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    aspectRatio === ratio
                      ? "bg-white text-black"
                      : "bg-white/10 text-white hover:bg-white/15"
                  }`}
                >
                  {ratio === "portrait"
                    ? t("profile.galleryEditor.ratioPortrait")
                    : ratio === "square"
                      ? t("profile.galleryEditor.ratioSquare")
                      : t("profile.galleryEditor.ratioOriginal")}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => handleZoom("out")}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/15"
                aria-label={t("profile.galleryEditor.zoomOut")}
              >
                <ZoomOut className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={handleRotate}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/15"
                aria-label={t("profile.galleryEditor.rotate")}
              >
                <RotateCw className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => handleZoom("in")}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/15"
                aria-label={t("profile.galleryEditor.zoomIn")}
              >
                <ZoomIn className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={resetTransform}
                className="inline-flex h-10 items-center justify-center gap-1 rounded-full bg-white/10 px-3 text-xs font-semibold text-white transition hover:bg-white/15"
              >
                <Undo2 className="h-4 w-4" aria-hidden />
                {t("profile.galleryEditor.reset")}
              </button>
            </div>
          </div>
        </>
      ) : null}

      {step === "effects" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-1 items-center justify-center px-4">
            <div
              className="relative w-full max-w-md overflow-hidden bg-black"
              style={{ aspectRatio: ratioValue }}
            >
              {image ? (
                <img
                  src={image.src}
                  alt=""
                  draggable={false}
                  onError={() => setImageRenderFallback(true)}
                  className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
                  style={{
                    width: filteredPreviewSize.width,
                    height: filteredPreviewSize.height,
                    filter: imageRenderFallback ? "none" : getEffectCssFilter(effect),
                    transform: `translate(calc(-50% + ${transform.offsetX}px), calc(-50% + ${transform.offsetY}px)) rotate(${transform.rotation}deg)`,
                    transformOrigin: "center center",
                  }}
                />
              ) : null}
            </div>
          </div>

          <div className="shrink-0 border-t border-white/10 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-white/60">
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
              {t("profile.galleryEditor.effects")}
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {GALLERY_PHOTO_EFFECTS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setEffect(item)}
                  className={`flex w-20 shrink-0 flex-col items-center gap-1.5 rounded-xl p-1 transition ${
                    effect === item ? "bg-white/12 ring-1 ring-cyan-300/60" : "hover:bg-white/5"
                  }`}
                >
                  <span className="block h-16 w-16 overflow-hidden rounded-lg bg-slate-900">
                    {effectPreviews[item] ? (
                      <img src={effectPreviews[item]} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center">
                        <Loader2 className="h-4 w-4 animate-spin text-white/50" aria-hidden />
                      </span>
                    )}
                  </span>
                  <span className="text-[11px] font-medium text-white/85">
                    {t(`profile.galleryEditor.effect.${item}`)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {step === "caption" ? (
        <div className="flex min-h-0 flex-1 flex-col px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto mb-5 w-full max-w-md overflow-hidden rounded-2xl bg-slate-950 ring-1 ring-white/10">
            <div className="relative w-full" style={{ aspectRatio: ratioValue }}>
              {image ? (
                <img
                  src={image.src}
                  alt=""
                  draggable={false}
                  onError={() => setImageRenderFallback(true)}
                  className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
                  style={{
                    width: filteredPreviewSize.width,
                    height: filteredPreviewSize.height,
                    filter: imageRenderFallback ? "none" : getEffectCssFilter(effect),
                    transform: `translate(calc(-50% + ${transform.offsetX}px), calc(-50% + ${transform.offsetY}px)) rotate(${transform.rotation}deg)`,
                    transformOrigin: "center center",
                  }}
                />
              ) : null}
            </div>
          </div>

          <label className="mx-auto block w-full max-w-md">
            <span className="mb-2 block text-sm font-medium text-white/80">
              {t("profile.galleryEditor.captionLabel")}
            </span>
            <textarea
              value={caption}
              onChange={(event) =>
                setCaption(event.target.value.slice(0, GALLERY_DESCRIPTION_MAX_LENGTH))
              }
              rows={4}
              placeholder={t("profile.galleryDescriptionPlaceholder")}
              className="w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/35 focus:border-cyan-300/40 focus:outline-none focus:ring-2 focus:ring-cyan-300/20"
            />
            <span className="mt-1 block text-right text-xs text-white/40">
              {caption.length}/{GALLERY_DESCRIPTION_MAX_LENGTH}
            </span>
          </label>
        </div>
      ) : null}
    </div>,
    document.body
  );
}
