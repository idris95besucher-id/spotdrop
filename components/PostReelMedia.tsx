"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { Play, Volume2, VolumeX } from "lucide-react";
import SpotPanoramaImage from "@/components/SpotPanoramaImage";
import ZoomableImage from "@/components/ZoomableImage";
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
  /** Published video without a sound track — stays muted, mute control hidden. */
  audioMuted?: boolean;
  onLoadingChange?: (loading: boolean) => void;
  onPhaseChange?: (phase: SpotLoadPhase) => void;
  /** Search Spot only — spring-back pinch zoom via shared ZoomableImage. */
  enableImagePinchZoom?: boolean;
};

export default function PostReelMedia(props: PostReelMediaProps) {
  // `PostReelMediaImage` already fully implements video playback (mount,
  // autoplay-with-retry, `audioMuted` handling, poster fallback, error
  // retry) despite its name — it used to be gated off entirely behind a
  // "video not supported" placeholder from back when the old browser
  // `MediaRecorder` pipeline produced unreliable files. Native
  // AVCaptureMovieFileOutput recordings are real, valid video files, so that
  // gate no longer applies.
  return <PostReelMediaImage {...props} />;
}

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

function PostReelMediaImage({
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
  enableImagePinchZoom = false,
}: PostReelMediaProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const isActiveRef = useRef(isActive);
  const playRetryUsedRef = useRef(false);
  const resumeAfterPauseRef = useRef(false);
  const userPausedRef = useRef(false);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const debugLastEventRef = useRef("—");
  const debugLastPlayResultRef = useRef("—");

  const [retryKey, setRetryKey] = useState(0);
  const [phase, setPhase] = useState<SpotLoadPhase>("loading");
  const [imageReady, setImageReady] = useState(false);
  const [videoFlags, setVideoFlags] = useState<VideoPlaybackFlags>(INITIAL_VIDEO_FLAGS);
  // User-controlled play/pause (Instagram-style tap) and sound. `userMuted`
  // seeds from `audioMuted` so a video published without sound stays muted.
  const [userPaused, setUserPaused] = useState(false);
  const [userMuted, setUserMuted] = useState(audioMuted);

  const effectiveMuted = audioMuted || userMuted;
  const effectiveMutedRef = useRef(effectiveMuted);
  effectiveMutedRef.current = effectiveMuted;

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
        preferMuted: effectiveMutedRef.current,
      });

      const result = await playSpotFullscreenVideo(video, {
        forceMuted: effectiveMutedRef.current,
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
            void playSpotFullscreenVideo(video, { forceMuted: effectiveMutedRef.current }).then((retryResult) => {
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

      // Respect a deliberate user pause — never auto-resume behind their back.
      if (userPausedRef.current) {
        markDebugEvent("play attempt skipped", { reason, cause: "userPaused" });
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
    userPausedRef.current = false;
    setUserPaused(false);
    setUserMuted(audioMuted);
    setRetryKey(0);
    setImageReady(false);
    setVideoFlags(INITIAL_VIDEO_FLAGS);
    setPhase("loading");
    debugLastEventRef.current = "—";
    debugLastPlayResultRef.current = "—";
  }, [mediaUrl, mediaType, posterUrl, audioMuted]);

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
    video.muted = effectiveMutedRef.current;
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
      // Do not play here — canplay handles start. Dual play()+unmute caused flashes on remote URLs.
      refreshDebugSnapshot();
    };

    const handleCanPlay = () => {
      markDebugEvent("canplay", {
        readyState: video.readyState,
        currentTime: video.currentTime,
      });
      markFirstFrameReady();

      if (isActiveRef.current && (video.paused || video.ended)) {
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
        networkState: video.networkState,
        stack: isVideoPlaybackDebugEnabled() ? new Error("pause event trace").stack : undefined,
      });

      if (!isActiveRef.current) {
        patchVideoFlags({ playing: false });
        refreshDebugSnapshot();
        return;
      }

      // User tapped to pause — hold it, do not auto-resume.
      if (userPausedRef.current) {
        patchVideoFlags({ playing: false });
        refreshDebugSnapshot();
        return;
      }

      // Remote progressive playback often fires pause while buffering.
      // Auto-calling play() here (especially mute→unmute) causes visible flicker/flash
      // that never happens with local blob: preview URLs.
      const buffering =
        video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA ||
        video.networkState === HTMLMediaElement.NETWORK_LOADING;

      if (buffering || resumeAfterPauseRef.current) {
        patchVideoFlags({ playing: !video.paused });
        refreshDebugSnapshot();
        return;
      }

      resumeAfterPauseRef.current = true;
      void attemptPlay(video, "unexpected-pause-resume").then((started) => {
        if (started) {
          patchVideoFlags({ playing: true });
        }
        // Allow a later genuine resume if this one was blocked.
        window.setTimeout(() => {
          resumeAfterPauseRef.current = false;
        }, 1200);
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
      // Keep firstFrameReady true so the poster does not flash back over the video.
      patchVideoFlags({ playing: false });
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

      patchVideoFlags({ playing: false, error: true });

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
    userPausedRef.current = false;
    setUserPaused(false);
    video.muted = effectiveMutedRef.current;
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
  ]);

  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  // Instagram-style single tap: toggle play/pause in place. Never opens another
  // screen, never zooms, never closes the post. Video only; images untouched.
  const handleVideoTap = useCallback(() => {
    const video = videoRef.current;

    if (mediaType !== "video" || !video) {
      return;
    }

    if (video.paused) {
      userPausedRef.current = false;
      setUserPaused(false);
      requestActivePlay(video, "user-tap-play");
    } else {
      userPausedRef.current = true;
      setUserPaused(true);
      video.pause();
    }
  }, [mediaType, requestActivePlay]);

  // Speaker toggle — independent of the play/pause tap. Stops propagation so
  // tapping it never doubles as a play/pause tap.
  const handleToggleMute = useCallback((event: ReactMouseEvent) => {
    event.stopPropagation();
    const next = !effectiveMutedRef.current;
    setUserMuted(next);
    const video = videoRef.current;
    if (video) {
      video.muted = next;
    }
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

  const isVideo = mediaType === "video";
  // Instagram-style: the speaker only appears while the video is paused, tucked
  // directly below the top-right three-dot menu. Hidden for videos with no
  // sound track, and hidden again as soon as playback resumes.
  const showMuteControl = isVideo && !audioMuted && userPaused && !videoFlags.error;
  const showPlayOverlay = isVideo && userPaused && !videoFlags.error;

  return (
    <div
      className="absolute inset-0 z-0 h-full w-full bg-black"
      onClick={isVideo ? handleVideoTap : undefined}
      role={isVideo ? "button" : undefined}
      tabIndex={isVideo ? -1 : undefined}
      aria-label={isVideo ? alt || "Video" : undefined}
    >
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
          className={`absolute inset-0 z-[1] h-full w-full object-cover object-center ${
            showPosterWhileVideo ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        />
      ) : null}

      {showImageLayer ? (
        <div
          className={`absolute inset-0 z-[2] transition-opacity duration-150 ${
            imageReady ? "opacity-100" : "opacity-0"
          }`}
        >
          {enableImagePinchZoom ? (
            <ZoomableImage
              src={playbackUrl}
              alt={alt}
              className="h-full w-full"
              imageClassName="h-full w-full"
              objectFit="contain"
              draggable={false}
              loading={loadHeavyMedia ? "eager" : "lazy"}
              decoding="async"
              onLoad={() => {
                setImageReady(true);
                setPhase("loaded");
                logSpotMedia("loaded", { mediaUrl: playbackUrl, mediaType: "image" });
              }}
              onError={() => setPhase("error")}
            />
          ) : (
            <SpotPanoramaImage
              src={playbackUrl}
              alt={alt}
              className="h-full w-full"
              onLoad={() => {
                setImageReady(true);
                setPhase("loaded");
                logSpotMedia("loaded", { mediaUrl: playbackUrl, mediaType: "image" });
              }}
              onError={() => setPhase("error")}
            />
          )}
        </div>
      ) : null}

      {shouldMountVideo ? (
        <video
          ref={videoRef}
          src={playbackUrl}
          playsInline
          autoPlay={isActive}
          muted={effectiveMuted}
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

      {showPlayOverlay ? (
        <div className="pointer-events-none absolute inset-0 z-[3] flex items-center justify-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/45 backdrop-blur-sm">
            <Play className="h-8 w-8 translate-x-0.5 fill-white text-white" strokeWidth={0} aria-hidden />
          </span>
        </div>
      ) : null}

      {showMuteControl ? (
        <button
          type="button"
          onClick={handleToggleMute}
          // Centered under the top-right three-dot menu with a clear gap. This
          // media layer is pulled up by `margin-top: -env(safe-area-inset-top)`
          // (see `[data-spot-viewer-media]` in globals.css), so we add that
          // inset back before matching the menu's own top offset + height.
          className="absolute right-4 z-[4] flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white ring-1 ring-white/15 backdrop-blur-md transition active:scale-95"
          style={{
            top: "calc(env(safe-area-inset-top, 0px) + max(0.75rem, env(safe-area-inset-top, 0px)) + 3.5rem)",
          }}
          aria-label={effectiveMuted ? "Unmute" : "Mute"}
          aria-pressed={effectiveMuted}
        >
          {effectiveMuted ? (
            <VolumeX className="h-4 w-4" aria-hidden />
          ) : (
            <Volume2 className="h-4 w-4" aria-hidden />
          )}
        </button>
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
