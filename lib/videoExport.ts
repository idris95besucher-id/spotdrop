import {
  CAMERA_AUDIO_BITS_PER_SECOND,
  isIosSafari,
  parseRecorderCodecs,
} from "@/lib/cameraCapture";
import { isCapacitorNative } from "@/lib/capacitorUtils";
import { MAX_TRIM_CLIP_SECONDS } from "@/lib/videoTrim";
import { logVideoQuality, probeVideoFile } from "@/lib/videoQualityDiagnostics";

/** Desktop re-encode target — 1080p-friendly bitrate; kept below prior 25 Mbps for faster upload. */
const EXPORT_VIDEO_BITS_PER_SECOND = 10_000_000;

function isIosPlaybackTarget() {
  return isIosSafari() || isCapacitorNative();
}

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

export type ExportVideoDecision = {
  reEncoded: boolean;
  reason: string;
  sourceFileType: string;
  exportMimeType: string | null;
  audioCodec: string | null;
  videoCodec: string | null;
  audioBitsPerSecond: number | null;
  videoBitsPerSecond: number | null;
};

/**
 * Pick the best mimeType for re-encoding a video clip.
 * Prefer vp8+opus so audio is preserved. Falls back to bare webm, then empty
 * (browser default) if nothing is supported.
 */
function pickExportMimeType(sourceFile: File): string {
  if (typeof MediaRecorder === "undefined") {
    return "";
  }

  if (isIosPlaybackTarget()) {
    return "";
  }

  if (sourceFile.type.includes("mp4") || sourceFile.name.toLowerCase().endsWith(".mp4")) {
    return "";
  }

  const candidates = [
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9,opus",
    "video/webm",
  ];

  for (const mimeType of candidates) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType;
    }
  }

  return "";
}

function logExportDecision(decision: ExportVideoDecision) {
  console.log("[SpotDrop export] video export decision", decision);
}

/** Re-encode clip with optional trim and muted audio. */
export async function exportVideoFile(file: File, options: ExportVideoOptions) {
  const start = Math.max(0, options.startSeconds);
  const end = Math.max(start, options.endSeconds);
  const clipDuration = Math.min(end - start, MAX_TRIM_CLIP_SECONDS);

  if (clipDuration <= 0.05) {
    throw new Error("Choose a longer clip.");
  }

  const mimeType = pickExportMimeType(file);

  if (!mimeType) {
    if (options.mute) {
      throw new Error("Muted export is not supported in this browser.");
    }

    logExportDecision({
      reEncoded: false,
      reason: isIosPlaybackTarget()
        ? "iOS/Capacitor — preserve native mp4/aac recording"
        : "mp4 source or unsupported re-encode — copy original file",
      sourceFileType: file.type || "(unknown)",
      exportMimeType: null,
      audioCodec: null,
      videoCodec: null,
      audioBitsPerSecond: null,
      videoBitsPerSecond: null,
    });

    return file;
  }

  const codecs = parseRecorderCodecs(mimeType);
  logExportDecision({
    reEncoded: true,
    reason: options.mute
      ? "trim/mute requires captureStream re-encode"
      : "trim requires captureStream re-encode",
    sourceFileType: file.type || "(unknown)",
    exportMimeType: mimeType,
    audioCodec: codecs.audioCodec,
    videoCodec: codecs.videoCodec,
    audioBitsPerSecond: CAMERA_AUDIO_BITS_PER_SECOND,
    videoBitsPerSecond: EXPORT_VIDEO_BITS_PER_SECOND,
  });

  const sourceProbe = await probeVideoFile(file);

  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  // Do NOT mute the hidden video element — captureStream() captures both
  // video and audio tracks, and setting muted=true can prevent audio from
  // being included in the captured MediaStream on some browsers.
  video.muted = false;
  video.volume = 0; // silent to speaker, but audio IS in captureStream
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
      logExportDecision({
        reEncoded: false,
        reason: "captureStream unavailable — copy original file",
        sourceFileType: file.type || "(unknown)",
        exportMimeType: null,
        audioCodec: null,
        videoCodec: null,
        audioBitsPerSecond: null,
        videoBitsPerSecond: null,
      });
      return file;
    }

    if (options.mute) {
      stripAudioTracks(stream);
    }

    const chunks: BlobPart[] = [];
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: EXPORT_VIDEO_BITS_PER_SECOND,
      audioBitsPerSecond: options.mute ? undefined : CAMERA_AUDIO_BITS_PER_SECOND,
    });

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
        const outCodecs = parseRecorderCodecs(recorder.mimeType || mimeType);
        console.log("[SpotDrop export] export complete", {
          reEncoded: true,
          exportMimeType: recorder.mimeType || mimeType,
          audioCodec: outCodecs.audioCodec,
          videoCodec: outCodecs.videoCodec,
          audioBitsPerSecond: options.mute ? 0 : CAMERA_AUDIO_BITS_PER_SECOND,
          videoBitsPerSecond: EXPORT_VIDEO_BITS_PER_SECOND,
          blobSize: blob.size,
        });
        const exportedFile = new File([blob], `spot-export-${Date.now()}.${extension}`, {
          type: blob.type,
        });

        void probeVideoFile(exportedFile).then((exportProbe) => {
          logVideoQuality("desktop export", {
            ...sourceProbe,
            ...exportProbe,
            reEncoded: true,
            exportedResolution:
              exportProbe.width && exportProbe.height
                ? `${exportProbe.width}x${exportProbe.height}`
                : null,
            exportedBitrateMbps: exportProbe.estimatedBitrateMbps,
            exportedMimeType: exportedFile.type || mimeType,
            finalUploadSizeBytes: exportedFile.size,
          });
        });

        resolve(exportedFile);
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
