/** Reject absurd HTMLMediaElement.duration values (corrupt metadata / unit mistakes). */
const MAX_PLAUSIBLE_VOICE_MESSAGE_SECONDS = 60 * 30;

function normalizeAudioDurationSeconds(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return 0;
  }

  if (value > MAX_PLAUSIBLE_VOICE_MESSAGE_SECONDS) {
    return 0;
  }

  return value;
}

/**
 * Reads the real duration of a recorded voice-message Blob, in seconds.
 *
 * Mirrors lib/videoTrim.ts's getVideoDurationSeconds: MediaRecorder output (webm/opus on
 * Chrome/Android, sometimes mp4 on iOS) frequently reports `duration: Infinity` — or `NaN` —
 * from `loadedmetadata` alone, because the container has no finalized duration field (it was
 * produced live, not muxed from a known-length source). Seeking far past the real end forces
 * the browser to scan to the actual last sample and fix up `duration`/`currentTime` with the
 * true value. Falls back to whatever `elapsedMs`-based estimate the caller already has if the
 * blob can't be decoded (e.g. in a test/SSR environment, or a genuinely corrupt file).
 */
export async function getAudioBlobDurationSeconds(blob: Blob): Promise<number> {
  if (typeof document === "undefined" || typeof Audio === "undefined") {
    return 0;
  }

  const url = URL.createObjectURL(blob);

  try {
    const audio = new Audio();
    audio.preload = "metadata";
    audio.muted = true;

    await new Promise<void>((resolve) => {
      const timeoutId = window.setTimeout(() => {
        cleanup();
        resolve();
      }, 3000);
      const onReady = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        resolve();
      };
      const cleanup = () => {
        window.clearTimeout(timeoutId);
        audio.removeEventListener("loadedmetadata", onReady);
        audio.removeEventListener("error", onError);
      };

      audio.addEventListener("loadedmetadata", onReady);
      audio.addEventListener("error", onError);
      audio.src = url;
    });

    const initial = normalizeAudioDurationSeconds(audio.duration);

    if (initial > 0) {
      return initial;
    }

    // Force duration discovery for MediaRecorder blobs that report Infinity/NaN/0 until seeked.
    await new Promise<void>((resolve) => {
      const timeoutId = window.setTimeout(() => {
        cleanup();
        resolve();
      }, 3000);
      const onSeeked = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        resolve();
      };
      const cleanup = () => {
        window.clearTimeout(timeoutId);
        audio.removeEventListener("seeked", onSeeked);
        audio.removeEventListener("durationchange", onSeeked);
        audio.removeEventListener("error", onError);
      };

      audio.addEventListener("seeked", onSeeked);
      audio.addEventListener("durationchange", onSeeked);
      audio.addEventListener("error", onError);

      try {
        audio.currentTime = 1e10;
      } catch {
        cleanup();
        resolve();
      }
    });

    const afterSeek = normalizeAudioDurationSeconds(audio.duration);
    const fromPlayhead = normalizeAudioDurationSeconds(audio.currentTime);

    return afterSeek > 0 ? afterSeek : fromPlayhead;
  } catch (caught) {
    console.warn("[voice-message] unable to read real audio duration", caught);
    return 0;
  } finally {
    URL.revokeObjectURL(url);
  }
}
