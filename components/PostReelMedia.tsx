"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { logSpotLoadUiFailure } from "@/lib/spotLoadDiagnostics";
import {
  getSpotMediaLoadTimeoutMs,
  SPOT_LOAD_ERROR,
  type SpotLoadPhase,
} from "@/lib/spotLoadState";

const MAX_AUTO_RETRIES = 3;
const RETRY_DELAY_MS = 1200;

/**
 * Module-level mute preference that persists while the user scrolls through the
 * reel. Starts muted (required for iOS/Android autoplay). Tapping the video
 * toggles sound — no visible speaker control (Instagram Reels style).
 */
let viewerGlobalMuted = true;

function applySpotViewerVideoAttributes(video: HTMLVideoElement) {
  video.controls = false;
  video.playsInline = true;
  video.setAttribute("playsinline", "true");
  video.setAttribute("webkit-playsinline", "true");
  video.disablePictureInPicture = true;
  video.setAttribute("disablepictureinpicture", "");
  video.setAttribute("disableremoteplayback", "");
  video.setAttribute("controlsList", "nodownload nofullscreen noremoteplayback");
  video.setAttribute("x-webkit-airplay", "deny");
}

type PostReelMediaProps = {
  mediaUrl: string;
  mediaType: "image" | "video";
  posterUrl?: string | null;
  isActive: boolean;
  /** Preload full image/video (poster still shows when false). */
  shouldLoad?: boolean;
  alt?: string;
  onLoadingChange?: (loading: boolean) => void;
  onPhaseChange?: (phase: SpotLoadPhase) => void;
};

function cacheBustUrl(url: string, attempt: number) {
  if (attempt <= 0) {
    return url;
  }

  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}retry=${attempt}&t=${Date.now()}`;
}

function logSpotMedia(event: string, details?: Record<string, unknown>) {
  console.log(`[Spot media] ${event}`, details ?? "");
}

function logVideoStart(event: string, details?: Record<string, unknown>) {
  console.log(`[Video start] ${event}`, details ?? "");
}

async function attemptVideoPlay(video: HTMLVideoElement) {
  video.muted = true;
  logVideoStart("play called", {
    paused: video.paused,
    readyState: video.readyState,
    currentTime: video.currentTime,
  });

  try {
    await video.play();
    video.muted = viewerGlobalMuted;
  } catch (error) {
    console.warn("[Video start] play blocked", error);
  }
}

export default function PostReelMedia({
  mediaUrl,
  mediaType,
  posterUrl,
  isActive,
  shouldLoad = true,
  alt = "",
  onLoadingChange,
  onPhaseChange,
}: PostReelMediaProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const playRequestedRef = useRef(false);

  const [retryKey, setRetryKey] = useState(0);
  const [phase, setPhase] = useState<SpotLoadPhase>("loading");
  const [mediaReady, setMediaReady] = useState(false);
  const [posterReady, setPosterReady] = useState(false);

  const resolvedPoster = posterUrl?.trim() || (mediaType === "image" ? mediaUrl : null);
  const playbackUrl = cacheBustUrl(mediaUrl, retryKey);
  const loadHeavyMedia = shouldLoad || isActive;
  const shouldMountVideo = mediaType === "video" && loadHeavyMedia && phase !== "error";
  const canShowImage = mediaType === "image" && loadHeavyMedia;

  const markLoaded = useCallback(() => {
    setMediaReady(true);
    setPhase("loaded");
    retryCountRef.current = 0;
    logSpotMedia("loaded", { mediaUrl: playbackUrl, mediaType });
  }, [mediaType, playbackUrl]);

  const markPosterFallbackLoaded = useCallback(() => {
    setPhase("loaded");
    retryCountRef.current = 0;
  }, []);

  const markFinalError = useCallback(
    (reason: string, details: Record<string, unknown>) => {
      logSpotLoadUiFailure("PostReelMedia", reason, {
        mediaUrl,
        mediaType,
        posterUrl: posterUrl ?? null,
        retryCount: retryCountRef.current,
        genericMessage: SPOT_LOAD_ERROR,
        ...details,
      });
      setPhase("error");
    },
    [mediaType, mediaUrl, posterUrl]
  );

  const scheduleRetry = useCallback(() => {
    if (retryCountRef.current >= MAX_AUTO_RETRIES) {
      if (resolvedPoster && posterReady) {
        markPosterFallbackLoaded();
        return;
      }

      markFinalError("media load failed after retries — storage/CDN issue", {
        posterReady,
        hasPoster: Boolean(resolvedPoster),
      });
      return;
    }

    retryCountRef.current += 1;
    setPhase("mediaLoading");
    playRequestedRef.current = false;

    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
    }

    retryTimeoutRef.current = setTimeout(() => {
      setMediaReady(false);
      setRetryKey((current) => current + 1);
    }, RETRY_DELAY_MS);
  }, [markFinalError, markPosterFallbackLoaded, posterReady, resolvedPoster]);

  const requestVideoLoad = useCallback(
    (video: HTMLVideoElement) => {
      applySpotViewerVideoAttributes(video);
      video.muted = true;
      logVideoStart("load called", { mediaUrl: playbackUrl, isActive });
      video.load();
    },
    [isActive, playbackUrl]
  );

  const requestVideoPlay = useCallback((video: HTMLVideoElement) => {
    if (playRequestedRef.current && !video.paused) {
      return;
    }

    playRequestedRef.current = true;
    void attemptVideoPlay(video);
  }, []);

  useEffect(() => {
    logSpotMedia("mediaUrl", {
      mediaUrl: playbackUrl,
      mediaType,
      isActive,
      shouldLoad,
    });
  }, [mediaType, playbackUrl, isActive, shouldLoad]);

  useEffect(() => {
    if (shouldMountVideo) {
      logSpotMedia("render video", { playbackUrl, isActive });
    }

    if (canShowImage && isActive) {
      logSpotMedia("render image", { playbackUrl });
    }
  }, [canShowImage, isActive, playbackUrl, shouldMountVideo]);

  useEffect(() => {
    retryCountRef.current = 0;
    playRequestedRef.current = false;
    setRetryKey(0);
    setMediaReady(false);
    setPosterReady(false);
    setPhase("loading");
  }, [mediaUrl, mediaType, posterUrl]);

  useEffect(() => {
    if (phase === "loading" && loadHeavyMedia) {
      setPhase("mediaLoading");
    }
  }, [loadHeavyMedia, phase]);

  useEffect(() => {
    if (!isActive || phase === "loaded" || phase === "error") {
      return;
    }

    if (mediaReady) {
      return;
    }

    if (mediaType === "video" && resolvedPoster) {
      return;
    }

    const timeoutMs = getSpotMediaLoadTimeoutMs();
    const timeout = window.setTimeout(() => {
      if (mediaReady || posterReady) {
        return;
      }

      scheduleRetry();
    }, timeoutMs);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [
    isActive,
    mediaReady,
    mediaType,
    mediaUrl,
    phase,
    posterReady,
    resolvedPoster,
    retryKey,
    scheduleRetry,
  ]);

  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    onPhaseChange?.(phase);
  }, [onPhaseChange, phase]);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const video = videoRef.current;

    if (video) {
      video.muted = viewerGlobalMuted;
    }
  }, [isActive]);

  useEffect(() => {
    const video = videoRef.current;

    if (!video || !shouldMountVideo) {
      return;
    }

    requestVideoLoad(video);

    const handleLoadedMetadata = () => {
      logVideoStart("loadedmetadata", { readyState: video.readyState });
    };

    const handleCanPlay = () => {
      logVideoStart("canplay", { readyState: video.readyState });

      if (isActive) {
        requestVideoPlay(video);
      }
    };

    const handleLoadedData = () => {
      logSpotMedia("loaded", { mediaType: "video", playbackUrl, readyState: video.readyState });
      markLoaded();

      if (isActive) {
        requestVideoPlay(video);
      }
    };

    const handlePlaying = () => {
      logVideoStart("playing", { currentTime: video.currentTime });
      markLoaded();
    };

    const handleError = () => {
      playRequestedRef.current = false;
      setMediaReady(false);
      scheduleRetry();
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("canplay", handleCanPlay);
    video.addEventListener("loadeddata", handleLoadedData);
    video.addEventListener("playing", handlePlaying);
    video.addEventListener("error", handleError);

    if (isActive) {
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        requestVideoPlay(video);
      }
    } else {
      video.pause();

      try {
        video.currentTime = 0;
      } catch {
        /* ignore */
      }
    }

    return () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("canplay", handleCanPlay);
      video.removeEventListener("loadeddata", handleLoadedData);
      video.removeEventListener("playing", handlePlaying);
      video.removeEventListener("error", handleError);
    };
  }, [
    isActive,
    markLoaded,
    requestVideoLoad,
    requestVideoPlay,
    scheduleRetry,
    shouldMountVideo,
    playbackUrl,
  ]);

  useEffect(() => {
    if (!isActive || !shouldMountVideo) {
      return;
    }

    playRequestedRef.current = false;
    const video = videoRef.current;

    if (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      requestVideoPlay(video);
    }
  }, [isActive, playbackUrl, requestVideoPlay, shouldMountVideo]);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    const next = !viewerGlobalMuted;
    viewerGlobalMuted = next;

    if (video) {
      video.muted = next;

      if (!next && video.paused && isActive) {
        void video.play().catch(() => undefined);
      }
    }
  }, [isActive]);

  const handleMediaReady = () => {
    markLoaded();
  };

  const handleMediaError = () => {
    setMediaReady(false);
    scheduleRetry();
  };

  const handlePosterError = () => {
    if (!isActive || mediaType !== "video") {
      return;
    }

    if (mediaReady) {
      return;
    }

    scheduleRetry();
  };

  const showImageLayer = canShowImage && isActive;
  const hasPrimaryMedia =
    (mediaType === "image" && showImageLayer && mediaReady) ||
    (mediaType === "video" && isActive && mediaReady);
  const showPosterLayer =
    Boolean(resolvedPoster) &&
    isActive &&
    mediaType === "video" &&
    posterReady &&
    !mediaReady &&
    phase !== "error";
  const hasPosterFallback = showPosterLayer;
  const hasVisibleMedia = hasPrimaryMedia || hasPosterFallback;
  const showFinalError = phase === "error" && !hasVisibleMedia;

  const showSpinner =
    isActive &&
    (phase === "loading" || phase === "mediaLoading") &&
    !posterReady &&
    !mediaReady;

  const isLoading = isActive && phase !== "loaded" && phase !== "error";

  useEffect(() => {
    onLoadingChange?.(isLoading);
  }, [isLoading, onLoadingChange]);

  return (
    <div className="absolute inset-0 z-0 h-full w-full bg-black">
      {resolvedPoster ? (
        <img
          key={`poster-${resolvedPoster}`}
          src={resolvedPoster}
          alt=""
          aria-hidden
          loading={loadHeavyMedia ? "eager" : "lazy"}
          decoding="async"
          className={`absolute inset-0 z-0 h-full w-full object-cover object-center transition-opacity duration-200 ${
            showPosterLayer ? "opacity-100" : "opacity-0"
          }`}
          onLoad={() => {
            setPosterReady(true);
            logSpotMedia("loaded", { mediaType: "poster", src: resolvedPoster });
          }}
          onError={handlePosterError}
        />
      ) : null}

      {canShowImage && isActive ? (
        <img
          key={playbackUrl}
          src={playbackUrl}
          alt={alt}
          loading="eager"
          decoding="async"
          className={`absolute inset-0 z-[1] h-full w-full object-cover object-center transition-opacity duration-200 ${
            mediaReady ? "opacity-100" : "opacity-0"
          }`}
          onLoad={handleMediaReady}
          onError={handleMediaError}
        />
      ) : null}

      {shouldMountVideo ? (
        <video
          ref={videoRef}
          key={playbackUrl}
          src={playbackUrl}
          poster={resolvedPoster ?? undefined}
          playsInline
          autoPlay={isActive}
          muted
          loop
          preload="auto"
          controls={false}
          disablePictureInPicture
          disableRemotePlayback
          controlsList="nodownload nofullscreen noremoteplayback"
          onClick={(event) => {
            event.stopPropagation();
            if (isActive && mediaReady) {
              toggleMute();
            }
          }}
          className={`absolute inset-0 z-[1] h-full w-full object-cover object-center transition-opacity duration-200 ${
            mediaReady && isActive ? "opacity-100" : "opacity-0"
          }`}
          aria-label={alt || "Video"}
        />
      ) : null}

      {!resolvedPoster && !shouldMountVideo && !canShowImage ? (
        <div
          className="absolute inset-0 animate-pulse bg-gradient-to-b from-slate-800 via-slate-900 to-slate-950"
          aria-hidden
        />
      ) : null}

      {showSpinner ? (
        <div className="pointer-events-none absolute inset-0 z-[2] flex items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-white/85" aria-hidden />
        </div>
      ) : null}

      {showFinalError ? (
        <div className="absolute inset-0 z-[2] flex flex-col items-center justify-center gap-2 bg-black/80 px-6 text-center">
          <p className="text-sm font-medium text-white">{alt || "Spot"}</p>
          <p className="text-xs text-red-300">{SPOT_LOAD_ERROR}</p>
        </div>
      ) : null}
    </div>
  );
}
