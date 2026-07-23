"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Loader2, X, ZoomIn, ZoomOut } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import {
  DEFAULT_CROP_TRANSFORM,
  exportCroppedAvatar,
  getBaseCoverScale,
  type CropTransform,
} from "@/lib/avatarCrop";

type AvatarCropScreenProps = {
  file: File;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (croppedFile: File) => void;
};

type PointerState = {
  pointerId: number;
  x: number;
  y: number;
};

const MIN_SCALE = 1;
const MAX_SCALE = 4;

/**
 * Max |offset| (px) the image can pan while still fully covering the square frame at `scale`.
 * Without this, panning to an edge exposes the export canvas's black fill — invisible against
 * the crop screen's black chrome, but a solid black patch on the exported avatar.
 */
function getPanBounds(
  image: HTMLImageElement,
  frameSize: number,
  scale: number
): { maxOffsetX: number; maxOffsetY: number } {
  if (!image || frameSize <= 0) {
    return { maxOffsetX: 0, maxOffsetY: 0 };
  }

  const baseScale = getBaseCoverScale(frameSize, frameSize, image.naturalWidth, image.naturalHeight, 0);
  const displayScale = baseScale * scale;

  return {
    maxOffsetX: Math.max(0, (image.naturalWidth * displayScale - frameSize) / 2),
    maxOffsetY: Math.max(0, (image.naturalHeight * displayScale - frameSize) / 2),
  };
}

function clampAxis(value: number, max: number): number {
  return Math.min(max, Math.max(-max, value));
}

export default function AvatarCropScreen({
  file,
  busy = false,
  onCancel,
  onConfirm,
}: AvatarCropScreenProps) {
  const { t } = useI18n();
  const frameRef = useRef<HTMLDivElement>(null);
  const pointersRef = useRef<Map<number, PointerState>>(new Map());
  const pinchStartDistanceRef = useRef<number | null>(null);
  const pinchStartScaleRef = useRef(1);
  const dragStartRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(
    null
  );

  const [mounted, setMounted] = useState(false);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [loadingImage, setLoadingImage] = useState(true);
  const [transform, setTransform] = useState<CropTransform>(DEFAULT_CROP_TRANSFORM);
  const [frameSize, setFrameSize] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    setTransform(DEFAULT_CROP_TRANSFORM);
    setError(null);
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
        setError(t("avatarCrop.loadFailed"));
      }
    };
    element.src = previewUrl;

    return () => {
      cancelled = true;
      URL.revokeObjectURL(previewUrl);
    };
  }, [file, t]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) {
      return;
    }

    const updateSize = () => {
      const rect = frame.getBoundingClientRect();
      setFrameSize(Math.round(Math.min(rect.width, rect.height)));
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [image]);

  useEffect(() => {
    if (!image || frameSize <= 0) {
      return;
    }

    setTransform((current) => {
      const { maxOffsetX, maxOffsetY } = getPanBounds(image, frameSize, current.scale);
      const clampedOffsetX = clampAxis(current.offsetX, maxOffsetX);
      const clampedOffsetY = clampAxis(current.offsetY, maxOffsetY);

      if (clampedOffsetX === current.offsetX && clampedOffsetY === current.offsetY) {
        return current;
      }

      return { ...current, offsetX: clampedOffsetX, offsetY: clampedOffsetY };
    });
  }, [image, frameSize]);

  const displayScale = useMemo(() => {
    if (!image || frameSize <= 0) {
      return 1;
    }

    const baseScale = getBaseCoverScale(
      frameSize,
      frameSize,
      image.naturalWidth,
      image.naturalHeight,
      transform.rotation
    );

    return baseScale * transform.scale;
  }, [frameSize, image, transform.rotation, transform.scale]);

  const handleZoom = (direction: "in" | "out") => {
    setTransform((current) => {
      const nextScale = Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, current.scale + (direction === "in" ? 0.15 : -0.15))
      );

      if (!image || frameSize <= 0) {
        return { ...current, scale: nextScale };
      }

      const { maxOffsetX, maxOffsetY } = getPanBounds(image, frameSize, nextScale);

      return {
        ...current,
        scale: nextScale,
        offsetX: clampAxis(current.offsetX, maxOffsetX),
        offsetY: clampAxis(current.offsetY, maxOffsetY),
      };
    });
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
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
    if (!pointersRef.current.has(event.pointerId)) {
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
        const nextScale = Math.min(
          MAX_SCALE,
          Math.max(MIN_SCALE, pinchStartScaleRef.current * (distance / pinchStartDistanceRef.current))
        );

        setTransform((current) => {
          if (!image || frameSize <= 0) {
            return { ...current, scale: nextScale };
          }

          const { maxOffsetX, maxOffsetY } = getPanBounds(image, frameSize, nextScale);

          return {
            ...current,
            scale: nextScale,
            offsetX: clampAxis(current.offsetX, maxOffsetX),
            offsetY: clampAxis(current.offsetY, maxOffsetY),
          };
        });
      }

      return;
    }

    const dragStart = dragStartRef.current;
    if (!dragStart) {
      return;
    }

    setTransform((current) => {
      const nextOffsetX = dragStart.offsetX + (event.clientX - dragStart.x);
      const nextOffsetY = dragStart.offsetY + (event.clientY - dragStart.y);

      if (!image || frameSize <= 0) {
        return { ...current, offsetX: nextOffsetX, offsetY: nextOffsetY };
      }

      const { maxOffsetX, maxOffsetY } = getPanBounds(image, frameSize, current.scale);

      return {
        ...current,
        offsetX: clampAxis(nextOffsetX, maxOffsetX),
        offsetY: clampAxis(nextOffsetY, maxOffsetY),
      };
    });
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

  const handleDone = useCallback(async () => {
    if (!image || frameSize <= 0 || exporting || busy) {
      return;
    }

    setExporting(true);
    setError(null);

    try {
      const cropped = await exportCroppedAvatar({
        image,
        transform,
        frameSize,
        fileName: "avatar.jpg",
      });
      onConfirm(cropped);
    } catch (caught) {
      console.error("Avatar crop export failed:", caught);
      setError(t("avatarCrop.exportFailed"));
    } finally {
      setExporting(false);
    }
  }, [busy, exporting, frameSize, image, onConfirm, t, transform]);

  if (!mounted) {
    return null;
  }

  const disabled = busy || exporting || loadingImage || !image;

  return createPortal(
    <div className="fixed inset-0 z-[240] flex flex-col bg-black text-white">
      <div
        className="flex shrink-0 items-center justify-between px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]"
      >
        <button
          type="button"
          onClick={onCancel}
          disabled={busy || exporting}
          className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-white/90 transition hover:bg-white/10 disabled:opacity-50"
        >
          <X className="h-4 w-4" aria-hidden />
          {t("common.cancel")}
        </button>
        <p className="text-sm font-semibold tracking-wide">{t("avatarCrop.title")}</p>
        <button
          type="button"
          onClick={() => void handleDone()}
          disabled={disabled}
          className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-3.5 text-sm font-semibold text-slate-950 transition hover:brightness-110 disabled:opacity-50"
        >
          {exporting || busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Check className="h-4 w-4" aria-hidden />
          )}
          {t("avatarCrop.done")}
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-4">
        <p className="mb-4 text-center text-[13px] text-white/55">{t("avatarCrop.hint")}</p>

        <div
          ref={frameRef}
          className="relative aspect-square w-full max-w-[min(100%,22rem)] touch-none overflow-hidden bg-black"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
        >
          {loadingImage || !image ? (
            <div className="flex h-full items-center justify-center text-sm text-white/50">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image.src}
              alt=""
              draggable={false}
              className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
              style={{
                width: image.naturalWidth,
                height: image.naturalHeight,
                transform: `translate(-50%, -50%) translate(${transform.offsetX}px, ${transform.offsetY}px) scale(${displayScale})`,
                transformOrigin: "center center",
              }}
            />
          )}

          {/* Circular clear hole; everything outside is dimmed (Instagram-style). */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_9999px_rgba(0,0,0,0.62)] ring-2 ring-white/85"
          />
        </div>

        {error ? <p className="mt-4 text-center text-sm text-red-300">{error}</p> : null}
      </div>

      <div className="flex shrink-0 items-center justify-center gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <button
          type="button"
          onClick={() => handleZoom("out")}
          disabled={disabled || transform.scale <= MIN_SCALE}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white transition hover:bg-white/10 disabled:opacity-40"
          aria-label={t("avatarCrop.zoomOut")}
        >
          <ZoomOut className="h-5 w-5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => handleZoom("in")}
          disabled={disabled || transform.scale >= MAX_SCALE}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white transition hover:bg-white/10 disabled:opacity-40"
          aria-label={t("avatarCrop.zoomIn")}
        >
          <ZoomIn className="h-5 w-5" aria-hidden />
        </button>
      </div>
    </div>,
    document.body
  );
}
