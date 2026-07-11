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
  options?: { forceMuted?: boolean }
): Promise<SpotFullscreenPlayResult> {
  const wantSound = !options?.forceMuted;

  video.muted = true;

  try {
    await video.play();
  } catch {
    return { started: false };
  }

  if (wantSound) {
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
}
