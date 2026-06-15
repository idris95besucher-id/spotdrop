import { pickVideoRecorderMimeType } from "@/lib/cameraCapture";
import { MAX_TRIM_CLIP_SECONDS } from "@/lib/videoTrim";

type VideoWithCaptureStream = HTMLVideoElement & {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
};

function getCaptureStream(video: HTMLVideoElement) {
  const extended = video as VideoWithCaptureStream;
  return extended.captureStream?.() ?? extended.mozCaptureStream?.() ?? null;
}

function stripAudioTracks(stream: MediaStream) {
  for (const track of stream.getAudioTracks()) {
    track.stop();
    stream.removeTrack(track);
  }
}

export type ExportVideoOptions = {
  startSeconds: number;
  endSeconds: number;
  mute: boolean;
};

/** Re-encode clip with optional trim and muted audio. */
export async function exportVideoFile(file: File, options: ExportVideoOptions) {
  const start = Math.max(0, options.startSeconds);
  const end = Math.max(start, options.endSeconds);
  const clipDuration = Math.min(end - start, MAX_TRIM_CLIP_SECONDS);

  if (clipDuration <= 0.05) {
    throw new Error("Choose a longer clip.");
  }

  const mimeType = pickVideoRecorderMimeType();

  if (!mimeType) {
    if (options.mute) {
      throw new Error("Muted export is not supported in this browser.");
    }

    return file;
  }

  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Unable to load video for export."));
      video.src = url;
    });

    await new Promise<void>((resolve, reject) => {
      video.onseeked = () => resolve();
      video.onerror = () => reject(new Error("Unable to seek video."));
      video.currentTime = Math.min(start, Math.max(video.duration - 0.05, 0));
    });

    const stream = getCaptureStream(video);

    if (!stream) {
      return file;
    }

    if (options.mute) {
      stripAudioTracks(stream);
    }

    const chunks: BlobPart[] = [];
    const recorder = new MediaRecorder(stream, { mimeType });

    const exported = await new Promise<File>((resolve, reject) => {
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onerror = () => reject(new Error("Video export failed."));

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        const extension = mimeType.includes("mp4") ? "mp4" : "webm";
        resolve(
          new File([blob], `spot-export-${Date.now()}.${extension}`, { type: blob.type })
        );
      };

      recorder.start(200);

      void video.play().catch(() => {
        // Some browsers block autoplay; recorder may still capture frames.
      });

      window.setTimeout(() => {
        video.pause();
        if (recorder.state === "recording") {
          recorder.stop();
        }
      }, clipDuration * 1000);
    });

    return exported;
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

export function videoNeedsExport(options: {
  mediaType: "image" | "video";
  trimStart: number;
  trimEnd: number;
  duration: number;
  mute: boolean;
}) {
  if (options.mediaType !== "video") {
    return false;
  }

  const trimActive =
    options.trimStart > 0.05 || options.trimEnd < options.duration - 0.05;

  return trimActive || options.mute;
}
