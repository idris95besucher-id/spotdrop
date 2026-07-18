"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

/** How far a pinch can zoom in, relative to the photo's normal size. */
const MAX_SCALE = 4;
const MIN_SCALE = 1;
/** Once zoomed past this, a single remaining finger pans instead of releasing the gesture. */
const PAN_ENGAGE_SCALE = 1.02;
const SPRING_BACK_MS = 300;
const BACKDROP_FADE_IN_MS = 150;
/** Slight overshoot so the release reads as a "spring" rather than a plain ease-out. */
const SPRING_EASING = "cubic-bezier(0.34, 1.56, 0.64, 1)";
const MAX_BACKDROP_OPACITY = 0.92;
/** Above every other overlay in the app (bottom sheets, edit screen, comments, ...). */
const OVERLAY_Z_INDEX = 500;

type Point = { x: number; y: number };
type Rect = { left: number; top: number; width: number; height: number };

type Gesture = {
  mode: "pinch" | "pan";
  startDistance: number;
  startScale: number;
  startMid: Point;
  startTranslate: Point;
};

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

type ZoomableImageProps = {
  src: string;
  alt?: string;
  /** Sizing classes only — object-fit is controlled by `objectFit` so the full-screen overlay
   *  clone can reproduce it without inheriting any width/height classes meant for the in-feed box. */
  imageClassName?: string;
  objectFit?: "contain" | "cover";
  draggable?: boolean;
  loading?: "lazy" | "eager";
  decoding?: "async" | "sync" | "auto";
  onError?: () => void;
};

/**
 * Instagram-style pinch-to-zoom for a single photo, shared by the Private Profile gallery feed
 * and the My Profile Spots feed.
 *
 * While a pinch is active, the photo is rendered a second time as a fixed, full-screen overlay
 * clone (via a portal, above every other layer in the app) positioned exactly over the original
 * — so scaling it is never clipped by the post card, and it visually sits above the feed, header,
 * likes, and comments, which a dimming backdrop fades in behind it. The original in-feed image is
 * hidden for as long as the overlay is showing so there is never a doubled image.
 *
 * Deliberately released, not persistent: the instant every finger lifts, the clone springs back
 * to the exact position/size of the original and the overlay is torn down — there is no "stays
 * zoomed" state to carry across cards, which would fight the feed's own vertical scroll/recycling.
 *
 * A bare one-finger touch on the photo never calls preventDefault and never opens the overlay, so
 * normal vertical feed scrolling and the shared swipe-right-to-close gesture keep working exactly
 * as if this component weren't here — both are only ever claimed for the lifetime of an actual
 * pinch/pan.
 */
export default function ZoomableImage({
  src,
  alt = "",
  imageClassName,
  objectFit = "cover",
  draggable = false,
  loading,
  decoding,
  onError,
}: ZoomableImageProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const overlayImgRef = useRef<HTMLImageElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  const scaleRef = useRef(1);
  const translateRef = useRef<Point>({ x: 0, y: 0 });
  const originRef = useRef<Point>({ x: 50, y: 50 });
  const overlayRectRef = useRef<Rect>({ left: 0, top: 0, width: 0, height: 0 });
  const gestureRef = useRef<Gesture | null>(null);

  const [overlayRect, setOverlayRect] = useState<Rect | null>(null);

  const applyOverlayTransform = useCallback((withTransition: boolean) => {
    const overlayImg = overlayImgRef.current;

    if (!overlayImg) {
      return;
    }

    overlayImg.style.transition = withTransition ? `transform ${SPRING_BACK_MS}ms ${SPRING_EASING}` : "none";
    overlayImg.style.transformOrigin = `${originRef.current.x}% ${originRef.current.y}%`;
    overlayImg.style.transform = `translate3d(${translateRef.current.x}px, ${translateRef.current.y}px, 0) scale(${scaleRef.current})`;
  }, []);

  const setBackdropOpacity = useCallback((opacity: number, withTransition: boolean) => {
    const backdrop = backdropRef.current;

    if (!backdrop) {
      return;
    }

    backdrop.style.transition = withTransition
      ? `opacity ${opacity > 0 ? BACKDROP_FADE_IN_MS : SPRING_BACK_MS}ms ease-out`
      : "none";
    backdrop.style.opacity = String(opacity);
  }, []);

  const setClaimingGesture = useCallback((claiming: boolean) => {
    const wrapper = wrapperRef.current;

    if (!wrapper) {
      return;
    }

    // pan-y while at rest so vertical feed scroll and swipe-back keep working untouched;
    // none only for the lifetime of an active pinch/pan so the browser never fights it.
    wrapper.style.touchAction = claiming ? "none" : "pan-y";
  }, []);

  const closeOverlay = useCallback(() => {
    scaleRef.current = 1;
    translateRef.current = { x: 0, y: 0 };
    originRef.current = { x: 50, y: 50 };
    setBackdropOpacity(0, true);
    applyOverlayTransform(true);
    setClaimingGesture(false);

    window.setTimeout(() => {
      setOverlayRect(null);

      const img = imgRef.current;

      if (img) {
        img.style.opacity = "1";
      }
    }, SPRING_BACK_MS + 20);
  }, [applyOverlayTransform, setBackdropOpacity, setClaimingGesture]);

  const openOverlay = useCallback((originPoint: Point) => {
    const img = imgRef.current;

    if (!img) {
      return;
    }

    const rect = img.getBoundingClientRect();

    overlayRectRef.current = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    originRef.current = {
      x: rect.width > 0 ? ((originPoint.x - rect.left) / rect.width) * 100 : 50,
      y: rect.height > 0 ? ((originPoint.y - rect.top) / rect.height) * 100 : 50,
    };

    img.style.opacity = "0";
    setOverlayRect(overlayRectRef.current);
  }, []);

  // The overlay portal only exists in the real DOM once `overlayRect` has committed and React
  // has re-rendered — `backdropRef`/`overlayImgRef` are still null in the same synchronous
  // touchstart handler that calls `openOverlay`. Without this effect (and without `overlayRect`
  // as its dependency), the very first backdrop fade-in would silently no-op forever, because by
  // the time the nodes exist nothing ever asks them to fade in again.
  useLayoutEffect(() => {
    if (!overlayRect) {
      return;
    }

    setBackdropOpacity(MAX_BACKDROP_OPACITY, true);
    applyOverlayTransform(false);
  }, [overlayRect, setBackdropOpacity, applyOverlayTransform]);

  useEffect(() => {
    const wrapper = wrapperRef.current;

    if (!wrapper) {
      return;
    }

    const clientPoint = (touch: Touch): Point => ({ x: touch.clientX, y: touch.clientY });

    const handleTouchStart = (event: TouchEvent) => {
      const touches = event.touches;

      if (touches.length >= 2) {
        const p0 = clientPoint(touches[0]!);
        const p1 = clientPoint(touches[1]!);
        const mid = midpoint(p0, p1);

        // A brand-new pinch (not a third finger joining one already in progress) opens the
        // full-screen overlay and anchors the zoom exactly on the fingers' current midpoint.
        if (gestureRef.current?.mode !== "pinch") {
          openOverlay(mid);
        }

        gestureRef.current = {
          mode: "pinch",
          startDistance: distance(p0, p1),
          startScale: scaleRef.current,
          startMid: mid,
          startTranslate: { ...translateRef.current },
        };
        setClaimingGesture(true);
        setBackdropOpacity(MAX_BACKDROP_OPACITY, true);
        applyOverlayTransform(false);
        event.preventDefault();
        return;
      }

      if (touches.length === 1 && scaleRef.current > PAN_ENGAGE_SCALE) {
        gestureRef.current = {
          mode: "pan",
          startDistance: 0,
          startScale: scaleRef.current,
          startMid: clientPoint(touches[0]!),
          startTranslate: { ...translateRef.current },
        };
        applyOverlayTransform(false);
        event.preventDefault();
        return;
      }

      // A single finger on a photo that isn't zoomed: leave completely untouched so scrolling
      // and swipe-back behave as if this component weren't here.
      gestureRef.current = null;
    };

    const handleTouchMove = (event: TouchEvent) => {
      const gesture = gestureRef.current;

      if (!gesture) {
        return;
      }

      const touches = event.touches;

      if (gesture.mode === "pinch" && touches.length >= 2) {
        const p0 = clientPoint(touches[0]!);
        const p1 = clientPoint(touches[1]!);
        const currentDistance = distance(p0, p1);
        const currentMid = midpoint(p0, p1);
        const rawScale =
          gesture.startDistance > 0
            ? gesture.startScale * (currentDistance / gesture.startDistance)
            : gesture.startScale;

        scaleRef.current = Math.min(MAX_SCALE, Math.max(MIN_SCALE, rawScale));
        translateRef.current = {
          x: gesture.startTranslate.x + (currentMid.x - gesture.startMid.x),
          y: gesture.startTranslate.y + (currentMid.y - gesture.startMid.y),
        };
        applyOverlayTransform(false);
        event.preventDefault();
        return;
      }

      if (gesture.mode === "pan" && touches.length === 1) {
        const p0 = clientPoint(touches[0]!);

        translateRef.current = {
          x: gesture.startTranslate.x + (p0.x - gesture.startMid.x),
          y: gesture.startTranslate.y + (p0.y - gesture.startMid.y),
        };
        applyOverlayTransform(false);
        event.preventDefault();
      }
    };

    const handleTouchEnd = (event: TouchEvent) => {
      if (!gestureRef.current) {
        return;
      }

      const remaining = event.touches.length;

      if (remaining >= 2) {
        // Still pinching with the fingers that are left down.
        return;
      }

      if (remaining === 1 && scaleRef.current > PAN_ENGAGE_SCALE) {
        // One finger lifted out of a pinch — hand off to panning with whichever finger remains.
        gestureRef.current = {
          mode: "pan",
          startDistance: 0,
          startScale: scaleRef.current,
          startMid: clientPoint(event.touches[0]!),
          startTranslate: { ...translateRef.current },
        };
        return;
      }

      // Every finger is up: spring back and tear down the overlay.
      gestureRef.current = null;
      closeOverlay();
    };

    const handleTouchCancel = () => {
      gestureRef.current = null;
      closeOverlay();
    };

    wrapper.addEventListener("touchstart", handleTouchStart, { passive: false });
    wrapper.addEventListener("touchmove", handleTouchMove, { passive: false });
    wrapper.addEventListener("touchend", handleTouchEnd, { passive: true });
    wrapper.addEventListener("touchcancel", handleTouchCancel, { passive: true });

    return () => {
      wrapper.removeEventListener("touchstart", handleTouchStart);
      wrapper.removeEventListener("touchmove", handleTouchMove);
      wrapper.removeEventListener("touchend", handleTouchEnd);
      wrapper.removeEventListener("touchcancel", handleTouchCancel);
    };
  }, [applyOverlayTransform, closeOverlay, openOverlay, setBackdropOpacity, setClaimingGesture]);

  const overlayImageStyle: CSSProperties | undefined = overlayRect
    ? {
        position: "fixed",
        left: overlayRect.left,
        top: overlayRect.top,
        width: overlayRect.width,
        height: overlayRect.height,
        objectFit,
        pointerEvents: "none",
        transform: "translate3d(0, 0, 0) scale(1)",
      }
    : undefined;

  return (
    <>
      <div ref={wrapperRef} className="relative" style={{ touchAction: "pan-y" }}>
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          draggable={draggable}
          loading={loading}
          decoding={decoding}
          onError={onError}
          style={{ objectFit }}
          className={`select-none ${imageClassName ?? ""}`}
        />
      </div>

      {overlayRect && typeof document !== "undefined"
        ? createPortal(
            <div
              aria-hidden
              style={{
                position: "fixed",
                inset: 0,
                zIndex: OVERLAY_Z_INDEX,
                pointerEvents: "none",
              }}
            >
              <div ref={backdropRef} className="absolute inset-0 bg-black" style={{ opacity: 0 }} />
              <img ref={overlayImgRef} src={src} alt="" style={overlayImageStyle} />
            </div>,
            document.body
          )
        : null}
    </>
  );
}
