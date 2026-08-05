"use client";

import { useCallback, useEffect, useRef, useState, type TouchEvent as ReactTouchEvent } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { normalizeAvatarUrl } from "@/lib/avatarUrl";

const MAX_SCALE = 4;
const MIN_SCALE = 1;
const HISTORY_STATE_KEY = "spotdrop-profile-photo-viewer";

type Point = { x: number; y: number };

type ProfilePhotoViewerProps = {
  src: string;
  onClose: () => void;
};

/**
 * Full-screen profile photo lightbox: black backdrop, object-contain, pinch-zoom + pan.
 * Pushes a history entry so system Back / swipe-back close this viewer first.
 */
export default function ProfilePhotoViewer({ src, onClose }: ProfilePhotoViewerProps) {
  const { t } = useI18n();
  const url = normalizeAvatarUrl(src);
  const [mounted, setMounted] = useState(false);
  const scaleRef = useRef(1);
  const translateRef = useRef<Point>({ x: 0, y: 0 });
  const imgRef = useRef<HTMLImageElement>(null);
  const gestureRef = useRef<{
    mode: "pinch" | "pan";
    startDistance: number;
    startScale: number;
    startMid: Point;
    startTranslate: Point;
  } | null>(null);
  const closingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const applyTransform = useCallback(() => {
    const img = imgRef.current;

    if (!img) {
      return;
    }

    const { x, y } = translateRef.current;
    img.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scaleRef.current})`;
  }, []);

  const requestClose = useCallback(() => {
    if (closingRef.current) {
      return;
    }

    closingRef.current = true;

    if (typeof window !== "undefined" && window.history.state?.[HISTORY_STATE_KEY]) {
      window.history.back();
      return;
    }

    onCloseRef.current();
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !url) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    window.history.pushState({ [HISTORY_STATE_KEY]: true }, "", window.location.href);

    const onPopState = () => {
      closingRef.current = true;
      onCloseRef.current();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
      }
    };

    window.addEventListener("popstate", onPopState);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("keydown", onKeyDown);

      // If unmounted without history.back (e.g. route change), drop the synthetic entry.
      if (!closingRef.current && window.history.state?.[HISTORY_STATE_KEY]) {
        window.history.back();
      }
    };
  }, [mounted, requestClose, url]);

  useEffect(() => {
    if (!url) {
      onCloseRef.current();
    }
  }, [url]);

  if (!mounted || !url) {
    return null;
  }

  const onTouchStart = (event: ReactTouchEvent) => {
    if (event.touches.length === 2) {
      const a = event.touches[0]!;
      const b = event.touches[1]!;
      gestureRef.current = {
        mode: "pinch",
        startDistance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1,
        startScale: scaleRef.current,
        startMid: { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 },
        startTranslate: { ...translateRef.current },
      };
      return;
    }

    if (event.touches.length === 1 && scaleRef.current > 1.02) {
      const touch = event.touches[0]!;
      gestureRef.current = {
        mode: "pan",
        startDistance: 1,
        startScale: scaleRef.current,
        startMid: { x: touch.clientX, y: touch.clientY },
        startTranslate: { ...translateRef.current },
      };
    }
  };

  const onTouchMove = (event: ReactTouchEvent) => {
    const gesture = gestureRef.current;

    if (!gesture) {
      return;
    }

    event.preventDefault();

    if (gesture.mode === "pinch" && event.touches.length === 2) {
      const a = event.touches[0]!;
      const b = event.touches[1]!;
      const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1;
      const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, gesture.startScale * (distance / gesture.startDistance)));
      scaleRef.current = nextScale;

      if (nextScale <= 1.01) {
        translateRef.current = { x: 0, y: 0 };
      }

      applyTransform();
      return;
    }

    if (gesture.mode === "pan" && event.touches.length === 1 && scaleRef.current > 1.02) {
      const touch = event.touches[0]!;
      translateRef.current = {
        x: gesture.startTranslate.x + (touch.clientX - gesture.startMid.x),
        y: gesture.startTranslate.y + (touch.clientY - gesture.startMid.y),
      };
      applyTransform();
    }
  };

  const onTouchEnd = (event: ReactTouchEvent) => {
    if (event.touches.length === 0) {
      gestureRef.current = null;

      if (scaleRef.current < 1.02) {
        scaleRef.current = 1;
        translateRef.current = { x: 0, y: 0 };
        applyTransform();
      }
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[560] flex flex-col bg-black overscroll-none"
      role="dialog"
      aria-modal="true"
      aria-label={t("profileAvatar.photoTitle")}
      data-profile-photo-viewer
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-end px-3"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top, 0px))" }}
      >
        <button
          type="button"
          onClick={requestClose}
          className="pointer-events-auto inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/20 backdrop-blur-sm transition hover:bg-black/70"
          aria-label={t("common.close")}
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <div
        className="flex min-h-0 flex-1 touch-none items-center justify-center overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={url}
          alt={t("profileAvatar.photoTitle")}
          className="max-h-full max-w-full select-none object-contain"
          draggable={false}
          style={{ transformOrigin: "center center", willChange: "transform" }}
        />
      </div>
    </div>,
    document.body
  );
}
