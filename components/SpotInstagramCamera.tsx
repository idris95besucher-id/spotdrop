"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Loader2, RotateCcw, X, Zap, ZapOff } from "lucide-react";
import SpotCameraV2Banner from "@/components/SpotCameraV2Banner";
import {
  CAMERA_MAX_VIDEO_SECONDS,
  CAMERA_PERMISSION_MESSAGE,
  MIN_RECORDING_DURATION_MS,
  RECORDING_BROWSER_UNSAVED_MESSAGE,
  capturePhotoFromVideo,
  recordVideoFromStream,
  cameraSupportsTorch,
  setTorchEnabled,
  mapCameraPermissionError,
  startCameraStream,
  stopCameraStream,
  validateRecordingStream,
  isMediaRecorderSupported,
  isIosSafari,
  resolveCameraQualityMode,
  HOLD_THRESHOLD_MS,
  type CameraFacingMode,
  type CameraQualityMode,
  type VideoRecorderHandle,
} from "@/lib/cameraCapture";

type SpotInstagramCameraProps = {
  onClose: () => void;
  onCapture: (file: File, mediaType: "image" | "video") => void;
};

/** Grace period after hold threshold for pointer-up photo vs video decision. */
const TAP_PHOTO_GRACE_MS = 80;

function formatRecordingSeconds(elapsedMs: number) {
  const total = Math.min(Math.floor(elapsedMs / 1000), CAMERA_MAX_VIDEO_SECONDS);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function SpotInstagramCamera({
  onClose,
  onCapture,
}: SpotInstagramCameraProps) {
  const [facingMode, setFacingMode] = useState<CameraFacingMode>("environment");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraStarting, setCameraStarting] = useState(true);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingElapsedMs, setRecordingElapsedMs] = useState(0);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hdEnabled, setHdEnabled] = useState(false);
  const [showHdToggle, setShowHdToggle] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const shutterRef = useRef<HTMLButtonElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<VideoRecorderHandle | null>(null);
  const recordingStartedRef = useRef(false);
  const pendingStopRef = useRef(false);
  const recordingTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);
  const startAttemptedRef = useRef(false);
  const holdToRecordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdRecordingStartedRef = useRef(false);
  const pointerDownAtRef = useRef(0);

  const clearRecordingTick = useCallback(() => {
    if (recordingTickRef.current) {
      clearInterval(recordingTickRef.current);
      recordingTickRef.current = null;
    }
  }, []);

  const clearHoldToRecordTimer = useCallback(() => {
    if (holdToRecordTimerRef.current) {
      clearTimeout(holdToRecordTimerRef.current);
      holdToRecordTimerRef.current = null;
    }
  }, []);

  const attachStreamToVideo = useCallback(async (stream: MediaStream) => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    video.setAttribute("playsinline", "true");
    video.setAttribute("webkit-playsinline", "true");
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.srcObject = stream;

    try {
      await video.play();
    } catch {
      // Autoplay may require a gesture on some browsers.
    }
  }, []);

  const startCamera = useCallback(
    async (
      nextFacing: CameraFacingMode = facingMode,
      nextHdEnabled: boolean = hdEnabled
    ) => {
      setCameraStarting(true);
      setCameraError(null);

      stopCameraStream(streamRef.current);
      streamRef.current = null;

      const quality: CameraQualityMode = showHdToggle
        ? resolveCameraQualityMode(undefined, nextHdEnabled)
        : "hd";

      try {
        const stream = await startCameraStream(nextFacing, { quality });
        streamRef.current = stream;
        await attachStreamToVideo(stream);
        setTorchSupported(cameraSupportsTorch(stream));
        setTorchOn(false);
      } catch (caught) {
        console.error("[SpotDrop camera] startCamera failed", caught);
        setCameraError(mapCameraPermissionError(caught));
      } finally {
        setCameraStarting(false);
      }
    },
    [attachStreamToVideo, facingMode, hdEnabled, showHdToggle]
  );

  useEffect(() => {
    setShowHdToggle(isIosSafari());
  }, []);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
      clearRecordingTick();
      clearHoldToRecordTimer();
      recorderRef.current?.cancel();
      recorderRef.current = null;
      stopCameraStream(streamRef.current);
      streamRef.current = null;
    };
  }, [clearHoldToRecordTimer, clearRecordingTick]);

  useLayoutEffect(() => {
    if (startAttemptedRef.current) {
      return;
    }

    startAttemptedRef.current = true;
    void startCamera("environment");
  }, [startCamera]);

  const resetRecordingUi = useCallback(() => {
    clearRecordingTick();
    recordingStartedRef.current = false;
    recordingStartedAtRef.current = null;
    pendingStopRef.current = false;
    holdRecordingStartedRef.current = false;
    recorderRef.current = null;
    setIsRecording(false);
    setRecordingElapsedMs(0);
  }, [clearRecordingTick]);

  const endRecording = useCallback(async () => {
    if (!recorderRef.current) {
      return;
    }

    if (!recordingStartedRef.current) {
      pendingStopRef.current = true;
      return;
    }

    const startedAt = recordingStartedAtRef.current ?? Date.now();
    const elapsed = Date.now() - startedAt;

    if (elapsed < MIN_RECORDING_DURATION_MS) {
      const waitMs = MIN_RECORDING_DURATION_MS - elapsed;
      console.log("[SpotDrop camera] waiting for minimum recording duration", { elapsed, waitMs });
      await new Promise((resolve) => window.setTimeout(resolve, waitMs));
    }

    const recorder = recorderRef.current;
    recorderRef.current = null;
    clearRecordingTick();
    setIsRecording(false);
    setCaptureBusy(true);
    holdRecordingStartedRef.current = false;

    try {
      console.log("[SpotDrop camera] endRecording", {
        recorderState: recorder.getRecorderState(),
        chunkCount: recorder.getChunkCount(),
        videoTrackState: streamRef.current?.getVideoTracks()[0]?.readyState,
        streamActive: streamRef.current?.active,
      });

      const file = await recorder.stop();
      recordingStartedRef.current = false;
      recordingStartedAtRef.current = null;
      pendingStopRef.current = false;
      setRecordingElapsedMs(0);

      console.log("[SpotDrop camera] recording finished", {
        fileSize: file.size,
        fileType: file.type,
      });

      if (file.size === 0) {
        resetRecordingUi();
        setError(RECORDING_BROWSER_UNSAVED_MESSAGE);
        return;
      }

      stopCameraStream(streamRef.current);
      streamRef.current = null;
      onCapture(file, "video");
    } catch (caught) {
      console.error("[SpotDrop camera] endRecording failed", caught);
      resetRecordingUi();
      setError(
        caught instanceof Error && caught.message
          ? caught.message
          : RECORDING_BROWSER_UNSAVED_MESSAGE
      );
    } finally {
      setCaptureBusy(false);
    }
  }, [clearRecordingTick, onCapture, resetRecordingUi]);

  const beginRecording = useCallback(() => {
    const stream = streamRef.current;

    if (!stream || recorderRef.current) {
      return;
    }

    if (!isMediaRecorderSupported()) {
      console.error("[SpotDrop camera] MediaRecorder not supported");
      setError("Video recording is not supported in this browser.");
      return;
    }

    const streamError = validateRecordingStream(stream);

    if (streamError) {
      console.error("[SpotDrop camera] Invalid recording stream", streamError);
      setError(streamError);
      return;
    }

    setError(null);
    pendingStopRef.current = false;

    try {
      console.log("[SpotDrop camera] beginRecording (hold)", {
        mediaRecorderSupported: isMediaRecorderSupported(),
        videoTrackState: stream.getVideoTracks()[0]?.readyState,
        streamActive: stream.active,
      });

      const recorder = recordVideoFromStream(stream, CAMERA_MAX_VIDEO_SECONDS, {
        onStart: () => {
          recordingStartedRef.current = true;
          recordingStartedAtRef.current = Date.now();
          setIsRecording(true);
          setRecordingElapsedMs(0);
          setError(null);

          clearRecordingTick();
          recordingTickRef.current = setInterval(() => {
            if (!recordingStartedAtRef.current) {
              return;
            }

            const elapsed = Date.now() - recordingStartedAtRef.current;
            setRecordingElapsedMs(elapsed);

            if (elapsed >= CAMERA_MAX_VIDEO_SECONDS * 1000) {
              void endRecording();
            }
          }, 250);

          if (pendingStopRef.current) {
            void endRecording();
          }
        },
        onChunk: (chunkCount) => {
          console.log("[SpotDrop camera] UI chunk update", { chunkCount });
        },
      });

      recorderRef.current = recorder;
    } catch (caught) {
      console.error("[SpotDrop camera] beginRecording failed", caught);
      resetRecordingUi();
      setError(caught instanceof Error ? caught.message : "Unable to record video.");
    }
  }, [clearRecordingTick, endRecording, resetRecordingUi]);

  const takePhoto = useCallback(async () => {
    const video = videoRef.current;

    if (
      !video ||
      !streamRef.current ||
      isRecording ||
      recorderRef.current ||
      holdRecordingStartedRef.current
    ) {
      return;
    }

    setCaptureBusy(true);
    setError(null);

    try {
      const file = await capturePhotoFromVideo(video);
      stopCameraStream(streamRef.current);
      streamRef.current = null;
      onCapture(file, "image");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to take photo.");
    } finally {
      setCaptureBusy(false);
    }
  }, [isRecording, onCapture]);

  const isShutterDisabled = cameraStarting || captureBusy || !streamRef.current;

  const handleShutterPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();

    if (isShutterDisabled || isRecording) {
      return;
    }

    pointerDownAtRef.current = Date.now();
    holdRecordingStartedRef.current = false;
    clearHoldToRecordTimer();

    try {
      shutterRef.current?.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture may fail on some browsers.
    }

    holdToRecordTimerRef.current = setTimeout(() => {
      holdRecordingStartedRef.current = true;
      beginRecording();
    }, HOLD_THRESHOLD_MS);
  };

  const handleShutterPointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    clearHoldToRecordTimer();

    if (shutterRef.current?.hasPointerCapture(event.pointerId)) {
      try {
        shutterRef.current.releasePointerCapture(event.pointerId);
      } catch {
        // ignore
      }
    }

    const pressDuration = Date.now() - pointerDownAtRef.current;
    const didStartHoldRecording = holdRecordingStartedRef.current;

    if (didStartHoldRecording || recorderRef.current || isRecording) {
      holdRecordingStartedRef.current = false;
      void endRecording();
      return;
    }

    if (pressDuration < HOLD_THRESHOLD_MS + TAP_PHOTO_GRACE_MS) {
      void takePhoto();
    }

    holdRecordingStartedRef.current = false;
  };

  const handleShutterPointerCancel = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    clearHoldToRecordTimer();

    if (shutterRef.current?.hasPointerCapture(event.pointerId)) {
      try {
        shutterRef.current.releasePointerCapture(event.pointerId);
      } catch {
        // ignore
      }
    }

    if (holdRecordingStartedRef.current || recorderRef.current || isRecording) {
      holdRecordingStartedRef.current = false;
      void endRecording();
      return;
    }

    holdRecordingStartedRef.current = false;
  };

  const handleToggleHd = () => {
    if (cameraStarting || captureBusy || isRecording) {
      return;
    }

    const next = !hdEnabled;
    setHdEnabled(next);
    void startCamera(facingMode, next);
  };

  const handleSwitchCamera = async () => {
    console.log("BUTTON_CLICKED: switch_camera");

    if (isRecording) {
      return;
    }

    const nextFacing: CameraFacingMode = facingMode === "user" ? "environment" : "user";
    setFacingMode(nextFacing);
    setTorchOn(false);
    await startCamera(nextFacing);
  };

  const handleToggleTorch = async () => {
    const stream = streamRef.current;

    if (!stream) {
      return;
    }

    const next = !torchOn;
    const applied = await setTorchEnabled(stream, next);
    setTorchOn(applied && next);
  };

  const handleClose = () => {
    console.log("BUTTON_CLICKED: close");
    clearHoldToRecordTimer();

    if (isRecording || recorderRef.current) {
      recorderRef.current?.cancel();
      resetRecordingUi();
    }

    stopCameraStream(streamRef.current);
    streamRef.current = null;
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[130] flex min-h-[100dvh] flex-col bg-background text-white select-none touch-manipulation [-webkit-user-select:none] [-webkit-touch-callout:none]"
      style={{ WebkitUserSelect: "none", userSelect: "none", WebkitTapHighlightColor: "transparent" }}
    >
      <SpotCameraV2Banner />

      <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
        {cameraError && !streamRef.current ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
            <p className="text-sm text-white/80">
              {cameraError === CAMERA_PERMISSION_MESSAGE
                ? CAMERA_PERMISSION_MESSAGE
                : cameraError}
            </p>
            <button
              type="button"
              onClick={() => {
                console.log("BUTTON_CLICKED: enable_camera");
                void startCamera();
              }}
              className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black"
            >
              Enable camera
            </button>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              disablePictureInPicture
              preload="auto"
              className={`pointer-events-none absolute inset-0 h-full w-full max-h-full max-w-full object-cover object-center ${
                facingMode === "user" ? "scale-x-[-1]" : ""
              }`}
            />
            {cameraStarting ? (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60">
                <Loader2 className="h-9 w-9 animate-spin text-white" aria-hidden />
                <p className="text-sm font-medium text-white/80">Preparing camera…</p>
              </div>
            ) : null}
          </>
        )}

        {isRecording ? (
          <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-red-600 px-3 py-1.5">
            <span className="h-2 w-2 animate-pulse rounded-full bg-white" aria-hidden />
            <span className="text-xs font-semibold tabular-nums tracking-wide">
              {formatRecordingSeconds(recordingElapsedMs)}
            </span>
          </div>
        ) : null}

        <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-between px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <button
            type="button"
            onClick={handleClose}
            className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white"
            aria-label="Close"
          >
            <X className="h-7 w-7" strokeWidth={1.75} aria-hidden />
          </button>

          <div className="pointer-events-auto flex items-center gap-2">
            {showHdToggle ? (
              <button
                type="button"
                onClick={handleToggleHd}
                disabled={cameraStarting || captureBusy || isRecording}
                className={`rounded-full px-3 py-1.5 text-xs font-bold tracking-wide disabled:opacity-40 ${
                  hdEnabled ? "bg-white text-black" : "bg-black/50 text-white"
                }`}
                aria-label={hdEnabled ? "HD on" : "HD off"}
                aria-pressed={hdEnabled}
              >
                HD
              </button>
            ) : null}

            {torchSupported ? (
              <button
                type="button"
                onClick={() => void handleToggleTorch()}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white"
                aria-label={torchOn ? "Flash off" : "Flash on"}
              >
                {torchOn ? (
                  <Zap className="h-6 w-6 text-amber-300" aria-hidden />
                ) : (
                  <ZapOff className="h-6 w-6" aria-hidden />
                )}
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => void handleSwitchCamera()}
              disabled={cameraStarting || captureBusy || isRecording}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white disabled:opacity-40"
              aria-label="Switch camera"
            >
              <RotateCcw className="h-6 w-6" strokeWidth={1.75} aria-hidden />
            </button>
          </div>
        </div>
      </div>

      <div className="relative z-30 shrink-0 bg-gradient-to-t from-black via-black/95 to-transparent px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-8">
        {error ? <p className="mb-3 text-center text-sm text-red-300">{error}</p> : null}

        <div className="flex items-center justify-center">
          <button
            ref={shutterRef}
            type="button"
            onPointerDown={handleShutterPointerDown}
            onPointerUp={handleShutterPointerUp}
            onPointerCancel={handleShutterPointerCancel}
            onClick={(event) => event.preventDefault()}
            onContextMenu={(event) => event.preventDefault()}
            disabled={isShutterDisabled}
            className="relative z-30 flex h-[5.25rem] w-[5.25rem] touch-none select-none items-center justify-center disabled:opacity-50"
            style={{ touchAction: "none", WebkitUserSelect: "none", userSelect: "none" }}
            aria-label={isRecording ? "Release to stop recording" : "Tap for photo, hold for video"}
          >
            <span
              className={`absolute inset-0 rounded-full border-[3.5px] transition-colors ${
                isRecording ? "border-red-500" : "border-white"
              }`}
            />
            <span
              className={`rounded-full transition-all duration-150 ${
                isRecording ? "h-9 w-9 bg-red-500" : "h-[3.5rem] w-[3.5rem] bg-white"
              }`}
            />
          </button>
        </div>

        <p className="mt-4 text-center text-xs text-white/55">
          {isRecording
            ? "Release to stop"
            : `Tap photo · hold ${HOLD_THRESHOLD_MS / 1000}s+ for video · up to ${CAMERA_MAX_VIDEO_SECONDS}s`}
        </p>
      </div>
    </div>
  );
}
