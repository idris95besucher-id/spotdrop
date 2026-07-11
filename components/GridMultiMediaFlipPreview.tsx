"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadGridFlipPreviewMedia, type GridFlipPreviewMedia } from "@/lib/gridCarouselPreview";
import {
  registerGridVideoPreview,
  releaseGridVideoPreview,
  tryPlayGridVideoPreview,
} from "@/lib/gridVideoPreviewControl";

const GRID_FLIP_DELAY_MS = 900;
const GRID_FLIP_DURATION_MS = 320;
const GRID_VIDEO_PREVIEW_SECONDS = 2.5;
const PAGE_PERSPECTIVE_PX = 1000;

type PreviewPhase = "idle" | "waiting" | "flip-forward" | "playing" | "flip-back";

type GridMultiMediaFlipPreviewProps = {
  postId: string;
  fallbackPhotoUrl: string;
  className?: string;
  imageClassName?: string;
};

export default function GridMultiMediaFlipPreview({
  postId,
  fallbackPhotoUrl,
  className = "",
  imageClassName = "h-full w-full object-cover",
}: GridMultiMediaFlipPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const timerRef = useRef<number | null>(null);
  const phaseRef = useRef<PreviewPhase>("idle");
  const isVisibleRef = useRef(false);
  const mediaRef = useRef<GridFlipPreviewMedia | null>(null);

  const [isVisible, setIsVisible] = useState(false);
  const [flipMedia, setFlipMedia] = useState<GridFlipPreviewMedia | null | undefined>(undefined);
  const [phase, setPhase] = useState<PreviewPhase>("idle");
  const [pageOpen, setPageOpen] = useState(false);
  const [videoReady, setVideoReady] = useState(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const resetPreview = useCallback(() => {
    clearTimer();
    phaseRef.current = "idle";
    setPhase("idle");
    setPageOpen(false);
    setVideoReady(false);

    const video = videoRef.current;

    if (video) {
      releaseGridVideoPreview(video);

      try {
        video.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
  }, [clearTimer]);

  const schedule = useCallback((callback: () => void, delayMs: number) => {
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      callback();
    }, delayMs);
  }, [clearTimer]);

  const setPhaseSafe = useCallback((next: PreviewPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const runFlipForward = useCallback(() => {
    if (!isVisibleRef.current || !mediaRef.current) {
      return;
    }

    setPhaseSafe("flip-forward");
    setPageOpen(true);

    schedule(() => {
      if (!isVisibleRef.current || phaseRef.current !== "flip-forward") {
        return;
      }

      setPhaseSafe("playing");

      const video = videoRef.current;

      if (video && tryPlayGridVideoPreview(video)) {
        void video.play().catch(() => undefined);
      }

      schedule(() => {
        if (!isVisibleRef.current || phaseRef.current !== "playing") {
          return;
        }

        const activeVideo = videoRef.current;

        if (activeVideo) {
          activeVideo.pause();
          releaseGridVideoPreview(activeVideo);
        }

        setPhaseSafe("flip-back");
        setPageOpen(false);

        schedule(() => {
          if (!isVisibleRef.current) {
            resetPreview();
            return;
          }

          resetPreview();
        }, GRID_FLIP_DURATION_MS);
      }, GRID_VIDEO_PREVIEW_SECONDS * 1000);
    }, GRID_FLIP_DURATION_MS);
  }, [resetPreview, schedule, setPhaseSafe]);

  const startSequence = useCallback(() => {
    if (!mediaRef.current || phaseRef.current !== "idle") {
      return;
    }

    setPhaseSafe("waiting");
    schedule(runFlipForward, GRID_FLIP_DELAY_MS);
  }, [runFlipForward, schedule, setPhaseSafe]);

  useEffect(() => {
    setFlipMedia(undefined);
    mediaRef.current = null;
    resetPreview();
  }, [postId, fallbackPhotoUrl, resetPreview]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    const video = videoRef.current;

    if (!video || !flipMedia) {
      return;
    }

    return registerGridVideoPreview(video);
  }, [flipMedia?.videoUrl]);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const visible = entry.isIntersecting;
          isVisibleRef.current = visible;
          setIsVisible(visible);

          if (!visible) {
            resetPreview();
            return;
          }

          if (flipMedia === undefined) {
            void loadGridFlipPreviewMedia(postId).then((media) => {
              if (!isVisibleRef.current) {
                return;
              }

              mediaRef.current = media;
              setFlipMedia(media);
            });
          }
        }
      },
      { threshold: 0.4, rootMargin: "24px 0px" }
    );

    observer.observe(container);

    return () => {
      observer.disconnect();
      resetPreview();
    };
  }, [flipMedia, postId, resetPreview]);

  useEffect(() => {
    if (!isVisible || !flipMedia) {
      return;
    }

    mediaRef.current = flipMedia;
    startSequence();
  }, [flipMedia, isVisible, startSequence]);

  const photoUrl = flipMedia?.photoUrl ?? fallbackPhotoUrl;
  const showFlip = Boolean(flipMedia);
  const isTransitioning = phase === "flip-forward" || phase === "flip-back";
  const pageShadow = isTransitioning ? "-10px 0 28px rgba(0, 0, 0, 0.38)" : "none";

  if (!showFlip) {
    return (
      <div
        ref={containerRef}
        className={`relative overflow-hidden bg-black ${className}`}
      >
        <img
          src={fallbackPhotoUrl}
          alt=""
          draggable={false}
          loading="lazy"
          decoding="async"
          className={`select-none touch-manipulation ${imageClassName}`}
        />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden bg-black ${className}`}
      style={{
        perspective: `${PAGE_PERSPECTIVE_PX}px`,
        perspectiveOrigin: "center center",
      }}
    >
      <div className="absolute inset-0 bg-black">
        {flipMedia!.videoPoster ? (
          <img
            src={flipMedia!.videoPoster}
            alt=""
            draggable={false}
            decoding="async"
            className={`absolute inset-0 ${imageClassName}`}
          />
        ) : null}
        <video
          ref={videoRef}
          src={flipMedia!.videoUrl}
          poster={flipMedia!.videoPoster ?? undefined}
          muted
          playsInline
          controls={false}
          preload={isVisible ? "auto" : "metadata"}
          disablePictureInPicture
          disableRemotePlayback
          controlsList="nodownload nofullscreen noremoteplayback"
          data-grid-video-preview="true"
          className={`absolute inset-0 ${imageClassName} transition-opacity duration-200 ${
            videoReady && pageOpen ? "opacity-100" : "opacity-0"
          }`}
          onLoadedData={() => setVideoReady(true)}
          onCanPlay={() => setVideoReady(true)}
        />
      </div>

      <div
        className="pointer-events-none absolute inset-0"
        style={{
          transformStyle: "preserve-3d",
          transform: `translate3d(0, 0, 0) rotateY(${pageOpen ? -180 : 0}deg)`,
          transformOrigin: "right center",
          transition: isTransitioning
            ? `transform ${GRID_FLIP_DURATION_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`
            : "none",
          willChange: "transform",
        }}
      >
        <div
          className="absolute inset-0 overflow-hidden bg-black"
          style={{
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            boxShadow: pageShadow,
          }}
        >
          <img
            src={photoUrl}
            alt=""
            draggable={false}
            decoding="async"
            className={`select-none touch-manipulation ${imageClassName}`}
          />
        </div>
        <div
          className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900"
          style={{
            transform: "rotateY(180deg)",
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
          }}
          aria-hidden
        />
      </div>
    </div>
  );
}
