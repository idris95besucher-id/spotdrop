export const CAMERA_MAX_VIDEO_SECONDS = 60;

export const CAMERA_PERMISSION_MESSAGE = "Camera access is required to record a Spot.";

/** Press-and-hold duration before video recording starts (short tap = photo). */
export const HOLD_THRESHOLD_MS = 350;

/** Minimum time between record start and stop (Safari needs time to emit chunks). */
export const MIN_RECORDING_DURATION_MS = 2000;

/** Timeslice interval passed to MediaRecorder.start — required for Safari chunk delivery. */
export const RECORDER_TIMESLICE_MS = 1000;

/** Wait after stop() before validating chunks/blob. */
export const POST_STOP_CHUNK_WAIT_MS = 300;

export const RECORDING_BROWSER_UNSAVED_MESSAGE =
  "Recording was not saved by this browser. Please try again.";

/** Target recording bitrate (bits per second) — high for sharp 1080p/4K output. */
export const CAMERA_VIDEO_BITS_PER_SECOND = 12_000_000;

export const CAMERA_VIDEO_BITS_PER_SECOND_FALLBACK = 8_000_000;

/** iPhone / WKWebView recording bitrates — match native Camera app quality. */
export const IOS_CAMERA_VIDEO_BITS_PER_SECOND = 12_000_000;

export const IOS_CAMERA_VIDEO_BITS_PER_SECOND_FALLBACK = 8_000_000;

export const IOS_CAMERA_AUDIO_BITS_PER_SECOND = 192_000;

export type CameraFacingMode = "user" | "environment";

export type CameraQualityMode = "smooth" | "hd";

export type RecordingDebugInfo = {
  mediaRecorderSupported: boolean;
  chosenMimeType: string;
  recorderMimeType: string;
  recorderState: RecordingState;
  chunkCount: number;
  finalBlobSize: number;
  streamActive: boolean;
  videoTrackReadyState: MediaStreamTrackState | "missing";
};

export function isMediaRecorderSupported() {
  return typeof MediaRecorder !== "undefined";
}

export function isIosSafari() {
  if (typeof navigator === "undefined") {
    return false;
  }

  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function pickVideoRecorderMimeType() {
  if (!isMediaRecorderSupported() || isIosSafari()) {
    return "";
  }

  // Prefer codecs that encode BOTH video and audio.
  // vp8+opus → widely supported in Chrome/Chromium-based browsers.
  // vp9+opus → higher quality, also broadly supported.
  // Bare "video/webm" → let the browser choose (usually includes opus audio).
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

/** Desktop-only fallbacks when default MediaRecorder(stream) fails to construct. Never mp4. */
function getSafeDesktopRecorderMimeTypes() {
  if (!isMediaRecorderSupported() || isIosSafari()) {
    return [] as string[];
  }

  return [
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9,opus",
    "video/webm",
  ].filter((mimeType) => MediaRecorder.isTypeSupported(mimeType));
}

export function getStreamRecordingDebug(stream: MediaStream | null): Pick<
  RecordingDebugInfo,
  "streamActive" | "videoTrackReadyState"
> {
  const videoTrack = stream?.getVideoTracks()[0];

  return {
    streamActive: stream?.active ?? false,
    videoTrackReadyState: videoTrack?.readyState ?? "missing",
  };
}

export function buildRecordingDebugInfo(
  stream: MediaStream,
  recorder: MediaRecorder,
  chosenMimeType: string,
  chunks: BlobPart[],
  finalBlobSize: number
): RecordingDebugInfo {
  const streamDebug = getStreamRecordingDebug(stream);

  return {
    mediaRecorderSupported: isMediaRecorderSupported(),
    chosenMimeType,
    recorderMimeType: recorder.mimeType || "(default)",
    recorderState: recorder.state,
    chunkCount: chunks.length,
    finalBlobSize,
    streamActive: streamDebug.streamActive,
    videoTrackReadyState: streamDebug.videoTrackReadyState,
  };
}

export function formatRecordingFailureDebug(debug: RecordingDebugInfo): string {
  return [
    "Recording failed.",
    `MediaRecorder: ${debug.mediaRecorderSupported ? "yes" : "no"}`,
    `mimeType: ${debug.recorderMimeType || debug.chosenMimeType || "none"}`,
    `state: ${debug.recorderState}`,
    `chunks: ${debug.chunkCount}`,
    `blob: ${debug.finalBlobSize} bytes`,
    `stream active: ${debug.streamActive}`,
    `video track: ${debug.videoTrackReadyState}`,
  ].join(" ");
}

export function validateRecordingStream(stream: MediaStream | null): string | null {
  if (!stream) {
    return "Camera stream is not available.";
  }

  const videoTrack = stream.getVideoTracks()[0];

  if (!videoTrack) {
    return "Camera stream has no video track.";
  }

  if (videoTrack.readyState !== "live") {
    return "Camera video track is not active.";
  }

  return null;
}

function buildRecordingStream(stream: MediaStream) {
  const videoTracks = stream.getVideoTracks();
  const audioTracks = stream.getAudioTracks().filter((track) => track.readyState === "live");

  if (videoTracks.length === 0) {
    throw new Error("Camera stream has no video track.");
  }

  return new MediaStream([...videoTracks, ...audioTracks]);
}

function createMediaRecorder(stream: MediaStream) {
  // Diagnostic: log every track entering the recorder so audio issues are visible in Xcode console.
  console.log("[SpotCamera] audio tracks", stream.getAudioTracks().map((t) => ({
    readyState: t.readyState,
    muted: t.muted,
    enabled: t.enabled,
    label: t.label,
  })));
  console.log("[SpotCamera] video tracks", stream.getVideoTracks().map((t) => ({
    readyState: t.readyState,
    muted: t.muted,
    enabled: t.enabled,
    label: t.label,
  })));

  if (isIosSafari()) {
    // On iOS Safari / WKWebView: let the browser choose the container (mp4/aac)
    // but explicitly set bitrates so audio IS encoded at a useful quality.
    const iosOptions: MediaRecorderOptions = {
      videoBitsPerSecond: IOS_CAMERA_VIDEO_BITS_PER_SECOND,
      audioBitsPerSecond: IOS_CAMERA_AUDIO_BITS_PER_SECOND,
    };
    try {
      const recorder = new MediaRecorder(stream, iosOptions);
      console.log("[SpotDrop camera] MediaRecorder created (iOS + bitrate options)", {
        mimeType: recorder.mimeType,
        state: recorder.state,
        videoBitsPerSecond: IOS_CAMERA_VIDEO_BITS_PER_SECOND,
        audioBitsPerSecond: IOS_CAMERA_AUDIO_BITS_PER_SECOND,
        audioTrackCount: stream.getAudioTracks().length,
      });
      return recorder;
    } catch {
      // Options not supported — fall back to no-options constructor.
      const recorder = new MediaRecorder(stream);
      console.warn("[SpotDrop camera] MediaRecorder created (iOS no-options fallback)", {
        mimeType: recorder.mimeType,
        state: recorder.state,
      });
      return recorder;
    }
  }

  const recordingStream = buildRecordingStream(stream);
  const desktopBitrateOptions: MediaRecorderOptions = {
    videoBitsPerSecond: CAMERA_VIDEO_BITS_PER_SECOND,
    audioBitsPerSecond: IOS_CAMERA_AUDIO_BITS_PER_SECOND,
  };

  try {
    const recorder = new MediaRecorder(recordingStream, desktopBitrateOptions);
    console.log("[SpotDrop camera] MediaRecorder created (default + bitrates)", {
      mimeType: recorder.mimeType,
      state: recorder.state,
      videoBitsPerSecond: CAMERA_VIDEO_BITS_PER_SECOND,
    });
    return recorder;
  } catch (caught) {
    console.warn("[SpotDrop camera] Default MediaRecorder with bitrates failed", caught);
  }

  try {
    const recorder = new MediaRecorder(recordingStream);
    console.log("[SpotDrop camera] MediaRecorder created (default, no mimeType)", {
      mimeType: recorder.mimeType,
      state: recorder.state,
    });
    return recorder;
  } catch (caught) {
    console.warn("[SpotDrop camera] Default MediaRecorder failed", caught);
  }

  for (const mimeType of getSafeDesktopRecorderMimeTypes()) {
    try {
      const recorder = new MediaRecorder(recordingStream, {
        mimeType,
        ...desktopBitrateOptions,
      });
      console.log("[SpotDrop camera] MediaRecorder created (webm fallback)", {
        mimeType: recorder.mimeType,
        state: recorder.state,
        requestedMimeType: mimeType,
      });
      return recorder;
    } catch (caught) {
      console.warn("[SpotDrop camera] MediaRecorder webm fallback failed", mimeType, caught);
    }
  }

  throw new Error("Unable to initialize video recorder.");
}

function startMediaRecorder(recorder: MediaRecorder) {
  if (recorder.state !== "inactive") {
    throw new Error(`MediaRecorder is already ${recorder.state}.`);
  }

  recorder.start(RECORDER_TIMESLICE_MS);

  console.log("[SpotDrop camera] MediaRecorder.start called", {
    state: recorder.state,
    timesliceMs: RECORDER_TIMESLICE_MS,
  });
}

function waitAfterStopForChunks() {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, POST_STOP_CHUNK_WAIT_MS);
  });
}

function waitForFinalDataChunk(
  recorder: MediaRecorder,
  chunks: BlobPart[],
  pushChunk: (data: Blob) => void,
  timeoutMs = 800
) {
  if (chunks.length > 0) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    const timeoutId = window.setTimeout(() => {
      recorder.removeEventListener("dataavailable", onData);
      console.warn("[SpotDrop camera] waitForFinalDataChunk timed out", {
        state: recorder.state,
        chunkCount: chunks.length,
      });
      resolve();
    }, timeoutMs);

    const onData = (event: BlobEvent) => {
      if (event.data && event.data.size > 0) {
        pushChunk(event.data);
        console.log("[SpotDrop camera] late dataavailable chunk", {
          size: event.data.size,
          chunkCount: chunks.length,
        });
      }

      window.clearTimeout(timeoutId);
      recorder.removeEventListener("dataavailable", onData);
      resolve();
    };

    recorder.addEventListener("dataavailable", onData);
  });
}

export const MIC_PERMISSION_MESSAGE =
  "Microphone access was denied. Video will be recorded without sound. Enable microphone in Settings and reopen the camera.";

export function mapCameraPermissionError(error: unknown) {
  if (!(error instanceof Error)) {
    return CAMERA_PERMISSION_MESSAGE;
  }

  const name = error.name?.toLowerCase() ?? "";
  const message = error.message.toLowerCase();

  if (
    name === "notallowederror" ||
    name === "permissiondeniederror" ||
    message.includes("permission") ||
    message.includes("not allowed")
  ) {
    return CAMERA_PERMISSION_MESSAGE;
  }

  return error.message;
}

/** Extended video constraints supported on iOS Safari / WKWebView. */
type ExtendedVideoConstraints = MediaTrackConstraints & {
  focusMode?: ConstrainDOMString;
  exposureMode?: ConstrainDOMString;
  whiteBalanceMode?: ConstrainDOMString;
  resizeMode?: ConstrainDOMString;
};

function buildAdvancedVideoConstraints(
  facingMode: CameraFacingMode,
  width: number,
  height: number,
  minWidth?: number
): ExtendedVideoConstraints {
  return {
    facingMode,
    width: minWidth ? { ideal: width, min: minWidth } : { ideal: width },
    height: { ideal: height },
    frameRate: { ideal: 30, max: 60 },
    // Continuous autofocus, auto exposure, and auto white balance — no beauty/smoothing.
    focusMode: { ideal: "continuous" },
    exposureMode: { ideal: "continuous" },
    whiteBalanceMode: { ideal: "continuous" },
    // Request the camera not downscale the sensor feed before delivery.
    resizeMode: { ideal: "none" },
  };
}

function buildAudioConstraints(): MediaTrackConstraints {
  // Prefer minimal audio processing to preserve natural microphone sound.
  // Use `ideal` so iOS WKWebView doesn't hard-reject unsupported flags.
  return {
    echoCancellation: { ideal: true },
    noiseSuppression: { ideal: false },
    autoGainControl: { ideal: false },
  };
}

/** 4K capture — preferred on iPhone 15 Pro and newer rear cameras. */
export function build4KVideoConstraints(
  facingMode: CameraFacingMode = "environment"
): ExtendedVideoConstraints {
  return buildAdvancedVideoConstraints(facingMode, 3840, 2160, 1920);
}

/** Full HD capture — 1080p minimum quality tier. */
export function buildFullHdVideoConstraints(
  facingMode: CameraFacingMode = "environment"
): ExtendedVideoConstraints {
  return buildAdvancedVideoConstraints(facingMode, 1920, 1080, 1920);
}

/** Balanced fallback — 720p only when 1080p/4K are unavailable. */
export function buildBalancedVideoConstraints(
  facingMode: CameraFacingMode = "environment"
): ExtendedVideoConstraints {
  return buildAdvancedVideoConstraints(facingMode, 1280, 720);
}

/** Low-tier fallback — last resort for constrained devices. */
export function buildLowVideoConstraints(
  facingMode: CameraFacingMode = "environment"
): ExtendedVideoConstraints {
  return {
    facingMode,
    width: { ideal: 960 },
    height: { ideal: 540 },
    frameRate: { ideal: 30, max: 30 },
  };
}

/** Apply continuous autofocus / exposure / white-balance after the stream is live. */
export async function optimizeVideoTrack(track: MediaStreamTrack | undefined) {
  if (!track) {
    return;
  }

  const advanced: MediaTrackConstraintSet[] = [
    { focusMode: "continuous" } as MediaTrackConstraintSet,
    { exposureMode: "continuous" } as MediaTrackConstraintSet,
    { whiteBalanceMode: "continuous" } as MediaTrackConstraintSet,
    { resizeMode: "none" } as MediaTrackConstraintSet,
  ];

  try {
    await track.applyConstraints({ advanced });
  } catch {
    // Individual flags may be unsupported — best-effort only.
  }
}

/** @deprecated Use {@link buildBalancedVideoConstraints}. */
export const buildHighQualityVideoConstraints = buildBalancedVideoConstraints;

export function logCameraTrackSettings(label: string, track: MediaStreamTrack | undefined) {
  if (!track || typeof console === "undefined") {
    return;
  }

  const settings = track.getSettings();
  const constraints = track.getConstraints?.() ?? {};

  const extended = settings as MediaTrackSettings & {
    focusMode?: string;
    exposureMode?: string;
    whiteBalanceMode?: string;
  };

  console.log(`[SpotDrop camera] ${label}`, {
    appliedSettings: {
      width: settings.width,
      height: settings.height,
      frameRate: settings.frameRate,
      facingMode: settings.facingMode,
      aspectRatio: settings.aspectRatio,
      deviceId: settings.deviceId,
      focusMode: extended.focusMode,
      exposureMode: extended.exposureMode,
      whiteBalanceMode: extended.whiteBalanceMode,
    },
    appliedConstraints: constraints,
  });
}

function getCameraConstraintAttempts(
  facingMode: CameraFacingMode,
  quality: CameraQualityMode,
  includeAudio = true
): MediaStreamConstraints[] {
  const audio = includeAudio ? buildAudioConstraints() : false;
  const videoProfiles =
    quality === "smooth"
      ? [buildLowVideoConstraints(facingMode)]
      : [
          build4KVideoConstraints(facingMode),
          buildFullHdVideoConstraints(facingMode),
          buildBalancedVideoConstraints(facingMode),
        ];

  const attempts: MediaStreamConstraints[] = [];

  // Prefer a single getUserMedia call with audio+video — required on iOS for
  // MediaRecorder to encode audio and for maximum sensor resolution.
  for (const video of videoProfiles) {
    attempts.push({ audio, video });
  }

  // Video-only fallbacks if the combined call fails (mic permission pending).
  for (const video of videoProfiles) {
    attempts.push({ audio: false, video });
  }

  attempts.push({ audio, video: true });
  attempts.push({ audio: false, video: true });

  return attempts;
}

export function resolveCameraQualityMode(
  quality: CameraQualityMode | undefined,
  hdEnabled?: boolean
): CameraQualityMode {
  if (quality) {
    return quality;
  }

  if (hdEnabled === false) {
    return "smooth";
  }

  // Always default to maximum quality — never silently downgrade on iOS.
  return "hd";
}

export function getMediaRecorderOptions(mimeType: string): MediaRecorderOptions {
  return {
    mimeType,
    videoBitsPerSecond: CAMERA_VIDEO_BITS_PER_SECOND,
    audioBitsPerSecond: IOS_CAMERA_AUDIO_BITS_PER_SECOND,
  };
}

/** Wait until the preview element has real frame dimensions (needed before canvas capture). */
export async function waitForVideoDimensions(video: HTMLVideoElement, timeoutMs = 4000) {
  if (video.videoWidth > 0 && video.videoHeight > 0) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("Camera preview is not ready."));
    }, timeoutMs);

    const onReady = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        cleanup();
        resolve();
      }
    };

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("resize", onReady);
    };

    video.addEventListener("loadeddata", onReady);
    video.addEventListener("resize", onReady);
    onReady();
  });
}

export async function startCameraStream(
  facingMode: CameraFacingMode = "environment",
  options?: { quality?: CameraQualityMode; includeAudio?: boolean }
) {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera is not available in this browser.");
  }

  const quality = resolveCameraQualityMode(options?.quality);
  const includeAudio = options?.includeAudio ?? true;
  const attempts = getCameraConstraintAttempts(facingMode, quality, includeAudio);
  let lastError: unknown = null;

  for (let index = 0; index < attempts.length; index += 1) {
    const constraints = attempts[index]!;

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const videoTrack = stream.getVideoTracks()[0];

      await optimizeVideoTrack(videoTrack);
      logCameraTrackSettings("after getUserMedia", videoTrack);
      return stream;
    } catch (caught) {
      console.warn(`[SpotDrop camera] attempt ${index + 1} failed`, caught);
      lastError = caught;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Unable to access the camera.");
}

export function stopCameraStream(stream: MediaStream | null) {
  if (!stream) {
    return;
  }

  for (const track of stream.getTracks()) {
    track.stop();
  }
}

export function cameraSupportsTorch(stream: MediaStream | null) {
  const track = stream?.getVideoTracks()[0];

  if (!track?.getCapabilities) {
    return false;
  }

  const capabilities = track.getCapabilities() as MediaTrackCapabilities & { torch?: boolean };

  return Boolean(capabilities.torch);
}

export async function setTorchEnabled(stream: MediaStream | null, enabled: boolean) {
  const track = stream?.getVideoTracks()[0];

  if (!track || !cameraSupportsTorch(stream)) {
    return false;
  }

  try {
    await track.applyConstraints({
      advanced: [{ torch: enabled } as MediaTrackConstraintSet],
    });

    return true;
  } catch {
    return false;
  }
}

export async function capturePhotoFromVideo(video: HTMLVideoElement) {
  await waitForVideoDimensions(video);

  const width = video.videoWidth;
  const height = video.videoHeight;

  if (!width || !height) {
    throw new Error("Unable to capture photo at full resolution.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Unable to capture photo.");
  }

  context.imageSmoothingEnabled = false;
  context.drawImage(video, 0, 0, width, height);

  return new Promise<File>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Unable to capture photo."));
          return;
        }

        resolve(new File([blob], `story-photo-${Date.now()}.jpg`, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.98
    );
  });
}

export const RECORDING_FAILED_MESSAGE = "Recording failed. Please try again.";

export type RecordVideoCallbacks = {
  onStart?: () => void;
  onChunk?: (chunkCount: number) => void;
};

export type VideoRecorderHandle = {
  stop: () => Promise<File>;
  cancel: () => void;
  getRecorderState: () => RecordingState;
  getChunkCount: () => number;
};

export function recordVideoFromStream(
  stream: MediaStream,
  maxSeconds = CAMERA_MAX_VIDEO_SECONDS,
  callbacks?: RecordVideoCallbacks
): VideoRecorderHandle {
  if (!isMediaRecorderSupported()) {
    throw new Error("Video recording is not supported in this browser.");
  }

  const streamError = validateRecordingStream(stream);

  if (streamError) {
    throw new Error(streamError);
  }

  const chosenMimeType = pickVideoRecorderMimeType();
  const recordingStream = isIosSafari() ? stream : buildRecordingStream(stream);

  console.log("[SpotDrop camera] recordVideoFromStream init", {
    mediaRecorderSupported: true,
    chosenMimeType: chosenMimeType || "(none — browser default)",
    isIosSafari: isIosSafari(),
    timesliceMs: RECORDER_TIMESLICE_MS,
    ...getStreamRecordingDebug(recordingStream),
  });

  const recorder = createMediaRecorder(stream);
  const resolvedMimeType = recorder.mimeType || chosenMimeType || "";

  const chunks: BlobPart[] = [];
  let started = false;
  let stopped = false;
  let settled = false;
  let maxTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let settleReject: (message: string) => void = () => {};
  let settleResolve: (file: File) => void = () => {};

  const pushChunk = (data: Blob) => {
    chunks.push(data);
    callbacks?.onChunk?.(chunks.length);
    console.log("[SpotDrop camera] chunk received", {
      size: data.size,
      chunkCount: chunks.length,
      recorderState: recorder.state,
    });
  };

  const recordingPromise = new Promise<File>((resolve, reject) => {
    settleReject = (message: string) => {
      if (settled) {
        return;
      }

      settled = true;
      reject(new Error(message));
    };

    settleResolve = (file: File) => {
      if (settled) {
        return;
      }

      settled = true;
      resolve(file);
    };

    recorder.onstart = () => {
      started = true;
      console.log("[SpotDrop camera] MediaRecorder onstart", {
        state: recorder.state,
        mimeType: recorder.mimeType,
        ...getStreamRecordingDebug(recordingStream),
      });

      if (maxTimeoutId) {
        clearTimeout(maxTimeoutId);
      }

      maxTimeoutId = setTimeout(() => {
        finishRecording();
      }, maxSeconds * 1000);

      callbacks?.onStart?.();
    };

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        pushChunk(event.data);
      }
    };

    recorder.onerror = (event) => {
      const debug = buildRecordingDebugInfo(recordingStream, recorder, chosenMimeType, chunks, 0);
      console.error("[SpotDrop camera] MediaRecorder error event", event, debug);
      settleReject(RECORDING_BROWSER_UNSAVED_MESSAGE);
    };

    recorder.onstop = () => {
      void (async () => {
        if (maxTimeoutId) {
          clearTimeout(maxTimeoutId);
          maxTimeoutId = null;
        }

        await waitForFinalDataChunk(recorder, chunks, pushChunk);
        await waitAfterStopForChunks();

        const blobType = resolvedMimeType || recorder.mimeType || "video/mp4";
        const blob = new Blob(chunks, { type: blobType });
        const debug = buildRecordingDebugInfo(
          recordingStream,
          recorder,
          chosenMimeType,
          chunks,
          blob.size
        );

        console.log("[SpotDrop camera] MediaRecorder onstop", debug);

        if (blob.size === 0 || chunks.length === 0) {
          console.error("[SpotDrop camera] zero-chunk recording", formatRecordingFailureDebug(debug));
          settleReject(RECORDING_BROWSER_UNSAVED_MESSAGE);
          return;
        }

        const extension = blobType.includes("mp4") ? "mp4" : "webm";
        settleResolve(
          new File([blob], `spot-video-${Date.now()}.${extension}`, {
            type: blob.type || blobType,
          })
        );
      })();
    };
  });

  const finishRecording = () => {
    if (stopped) {
      return;
    }

    stopped = true;

    console.log("[SpotDrop camera] finishRecording", {
      state: recorder.state,
      started,
      chunkCount: chunks.length,
      ...getStreamRecordingDebug(recordingStream),
    });

    if (recorder.state === "recording") {
      try {
        if (typeof recorder.requestData === "function") {
          recorder.requestData();
          console.log("[SpotDrop camera] requestData() called before stop");
        }

        recorder.stop();
        console.log("[SpotDrop camera] MediaRecorder.stop called", { state: recorder.state });
      } catch (caught) {
        const debug = buildRecordingDebugInfo(recordingStream, recorder, chosenMimeType, chunks, 0);
        console.error("[SpotDrop camera] MediaRecorder.stop failed", caught, debug);
        settleReject(RECORDING_BROWSER_UNSAVED_MESSAGE);
      }

      return;
    }

    if (!started) {
      const debug = buildRecordingDebugInfo(recordingStream, recorder, chosenMimeType, chunks, 0);
      console.error("[SpotDrop camera] stop called before recorder onstart", debug);
      settleReject(RECORDING_BROWSER_UNSAVED_MESSAGE);
    }
  };

  try {
    startMediaRecorder(recorder);
  } catch (caught) {
    console.error("[SpotDrop camera] MediaRecorder.start failed", caught);
    throw caught instanceof Error ? caught : new Error("Unable to start recording.");
  }

  return {
    stop: async () => {
      finishRecording();
      return recordingPromise;
    },
    cancel: () => {
      if (stopped) {
        return;
      }

      stopped = true;

      if (maxTimeoutId) {
        clearTimeout(maxTimeoutId);
        maxTimeoutId = null;
      }

      if (recorder.state === "recording") {
        try {
          recorder.stop();
        } catch (caught) {
          console.error("[SpotDrop camera] MediaRecorder.cancel stop failed", caught);
        }
      }
    },
    getRecorderState: () => recorder.state,
    getChunkCount: () => chunks.length,
  };
}

// ─── Audio helpers ────────────────────────────────────────────────────────────

/** Returns true if the stream has at least one live audio track. */
/**
 * Returns true only when the stream has at least one audio track that is both
 * live AND not muted. On iOS WKWebView the system can hand back a track with
 * readyState "live" but .muted === true when microphone access hasn't been
 * fully confirmed yet — that track produces silence, so we treat it as absent.
 */
export function streamHasAudio(stream: MediaStream | null): boolean {
  if (!stream) return false;
  return stream.getAudioTracks().some((t) => t.readyState === "live" && !t.muted);
}

/**
 * Request a microphone-only stream. Returns null if permission is denied or
 * the API is unavailable — callers must treat null as "no audio available".
 */
export async function requestAudioOnlyStream(): Promise<MediaStream | null> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return null;
  }

  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: buildAudioConstraints(),
      video: false,
    });
  } catch (caught) {
    console.warn("[SpotDrop camera] requestAudioOnlyStream failed", caught);
    return null;
  }
}

/**
 * Combine the video tracks from `videoStream` with the live, unmuted audio
 * tracks from `audioStream` into a new MediaStream suitable for MediaRecorder.
 */
export function mergeAudioIntoStream(
  videoStream: MediaStream,
  audioStream: MediaStream
): MediaStream {
  const videoTracks = videoStream.getVideoTracks();
  const audioTracks = audioStream
    .getAudioTracks()
    .filter((t) => t.readyState === "live" && !t.muted);
  console.log("[SpotDrop camera] mergeAudioIntoStream", {
    videoTrackCount: videoTracks.length,
    audioTrackCount: audioTracks.length,
    allAudioTracks: audioStream.getAudioTracks().map((t) => ({
      readyState: t.readyState,
      muted: t.muted,
      enabled: t.enabled,
      label: t.label,
    })),
  });
  return new MediaStream([...videoTracks, ...audioTracks]);
}