export type SpotFullscreenPlayResult = {
  started: boolean;
};

export function applySpotFullscreenVideoAttributes(video: HTMLVideoElement) {
  video.controls = false;
  video.playsInline = true;
  video.setAttribute("playsinline", "true");
  video.setAttribute("webkit-playsinline", "true");
  video.disablePictureInPicture = true;
  video.setAttribute("disablepictureinpicture", "");
  video.setAttribute("disableremoteplayback", "");
  video.setAttribute("controlsList", "nodownload nofullscreen noremoteplayback");
  video.setAttribute("x-webkit-airplay", "deny");
  video.setAttribute("data-spot-fullscreen-video", "true");
}

/** Muted autoplay first, then unmute when the published video has audio. */
export async function playSpotFullscreenVideo(
  video: HTMLVideoElement,
  options?: { forceMuted?: boolean; isStillActive?: () => boolean }
): Promise<SpotFullscreenPlayResult> {
  const wantSound = !options?.forceMuted;
  const stillActive = () => options?.isStillActive?.() ?? true;

  // Avoid stacking concurrent play()/mute flips — a common flash source on iOS.
  if (video.dataset.spotPlayInFlight === "1") {
    return { started: !video.paused };
  }

  video.dataset.spotPlayInFlight = "1";

  try {
    video.muted = true;

    try {
      await video.play();
    } catch {
      return { started: false };
    }

    // The caller (e.g. navigating away to another screen) may have deactivated
    // this video while play() was pending — never proceed to unmute/resume it.
    if (!video.isConnected || !stillActive()) {
      video.pause();
      return { started: false };
    }

    if (wantSound) {
      // Wait one frame so the first painted frame is stable before unmute.
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });

      if (!video.isConnected || !stillActive()) {
        video.pause();
        return { started: false };
      }

      video.muted = false;

      if (video.paused) {
        try {
          await video.play();
        } catch {
          video.muted = true;
        }
      }
    }

    return { started: true };
  } finally {
    delete video.dataset.spotPlayInFlight;
  }
}
