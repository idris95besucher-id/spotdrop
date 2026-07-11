/** Console-only fullscreen video diagnostics (web development). No visible overlay. */

export function isVideoPlaybackDebugEnabled(): boolean {
  return typeof process !== "undefined" && process.env.NODE_ENV === "development";
}

export const VIDEO_READY_STATE_LABELS = [
  "HAVE_NOTHING",
  "HAVE_METADATA",
  "HAVE_CURRENT_DATA",
  "HAVE_FUTURE_DATA",
  "HAVE_ENOUGH_DATA",
] as const;

export const VIDEO_NETWORK_STATE_LABELS = [
  "NETWORK_EMPTY",
  "NETWORK_IDLE",
  "NETWORK_LOADING",
  "NETWORK_NO_SOURCE",
] as const;

export type VideoPlaybackDebugSnapshot = {
  mediaUrl: string;
  videoSrc: string;
  readyState: number;
  readyStateLabel: string;
  networkState: number;
  networkStateLabel: string;
  paused: boolean;
  muted: boolean;
  currentTime: number;
  duration: number;
  errorCode: number | null;
  errorMessage: string | null;
  lastEvent: string;
  lastPlayResult: string;
  isActive: boolean;
};

export function logVideoPlaybackDebug(event: string, details?: Record<string, unknown>) {
  if (!isVideoPlaybackDebugEnabled()) {
    return;
  }

  console.log(`[Video playback DEBUG] ${event}`, details ?? "");
}

export function formatPlayRejection(error: unknown) {
  if (error instanceof DOMException) {
    return `${error.name}: ${error.message} (code ${error.code})`;
  }

  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  return String(error);
}

export function snapshotVideoElement(
  video: HTMLVideoElement | null,
  context: {
    mediaUrl: string;
    lastEvent: string;
    lastPlayResult: string;
    isActive: boolean;
  }
): VideoPlaybackDebugSnapshot {
  const error = video?.error ?? null;

  return {
    mediaUrl: context.mediaUrl,
    videoSrc: video?.currentSrc || video?.src || "",
    readyState: video?.readyState ?? -1,
    readyStateLabel: VIDEO_READY_STATE_LABELS[video?.readyState ?? 0] ?? "unknown",
    networkState: video?.networkState ?? -1,
    networkStateLabel: VIDEO_NETWORK_STATE_LABELS[video?.networkState ?? 0] ?? "unknown",
    paused: video?.paused ?? true,
    muted: video?.muted ?? true,
    currentTime: video?.currentTime ?? 0,
    duration: Number.isFinite(video?.duration) ? (video?.duration ?? 0) : 0,
    errorCode: error?.code ?? null,
    errorMessage: error?.message ?? null,
    lastEvent: context.lastEvent,
    lastPlayResult: context.lastPlayResult,
    isActive: context.isActive,
  };
}

export function installVideoPauseTracer(
  video: HTMLVideoElement,
  onPause: (details: Record<string, unknown>) => void
) {
  if (!isVideoPlaybackDebugEnabled()) {
    return () => undefined;
  }

  const originalPause = video.pause.bind(video);

  video.pause = function tracedPause(...args: []) {
    onPause({
      stack: new Error("video.pause() trace").stack,
      readyState: video.readyState,
      networkState: video.networkState,
      currentTime: video.currentTime,
      paused: video.paused,
    });
    return originalPause(...args);
  };

  return () => {
    video.pause = originalPause;
  };
}
