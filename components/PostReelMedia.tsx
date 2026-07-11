"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { pauseAllGridVideoPreviews } from "@/lib/gridVideoPreviewControl";
import { logSpotLoadUiFailure } from "@/lib/spotLoadDiagnostics";
import { releasePreloadedReelVideo } from "@/lib/postViewerMedia";
import { SPOT_LOAD_ERROR, type SpotLoadPhase } from "@/lib/spotLoadState";
import {
  applySpotFullscreenVideoAttributes,
  playSpotFullscreenVideo,
} from "@/lib/spotViewerVideoPlayback";
import {
  installVideoPauseTracer,
  isVideoPlaybackDebugEnabled,
  logVideoPlaybackDebug,
  snapshotVideoElement,
} from "@/lib/videoPlaybackDebug";

const MAX_AUTO_RETRIES = 2;
const RETRY_DELAY_MS = 800;

export type ReelMediaPreload = "active" | "adjacent" | "none";

type VideoPlaybackFlags = {
  firstFrameReady: boolean;
  playing: boolean;
  error: boolean;
};

const INITIAL_VIDEO_FLAGS: VideoPlaybackFlags = {
  firstFrameReady: false,
  playing: false,
  error: false,
};

function applySpotViewerVideoAttributes(video: HTMLVideoElement) {
  applySpotFullscreenVideoAttributes(video);
}

type PostReelMediaProps = {
  mediaUrl: string;
  mediaType: "image" | "video";
  posterUrl?: string | null;
  isActive: boolean;
  shouldLoad?: boolean;
  mediaPreload?: ReelMediaPreload;
  alt?: string;
  /** Published video without audio — always play muted in viewer. */
  audioMuted?: boolean;
  onLoadingChange?: (loading: boolean) => void;
  onPhaseChange?: (phase: SpotLoadPhase) => void;
};

function retryPlaybackUrl(url: string, attempt: number) {
  if (attempt <= 0) {
    return url;
  }

  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}retry=${attempt}&t=${Date.now()}`;
}

function logSpotMedia(event: string, details?: Record<string, unknown>) {
  console.log(`[Spot media] ${event}`, details ?? "");
}

export default function PostReelMedia({
  mediaUrl,
  mediaType,
  posterUrl,
  isActive,
  shouldLoad = true,
  mediaPreload = "none",
  alt = "",
  audioMuted = false,
  onLoadingChange,
  onPhaseChange,
}: PostReelMediaProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioMutedRef = useRef(audioMuted);
  const isActiveRef = useRef(isActive);
  const playRetryUsedRef = useRef(false);
  const resumeAfterPauseRef = useRef(false);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const debugLastEventRef = useRef("—");
  const debugLastPlayResultRef = useRef("—");

  const [retryKey, setRetryKey] = useState(0);
  const [phase, setPhase] = useState<SpotLoadPhase>("loading");
  const [imageReady, setImageReady] = useState(false);
  const [videoFlags, setVideoFlags] = useState<VideoPlaybackFlags>(INITIAL_VIDEO_FLAGS);

  audioMutedRef.current = audioMuted;

  const resolvedPoster = posterUrl?.trim() || (mediaType === "image" ? mediaUrl : null);
  const playbackUrl = retryPlaybackUrl(mediaUrl, retryKey);
  const resolvedPreload =
    mediaPreload === "active" ? "active" : mediaPreload === "adjacent" ? "adjacent" : shouldLoad ? "adjacent" : "none";
  const loadHeavyMedia = resolvedPreload !== "none";
  const shouldMountVideo = mediaType === "video" && loadHeavyMedia && !videoFlags.error;
  const canShowImage = mediaType === "image" && loadHeavyMedia;

  const markDebugEvent = useCallback((event: string, details?: Record<string, unknown>) => {
    debugLastEventRef.current = event;
    logVideoPlaybackDebug(event, details);
  }, []);

  const markPlayResult = useCallback((result: string, details?: Record<string, unknown>) => {
    debugLastPlayResultRef.current = result;
    if (result.startsWith("rejected")) {
      logVideoPlaybackDebug("play rejected", { result, ...details });
    } else {
      logVideoPlaybackDebug("play resolved", { result, ...details });
    }
  }, []);

  const refreshDebugSnapshot = useCallback(() => {
    if (!isVideoPlaybackDebugEnabled() || mediaType !== "video") {
      return;
    }

    snapshotVideoElement(videoRef.current, {
      mediaUrl,
      lastEvent: debugLastEventRef.current,
      lastPlayResult: debugLastPlayResultRef.current,
      isActive: isActiveRef.current,
    });
  }, [mediaType, mediaUrl]);

  const patchVideoFlags = useCallback((patch: Partial<VideoPlaybackFlags>) => {
    setVideoFlags((current) => ({ ...current, ...patch }));
  }, []);

  const markFirstFrameReady = useCallback(() => {
    patchVideoFlags({ firstFrameReady: true });
    setPhase("loaded");
  }, [patchVideoFlags]);

  const releaseCompetingDecoders = useCallback(
    (reason: string) => {
      logVideoPlaybackDebug("releaseCompetingDecoders", { reason, mediaUrl });
      pauseAllGridVideoPreviews();
      releasePreloadedReelVideo(mediaUrl);
    },
    [mediaUrl]
  );

  const attemptPlay = useCallback(
    async (video: HTMLVideoElement, reason: string, options?: { allowRetry?: boolean }) => {
      markDebugEvent("play attempt", {
        reason,
        paused: video.paused,
        readyState: video.readyState,
        networkState: video.networkState,
        currentTime: video.currentTime,
        src: video.currentSrc || video.src,
        preferMuted: audioMutedRef.current,
      });

      const result = await playSpotFullscreenVideo(video, {
        forceMuted: audioMutedRef.current,
      });

      if (result.started) {
        const playResult = `resolved (${reason})`;
        markPlayResult(playResult, {
          reason,
          currentTime: video.currentTime,
          paused: video.paused,
          muted: video.muted,
        });
        return true;
      }

      const rejection = "autoplay blocked";
      markPlayResult(`rejected (${reason}): ${rejection}`, {
        reason,
        rejection,
        readyState: video.readyState,
        networkState: video.networkState,
      });

      if (options?.allowRetry) {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            if (!video.isConnected || !video.paused) {
              return;
            }

            markDebugEvent("play attempt", { reason: `${reason}-mount-retry` });
            void playSpotFullscreenVideo(video, { forceMuted: audioMutedRef.current }).then((retryResult) => {
              if (retryResult.started) {
                markPlayResult(`resolved (${reason}-mount-retry)`, { currentTime: video.currentTime });
              } else {
                markPlayResult(`rejected (${reason}-mount-retry): autoplay blocked`);
              }
            });
          });
        });
      }

      refreshDebugSnapshot();
      return false;
    },
    [markDebugEvent, markPlayResult, refreshDebugSnapshot]
  );

  const requestActivePlay = useCallback(
    (video: HTMLVideoElement, reason: string) => {
      if (!isActiveRef.current) {
        markDebugEvent("play attempt skipped", { reason, cause: "isActive=false" });
        return;
      }

      releaseCompetingDecoders(`before-play:${reason}`);
      void attemptPlay(video, reason, { allowRetry: !playRetryUsedRef.current }).then((started) => {
        if (started) {
          playRetryUsedRef.current = true;
          patchVideoFlags({ playing: true });
        }
        refreshDebugSnapshot();
      });
    },
    [attemptPlay, markDebugEvent, patchVideoFlags, refreshDebugSnapshot, releaseCompetingDecoders]
  );

  useEffect(() => {
    isActiveRef.current = isActive;
    refreshDebugSnapshot();
  }, [isActive, refreshDebugSnapshot]);

  useEffect(() => {
    if (!isVideoPlaybackDebugEnabled() || !shouldMountVideo) {
      return;
    }

    logVideoPlaybackDebug("VIDEO DEBUG ACTIVE", {
      native: typeof window !== "undefined",
      mediaUrl,
    });

    const interval = window.setInterval(refreshDebugSnapshot, 250);
    return () => window.clearInterval(interval);
  }, [mediaUrl, refreshDebugSnapshot, shouldMountVideo]);

  useEffect(() => {
    retryCountRef.current = 0;
    playRetryUsedRef.current = false;
    resumeAfterPauseRef.current = false;
    setRetryKey(0);
    setImageReady(false);
    setVideoFlags(INITIAL_VIDEO_FLAGS);
    setPhase("loading");
    debugLastEventRef.current = "—";
    debugLastPlayResultRef.current = "—";
  }, [mediaUrl, mediaType, posterUrl]);

  useEffect(() => {
    if (phase === "loading" && loadHeavyMedia) {
      setPhase("mediaLoading");
    }
  }, [loadHeavyMedia, phase]);

  useEffect(() => {
    if (mediaType === "video") {
      if (videoFlags.error) {
        onPhaseChange?.("error");
      } else if (videoFlags.playing || videoFlags.firstFrameReady) {
        onPhaseChange?.("loaded");
      } else {
        onPhaseChange?.(phase);
      }
      return;
    }

    onPhaseChange?.(phase);
  }, [mediaType, onPhaseChange, phase, videoFlags.error, videoFlags.firstFrameReady, videoFlags.playing]);

  useEffect(() => {
    if (!shouldMountVideo || mediaType !== "video") {
      return;
    }

    markDebugEvent("mount", { mediaUrl, playbackUrl, isActive: isActiveRef.current });
    releaseCompetingDecoders("mount");

    const video = videoRef.current;

    if (!video) {
      markDebugEvent("mount", { error: "videoRef null after render" });
      return;
    }

    markDebugEvent("src set", {
      playbackUrl,
      currentSrc: video.currentSrc || video.src,
    });

    const restorePause = installVideoPauseTracer(video, (details) => {
      markDebugEvent("pause", { source: "video.pause() intercepted", ...details });
      refreshDebugSnapshot();
    });

    applySpotViewerVideoAttributes(video);
    video.muted = audioMutedRef.current;
    video.preload = "auto";

    if (isActiveRef.current) {
      void attemptPlay(video, "mount", { allowRetry: true });
    }

    const handleLoadedMetadata = () => {
      markDebugEvent("loadedmetadata", {
        readyState: video.readyState,
        duration: video.duration,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
      });
      refreshDebugSnapshot();
    };

    const handleLoadedData = () => {
      markDebugEvent("loadeddata", {
        readyState: video.readyState,
        currentTime: video.currentTime,
      });
      markFirstFrameReady();

      if (isActiveRef.current) {
        requestActivePlay(video, "loadeddata");
      }

      refreshDebugSnapshot();
    };

    const handleCanPlay = () => {
      markDebugEvent("canplay", {
        readyState: video.readyState,
        currentTime: video.currentTime,
      });
      markFirstFrameReady();

      if (isActiveRef.current) {
        requestActivePlay(video, "canplay");
      }

      refreshDebugSnapshot();
    };

    const handlePlaying = () => {
      markDebugEvent("playing", { currentTime: video.currentTime });
      patchVideoFlags({ playing: true, firstFrameReady: true, error: false });
      setPhase("loaded");
      retryCountRef.current = 0;
      refreshDebugSnapshot();
    };

    const handlePause = () => {
      markDebugEvent("pause", {
        source: "pause event",
        isActive: isActiveRef.current,
        currentTime: video.currentTime,
        readyState: video.readyState,
        stack: isVideoPlaybackDebugEnabled() ? new Error("pause event trace").stack : undefined,
      });

      if (!isActiveRef.current) {
        patchVideoFlags({ playing: false });
        refreshDebugSnapshot();
        return;
      }

      if (resumeAfterPauseRef.current) {
        refreshDebugSnapshot();
        return;
      }

      resumeAfterPauseRef.current = true;
      void attemptPlay(video, "unexpected-pause-resume").then((started) => {
        if (started) {
          patchVideoFlags({ playing: true });
        }
        refreshDebugSnapshot();
      });
    };

    const handleStalled = () => {
      markDebugEvent("stalled", {
        readyState: video.readyState,
        networkState: video.networkState,
        currentTime: video.currentTime,
      });
      refreshDebugSnapshot();
    };

    const handleWaiting = () => {
      markDebugEvent("waiting", {
        readyState: video.readyState,
        networkState: video.networkState,
        currentTime: video.currentTime,
      });
      refreshDebugSnapshot();
    };

    const handleError = () => {
      const mediaError = video.error;
      markDebugEvent("error", {
        code: mediaError?.code ?? null,
        message: mediaError?.message ?? null,
        readyState: video.readyState,
        networkState: video.networkState,
      });
      markPlayResult(
        `media error code=${mediaError?.code ?? "?"} msg=${mediaError?.message ?? "unknown"}`,
        { code: mediaError?.code, message: mediaError?.message }
      );

      patchVideoFlags({ playing: false, firstFrameReady: false, error: true });

      if (retryCountRef.current >= MAX_AUTO_RETRIES) {
        logSpotLoadUiFailure("PostReelMedia", "media load failed after retries", {
          mediaUrl,
          retryCount: retryCountRef.current,
          genericMessage: SPOT_LOAD_ERROR,
        });
        setPhase("error");
        refreshDebugSnapshot();
        return;
      }

      retryCountRef.current += 1;
      playRetryUsedRef.current = false;
      resumeAfterPauseRef.current = false;

      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }

      retryTimeoutRef.current = setTimeout(() => {
        setRetryKey((current) => current + 1);
      }, RETRY_DELAY_MS);

      refreshDebugSnapshot();
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("loadeddata", handleLoadedData);
    video.addEventListener("canplay", handleCanPlay);
    video.addEventListener("playing", handlePlaying);
    video.addEventListener("pause", handlePause);
    video.addEventListener("stalled", handleStalled);
    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("error", handleError);

    refreshDebugSnapshot();

    return () => {
      restorePause();
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("loadeddata", handleLoadedData);
      video.removeEventListener("canplay", handleCanPlay);
      video.removeEventListener("playing", handlePlaying);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("stalled", handleStalled);
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("error", handleError);
    };
  }, [
    attemptPlay,
    markDebugEvent,
    markFirstFrameReady,
    markPlayResult,
    mediaType,
    mediaUrl,
    patchVideoFlags,
    playbackUrl,
    refreshDebugSnapshot,
    releaseCompetingDecoders,
    requestActivePlay,
    shouldMountVideo,
  ]);

  useEffect(() => {
    const video = videoRef.current;

    if (!video || !shouldMountVideo) {
      return;
    }

    if (!isActive) {
      markDebugEvent("pause", {
        source: "PostReelMedia isActive=false effect",
        currentTime: video.currentTime,
        stack: isVideoPlaybackDebugEnabled() ? new Error("isActive effect pause").stack : undefined,
      });
      video.pause();
      patchVideoFlags({ playing: false });
      refreshDebugSnapshot();
      return;
    }

    releaseCompetingDecoders("activated");
    playRetryUsedRef.current = false;
    resumeAfterPauseRef.current = false;
    video.muted = audioMuted;
    video.preload = "auto";

    requestActivePlay(video, "activated");

    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      markFirstFrameReady();
    }

    refreshDebugSnapshot();
  }, [
    isActive,
    markDebugEvent,
    markFirstFrameReady,
    patchVideoFlags,
    refreshDebugSnapshot,
    releaseCompetingDecoders,
    requestActivePlay,
    shouldMountVideo,
    audioMuted,
  ]);

  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  const showPosterWhileVideo =
    Boolean(resolvedPoster) &&
    mediaType === "video" &&
    loadHeavyMedia &&
    isActive &&
    !videoFlags.firstFrameReady &&
    !videoFlags.error;

  const showBlurredPlaceholder =
    mediaType === "video" && loadHeavyMedia && !resolvedPoster && !videoFlags.firstFrameReady && !videoFlags.error;

  const showImageLayer = canShowImage && isActive;
  const isLoading = isActive && mediaType === "video" && !videoFlags.firstFrameReady && !videoFlags.error;

  useEffect(() => {
    onLoadingChange?.(isLoading);
  }, [isLoading, onLoadingChange]);

  return (
    <div className="absolute inset-0 z-0 h-full w-full bg-slate-950">
      {showBlurredPlaceholder ? (
        <div
          className="absolute inset-0 z-0 bg-gradient-to-b from-slate-800 via-slate-900 to-slate-950"
          aria-hidden
        />
      ) : null}

      {resolvedPoster ? (
        <img
          key={`poster-${resolvedPoster}`}
          src={resolvedPoster}
          alt=""
          aria-hidden
          loading={loadHeavyMedia ? "eager" : "lazy"}
          decoding="async"
          className={`absolute inset-0 z-[1] h-full w-full object-cover object-center transition-opacity duration-150 ${
            showPosterWhileVideo ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        />
      ) : null}

      {showImageLayer ? (
        <img
          key={playbackUrl}
          src={playbackUrl}
          alt={alt}
          loading="eager"
          decoding="async"
          className={`absolute inset-0 z-[2] h-full w-full object-cover object-center transition-opacity duration-150 ${
            imageReady ? "opacity-100" : "opacity-0"
          }`}
          onLoad={() => {
            setImageReady(true);
            setPhase("loaded");
            logSpotMedia("loaded", { mediaUrl: playbackUrl, mediaType: "image" });
          }}
          onError={() => setPhase("error")}
        />
      ) : null}

      {shouldMountVideo ? (
        <video
          ref={videoRef}
          key={playbackUrl}
          src={playbackUrl}
          playsInline
          autoPlay={isActive}
          muted={audioMuted}
          loop
          preload="auto"
          controls={false}
          disablePictureInPicture
          disableRemotePlayback
          controlsList="nodownload nofullscreen noremoteplayback"
          className="absolute inset-0 z-[2] h-full w-full object-cover object-center"
          aria-label={alt || "Video"}
        />
      ) : null}

      {phase === "error" ? (
        <div className="absolute inset-0 z-[3] flex flex-col items-center justify-center gap-2 bg-slate-950/90 px-6 text-center">
          <p className="text-sm font-medium text-white">{alt || "Spot"}</p>
          <p className="text-xs text-red-300">{SPOT_LOAD_ERROR}</p>
        </div>
      ) : null}
    </div>
  );
}
