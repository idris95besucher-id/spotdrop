"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Volume2, VolumeX } from "lucide-react";

const MAX_AUTO_RETRIES = 3;
const RETRY_DELAY_MS = 1200;
const LOAD_TIMEOUT_MS = 3_000;
const SPOT_LOAD_ERROR = "Could not load spot. Try again.";

/**
 * Module-level mute preference that persists while the user scrolls through the
 * reel. Starts muted (required for iOS/Android autoplay). Once the user taps the
 * speaker icon the preference flips and every subsequent slide plays with sound.
 */
let viewerGlobalMuted = true;

type PostReelMediaProps = {
  mediaUrl: string;
  mediaType: "image" | "video";
  posterUrl?: string | null;
  isActive: boolean;
  /** Preload full image/video (poster still shows when false). */
  shouldLoad?: boolean;
  alt?: string;
  onLoadingChange?: (loading: boolean) => void;
};

function cacheBustUrl(url: string, attempt: number) {
  if (attempt <= 0) {
    return url;
  }

  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}retry=${attempt}&t=${Date.now()}`;
}

export default function PostReelMedia({
  mediaUrl,
  mediaType,
  posterUrl,
  isActive,
  shouldLoad = true,
  alt = "",
  onLoadingChange,
}: PostReelMediaProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);

  const [retryKey, setRetryKey] = useState(0);
  const [mediaReady, setMediaReady] = useState(false);
  const [posterReady, setPosterReady] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  // Follows the global preference so all slides share one mute state.
  const [isMuted, setIsMuted] = useState(viewerGlobalMuted);

  const resolvedPoster = posterUrl?.trim() || (mediaType === "image" ? mediaUrl : null);
  const playbackUrl = cacheBustUrl(mediaUrl, retryKey);
  const loadHeavyMedia = shouldLoad || isActive;
  const canPlayVideo = mediaType === "video" && loadHeavyMedia && !videoFailed;
  const canShowImage = mediaType === "image" && loadHeavyMedia;

  const scheduleRetry = useCallback(() => {
    if (retryCountRef.current >= MAX_AUTO_RETRIES) {
      setVideoFailed(true);
      return;
    }

    retryCountRef.current += 1;

    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
    }

    retryTimeoutRef.current = setTimeout(() => {
      setMediaReady(false);
      setVideoFailed(false);
      setRetryKey((current) => current + 1);
    }, RETRY_DELAY_MS);
  }, []);

  useEffect(() => {
    retryCountRef.current = 0;
    setRetryKey(0);
    setMediaReady(false);
    setPosterReady(false);
    setVideoFailed(false);
    setLoadTimedOut(false);
  }, [mediaUrl, mediaType, posterUrl]);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setLoadTimedOut(true);
    }, LOAD_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [isActive, mediaUrl, mediaType, retryKey]);

  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  // Sync mute state when this slide becomes active (respect global preference).
  useEffect(() => {
    if (!isActive) return;
    setIsMuted(viewerGlobalMuted);
    const video = videoRef.current;
    if (video) video.muted = viewerGlobalMuted;
  }, [isActive]);

  useEffect(() => {
    const video = videoRef.current;

    if (!video || mediaType !== "video" || !canPlayVideo) {
      return;
    }

    // Must start muted for iOS/Android autoplay policy.
    // The user can tap the speaker button to unmute.
    video.muted = viewerGlobalMuted;
    video.playsInline = true;
    video.setAttribute("playsinline", "true");
    video.setAttribute("webkit-playsinline", "true");

    if (isActive) {
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        video.load();
      }

      const playWhenReady = () => {
        void video.play().catch(() => {
          /* autoplay blocked — poster stays visible */
        });
      };

      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        playWhenReady();
      } else {
        video.addEventListener("canplay", playWhenReady, { once: true });
        return () => video.removeEventListener("canplay", playWhenReady);
      }

      return;
    }

    video.pause();

    try {
      video.currentTime = 0;
    } catch {
      /* ignore */
    }
  }, [canPlayVideo, isActive, mediaType, playbackUrl]);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    const next = !viewerGlobalMuted;
    viewerGlobalMuted = next;
    setIsMuted(next);
    if (video) {
      video.muted = next;
      // If the video was paused only because autoplay-with-sound was blocked,
      // resume playback now that the user has explicitly interacted.
      if (!next && video.paused && isActive) {
        void video.play().catch(() => undefined);
      }
    }
  }, [isActive]);

  const handleMediaReady = () => {
    setMediaReady(true);
    setVideoFailed(false);
    setLoadTimedOut(false);
    retryCountRef.current = 0;
  };

  const handleMediaError = () => {
    setMediaReady(false);

    if (mediaType === "video" && resolvedPoster) {
      setVideoFailed(true);
      return;
    }

    scheduleRetry();
  };

  const showImageLayer = canShowImage && isActive;
  const hasVisibleMedia =
    (mediaType === "image" && showImageLayer) ||
    (mediaType === "video" && isActive && mediaReady);
  const showPosterLayer =
    Boolean(resolvedPoster) &&
    isActive &&
    mediaType === "video" &&
    !mediaReady &&
    !loadTimedOut &&
    !videoFailed;
  const mediaUnavailable = isActive && (videoFailed || loadTimedOut);
  const showSpinner =
    isActive &&
    mediaType === "video" &&
    !mediaReady &&
    !showPosterLayer &&
    !posterReady &&
    !mediaUnavailable;

  const isLoading =
    isActive &&
    !mediaUnavailable &&
    (mediaType === "image" ? !mediaReady : !mediaReady && !videoFailed);

  useEffect(() => {
    onLoadingChange?.(isLoading);
  }, [isLoading, onLoadingChange]);

  return (
    <div className="absolute inset-0 bg-slate-900">
      {resolvedPoster ? (
        <img
          key={`poster-${resolvedPoster}`}
          src={resolvedPoster}
          alt=""
          aria-hidden
          loading={isActive ? "eager" : "lazy"}
          decoding="async"
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${
            showPosterLayer ? "opacity-100" : "opacity-0"
          }`}
          onLoad={() => setPosterReady(true)}
          onError={() => {
            if (isActive && mediaType === "video") {
              scheduleRetry();
            }
          }}
        />
      ) : null}

      {canShowImage && isActive ? (
        <img
          key={playbackUrl}
          src={playbackUrl}
          alt={alt}
          loading="eager"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover opacity-100"
          onLoad={handleMediaReady}
          onError={handleMediaError}
        />
      ) : null}

      {canPlayVideo && isActive ? (
        <video
          ref={videoRef}
          key={playbackUrl}
          src={playbackUrl}
          poster={resolvedPoster ?? undefined}
          playsInline
          loop
          preload="auto"
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${
            mediaReady ? "opacity-100" : "opacity-0"
          }`}
          aria-label={alt || "Video"}
          onLoadedData={handleMediaReady}
          onCanPlay={handleMediaReady}
          onError={handleMediaError}
        />
      ) : null}

      {!resolvedPoster && !canPlayVideo && !canShowImage ? (
        <div
          className="absolute inset-0 animate-pulse bg-gradient-to-b from-slate-800 via-slate-900 to-slate-950"
          aria-hidden
        />
      ) : null}

      {showSpinner ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-slate-900/40">
          <Loader2 className="h-10 w-10 animate-spin text-white/85" aria-hidden />
        </div>
      ) : null}

      {mediaUnavailable && !hasVisibleMedia && !showPosterLayer ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-900 px-6 text-center">
          <p className="text-sm font-medium text-white">{alt || "Spot"}</p>
          <p className="text-xs text-red-300">{SPOT_LOAD_ERROR}</p>
        </div>
      ) : null}

      {/* ── Speaker / mute button — only shown for active videos ── */}
      {mediaType === "video" && isActive && mediaReady ? (
        <button
          type="button"
          onClick={toggleMute}
          className="absolute right-3 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm ring-1 ring-white/20"
          style={{ top: "max(3.25rem, env(safe-area-inset-top))" }}
          aria-label={isMuted ? "Unmute video" : "Mute video"}
        >
          {isMuted ? (
            <VolumeX className="h-5 w-5" aria-hidden />
          ) : (
            <Volume2 className="h-5 w-5" aria-hidden />
          )}
        </button>
      ) : null}
    </div>
  );
}
