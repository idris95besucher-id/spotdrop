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

/** Target recording bitrate (bits per second). */
export const CAMERA_VIDEO_BITS_PER_SECOND = 2_000_000;

export const CAMERA_VIDEO_BITS_PER_SECOND_FALLBACK = 3_000_000;

/** iPhone Safari recording bitrates — lower for smoother capture. */
export const IOS_CAMERA_VIDEO_BITS_PER_SECOND = 1_500_000;

export const IOS_CAMERA_VIDEO_BITS_PER_SECOND_FALLBACK = 2_000_000;

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

  const candidates = ["video/webm;codecs=vp8", "video/webm"];

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

  return ["video/webm;codecs=vp8", "video/webm"].filter((mimeType) =>
    MediaRecorder.isTypeSupported(mimeType)
  );
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
  if (isIosSafari()) {
    const recorder = new MediaRecorder(stream);
    console.log("[SpotDrop camera] MediaRecorder created (Safari — no options)", {
      mimeType: recorder.mimeType,
      state: recorder.state,
      note: "Browser-chosen mimeType; no mimeType passed in constructor",
    });
    return recorder;
  }

  const recordingStream = buildRecordingStream(stream);

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
      const recorder = new MediaRecorder(recordingStream, { mimeType });
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

function buildAudioConstraints(): boolean | MediaTrackConstraints {
  if (isIosSafari()) {
    return true;
  }

  return {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  };
}

/** Balanced capture profile — 720p @ 30fps max. */
export function buildBalancedVideoConstraints(
  facingMode: CameraFacingMode = "environment"
): MediaTrackConstraints {
  return {
    facingMode,
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30, max: 30 },
  };
}

/** Low-tier fallback — 540p @ 24fps for laggy or constrained devices. */
export function buildLowVideoConstraints(
  facingMode: CameraFacingMode = "environment"
): MediaTrackConstraints {
  return {
    facingMode,
    width: { ideal: 960 },
    height: { ideal: 540 },
    frameRate: { ideal: 24, max: 24 },
  };
}

/** @deprecated Use {@link buildBalancedVideoConstraints}. */
export const buildHighQualityVideoConstraints = buildBalancedVideoConstraints;

export function logCameraTrackSettings(label: string, track: MediaStreamTrack | undefined) {
  if (!track || typeof console === "undefined") {
    return;
  }

  const settings = track.getSettings();
  const constraints = track.getConstraints?.() ?? {};

  console.log(`[SpotDrop camera] ${label}`, {
    requested: buildBalancedVideoConstraints(
      (settings.facingMode as CameraFacingMode | undefined) ?? "environment"
    ),
    appliedSettings: {
      width: settings.width,
      height: settings.height,
      frameRate: settings.frameRate,
      facingMode: settings.facingMode,
      aspectRatio: settings.aspectRatio,
      deviceId: settings.deviceId,
    },
    appliedConstraints: constraints,
  });
}

function getCameraConstraintAttempts(
  facingMode: CameraFacingMode,
  quality: CameraQualityMode
): MediaStreamConstraints[] {
  const audio = buildAudioConstraints();

  if (quality === "smooth") {
    return [{ audio, video: buildLowVideoConstraints(facingMode) }];
  }

  return [
    { audio, video: buildBalancedVideoConstraints(facingMode) },
    { audio, video: buildLowVideoConstraints(facingMode) },
  ];
}

export function resolveCameraQualityMode(
  quality: CameraQualityMode | undefined,
  hdEnabled?: boolean
): CameraQualityMode {
  if (quality) {
    return quality;
  }

  if (hdEnabled !== undefined) {
    return hdEnabled ? "hd" : "smooth";
  }

  return isIosSafari() ? "smooth" : "hd";
}

export function getMediaRecorderOptions(mimeType: string): MediaRecorderOptions {
  return {
    mimeType,
    videoBitsPerSecond: CAMERA_VIDEO_BITS_PER_SECOND,
    audioBitsPerSecond: 96_000,
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
  options?: { quality?: CameraQualityMode }
) {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera is not available in this browser.");
  }

  const quality = resolveCameraQualityMode(options?.quality);
  const attempts = getCameraConstraintAttempts(facingMode, quality);
  let lastError: unknown = null;

  for (let index = 0; index < attempts.length; index += 1) {
    const constraints = attempts[index]!;

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const videoTrack = stream.getVideoTracks()[0];

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

  context.imageSmoothingEnabled = true;
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
      0.92
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