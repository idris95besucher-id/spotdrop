/** Grid-only video previews — paused while full-screen Spot viewer is open. */

import { logVideoPlaybackDebug } from "@/lib/videoPlaybackDebug";

const MAX_CONCURRENT_GRID_PREVIEWS = 2;

const gridPreviewVideos = new Set<HTMLVideoElement>();
const activeGridPreviewVideos: HTMLVideoElement[] = [];
let fullscreenViewerOpenCount = 0;

function removeActiveGridPreview(video: HTMLVideoElement) {
  const index = activeGridPreviewVideos.indexOf(video);

  if (index >= 0) {
    activeGridPreviewVideos.splice(index, 1);
  }
}

export function registerGridVideoPreview(video: HTMLVideoElement) {
  gridPreviewVideos.add(video);

  if (fullscreenViewerOpenCount > 0) {
    video.pause();
  }

  return () => {
    gridPreviewVideos.delete(video);
    removeActiveGridPreview(video);
  };
}

export function tryPlayGridVideoPreview(video: HTMLVideoElement) {
  if (fullscreenViewerOpenCount > 0) {
    return false;
  }

  if (!gridPreviewVideos.has(video)) {
    return false;
  }

  if (!activeGridPreviewVideos.includes(video)) {
    while (activeGridPreviewVideos.length >= MAX_CONCURRENT_GRID_PREVIEWS) {
      const oldest = activeGridPreviewVideos.shift();

      if (!oldest) {
        break;
      }

      oldest.pause();

      try {
        oldest.currentTime = 0;
      } catch {
        /* ignore */
      }
    }

    activeGridPreviewVideos.push(video);
  }

  return true;
}

export function releaseGridVideoPreview(video: HTMLVideoElement) {
  video.pause();
  removeActiveGridPreview(video);
}

export function pauseAllGridVideoPreviews() {
  logVideoPlaybackDebug("grid pauseAllGridVideoPreviews", { count: gridPreviewVideos.size });

  activeGridPreviewVideos.length = 0;

  for (const video of gridPreviewVideos) {
    video.pause();

    try {
      video.currentTime = 0;
    } catch {
      /* ignore */
    }
  }
}

export function notifySpotFullscreenViewerOpened() {
  fullscreenViewerOpenCount += 1;
  logVideoPlaybackDebug("fullscreen viewer opened — pausing grid previews", {
    openCount: fullscreenViewerOpenCount,
    gridVideoCount: gridPreviewVideos.size,
  });
  pauseAllGridVideoPreviews();
}

export function notifySpotFullscreenViewerClosed() {
  fullscreenViewerOpenCount = Math.max(0, fullscreenViewerOpenCount - 1);
}
