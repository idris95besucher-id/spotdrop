"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Camera, Loader2, RotateCcw, Video, X, Zap, ZapOff } from "lucide-react";
import { isCapacitorNative } from "@/lib/capacitorUtils";
import {
  CAMERA_MAX_VIDEO_SECONDS,
  CAMERA_PERMISSION_MESSAGE,
  MIC_PERMISSION_MESSAGE,
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
  streamHasAudio,
  requestAudioOnlyStream,
  mergeAudioIntoStream,
  logAudioTrackSettings,
  HOLD_THRESHOLD_MS,
  type CameraFacingMode,
  type VideoRecorderHandle,
} from "@/lib/cameraCapture";

type SpotInstagramCameraProps = {
  onClose: () => void;
  onCapture: (file: File, mediaType: "image" | "video") => void;
};

/**
 * Native camera fallback used when getUserMedia is not available in the
 * Capacitor WKWebView (e.g. first launch before permission is granted, or
 * iOS < 14.3). Uses the standard <input capture> API which opens the native
 * iOS camera / video recorder and returns a File.
 */
function NativeCameraFallback({
  onCapture,
  onClose,
}: {
  onCapture: SpotInstagramCameraProps["onCapture"];
  onClose: () => void;
}) {
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (file) onCapture(file, "image");
    },
    [onCapture]
  );

  const handleVideoChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (file) onCapture(file, "video");
    },
    [onCapture]
  );

  return (
    <div
      className="fixed inset-0 z-[130] flex flex-col bg-black text-white select-none touch-manipulation"
      style={{ WebkitTapHighlightColor: "transparent" }}
    >
      {/* Black safe-area top spacer */}
      <div aria-hidden className="shrink-0 bg-black" style={{ height: "env(safe-area-inset-top)" }} />

      {/* Hidden native inputs */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={handlePhotoChange}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        capture="environment"
        className="sr-only"
        onChange={handleVideoChange}
      />

      {/* Close */}
      <div className="absolute left-0 right-0 z-10 flex items-center px-4 pt-3" style={{ top: "env(safe-area-inset-top)" }}>
        <button
          type="button"
          onClick={onClose}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white"
          aria-label="Close camera"
        >
          <X className="h-7 w-7" strokeWidth={1.75} aria-hidden />
        </button>
      </div>

      {/* Content */}
      <div
        className="flex flex-1 flex-col items-center justify-center gap-10 px-8"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <Camera className="h-16 w-16 text-white/20" strokeWidth={1} aria-hidden />
          <p className="text-lg font-semibold text-white">Create a Spot</p>
          <p className="max-w-xs text-sm leading-relaxed text-white/50">
            Take a photo or record a video using your iPhone camera.
          </p>
        </div>

        <div className="flex w-full max-w-xs flex-col gap-3">
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            className="flex w-full items-center justify-center gap-3 rounded-2xl bg-white py-4 text-[15px] font-semibold text-black transition active:scale-[0.98]"
          >
            <Camera className="h-5 w-5" strokeWidth={2} aria-hidden />
            Take Photo
          </button>
          <button
            type="button"
            onClick={() => videoInputRef.current?.click()}
            className="flex w-full items-center justify-center gap-3 rounded-2xl bg-primary py-4 text-[15px] font-semibold text-[#050816] transition active:scale-[0.98]"
          >
            <Video className="h-5 w-5" strokeWidth={2} aria-hidden />
            Record Video
          </button>
        </div>
      </div>
    </div>
  );
}

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
  const [nativeFallback, setNativeFallback] = useState(false);
  const [micWarning, setMicWarning] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const shutterRef = useRef<HTMLButtonElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<VideoRecorderHandle | null>(null);
  const recordingStartedRef = useRef(false);
  const pendingStopRef = useRef(false);
  const recordingTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);
  const startAttemptedRef = useRef(false);
  const holdToRecordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdRecordingStartedRef = useRef(false);
  const pointerDownAtRef = useRef(0);
  const shutterPressActiveRef = useRef(false);
  const shutterPointerIdRef = useRef<number | null>(null);
  const shutterDocumentListenersRef = useRef<{
    onMove: (event: PointerEvent) => void;
    onEnd: (event: PointerEvent) => void;
  } | null>(null);

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

  const detachShutterDocumentListeners = useCallback(() => {
    const listeners = shutterDocumentListenersRef.current;
    if (!listeners) {
      return;
    }

    document.removeEventListener("pointermove", listeners.onMove);
    document.removeEventListener("pointerup", listeners.onEnd);
    document.removeEventListener("pointercancel", listeners.onEnd);
    shutterDocumentListenersRef.current = null;
  }, []);

  const setZoomIndicatorVisible = useCallback((_visible: boolean) => {
    // Zoom disabled during recording for stable preview — no indicator.
  }, []);

  const clearPreviewZoomTransform = useCallback(() => {
    // Preview uses direct camera feed — no CSS transforms applied.
  }, []);

  const clearRecordingCssZoom = useCallback(() => {
    clearPreviewZoomTransform();
  }, [clearPreviewZoomTransform]);

  const stopZoomLoop = useCallback(() => {
    // No RAF zoom loop — zoom is locked while recording.
  }, []);

  const syncZoomFromTrack = useCallback((stream: MediaStream | null) => {
    const track = stream?.getVideoTracks()[0];
    if (!track) {
      return;
    }

    console.log("[SpotDrop camera] video track ready", track.getSettings());
  }, []);

  const resetRecordingZoom = useCallback(() => {
    stopZoomLoop();
    setZoomIndicatorVisible(false);
    clearRecordingCssZoom();
  }, [clearRecordingCssZoom, setZoomIndicatorVisible, stopZoomLoop]);

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
    async (nextFacing: CameraFacingMode = facingMode) => {
      setCameraStarting(true);
      setCameraError(null);

      stopCameraStream(streamRef.current);
      stopCameraStream(audioStreamRef.current);
      streamRef.current = null;
      audioStreamRef.current = null;

      try {
        // Stable 1080p @ 30fps rear camera — single stream, no 4K on iOS.
        const stream = await startCameraStream(nextFacing, {
          quality: "hd",
          includeAudio: true,
        });
        streamRef.current = stream;
        await attachStreamToVideo(stream);
        syncZoomFromTrack(stream);
        setTorchSupported(cameraSupportsTorch(stream));
        setTorchOn(false);

        if (streamHasAudio(stream)) {
          setMicWarning(null);
          console.log("[SpotDrop camera] combined audio+video stream ready", {
            audioTrackCount: stream.getAudioTracks().length,
            videoSettings: stream.getVideoTracks()[0]?.getSettings(),
          });
        } else {
          // Mic not in combined stream — request a dedicated audio track.
          console.log("[SpotDrop camera] requesting dedicated audio stream…");
          const audioStream = await requestAudioOnlyStream();

          if (audioStream) {
            audioStreamRef.current = audioStream;
            setMicWarning(null);
          } else {
            console.warn("[SpotDrop camera] mic unavailable — video will be recorded without sound");
            setMicWarning(MIC_PERMISSION_MESSAGE);
          }
        }
      } catch (caught) {
        console.error("[SpotDrop camera] startCamera failed", caught);

        // Last resort on Capacitor: native iPhone camera via <input capture>.
        if (isCapacitorNative()) {
          setNativeFallback(true);
          return;
        }

        setCameraError(mapCameraPermissionError(caught));
      } finally {
        setCameraStarting(false);
      }
    },
    [attachStreamToVideo, facingMode, syncZoomFromTrack]
  );

  useEffect(() => {
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
      clearRecordingTick();
      clearHoldToRecordTimer();
      detachShutterDocumentListeners();
      recorderRef.current?.cancel();
      recorderRef.current = null;
      stopZoomLoop();
      stopCameraStream(streamRef.current);
      streamRef.current = null;
      stopCameraStream(audioStreamRef.current);
      audioStreamRef.current = null;
      setMicWarning(null);
    };
  }, [clearHoldToRecordTimer, clearRecordingTick, detachShutterDocumentListeners, stopZoomLoop]);

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
    void resetRecordingZoom();
  }, [clearRecordingTick, resetRecordingZoom]);

  const endRecording = useCallback(async () => {
    if (!recorderRef.current) {
      return;
    }

    if (!recordingStartedRef.current) {
      pendingStopRef.current = true;
      return;
    }

    console.log("[SpotDrop camera] RECORD RELEASE", {
      elapsedMs: Date.now() - (recordingStartedAtRef.current ?? Date.now()),
      chunkCount: recorderRef.current.getChunkCount(),
    });

    const recorder = recorderRef.current;
    recorderRef.current = null;
    clearRecordingTick();
    setIsRecording(false);
    setCaptureBusy(true);
    holdRecordingStartedRef.current = false;

    void resetRecordingZoom();

    try {
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
  }, [clearRecordingTick, onCapture, resetRecordingUi, resetRecordingZoom]);

  const beginRecording = useCallback(() => {
    const videoStream = streamRef.current;

    if (!videoStream || recorderRef.current) {
      return;
    }

    clearPreviewZoomTransform();
    stopZoomLoop();

    if (!isMediaRecorderSupported()) {
      console.error("[SpotDrop camera] MediaRecorder not supported");
      setError("Video recording is not supported in this browser.");
      return;
    }

    const streamError = validateRecordingStream(videoStream);

    if (streamError) {
      console.error("[SpotDrop camera] Invalid recording stream", streamError);
      setError(streamError);
      return;
    }

    setError(null);
    pendingStopRef.current = false;

    // Prefer the combined audio+video stream (same getUserMedia call).
    // Only merge a separate mic stream when the camera stream lacks audio.
    const audioStream = audioStreamRef.current;
    const recordStream =
      streamHasAudio(videoStream)
        ? videoStream
        : audioStream
          ? mergeAudioIntoStream(videoStream, audioStream)
          : videoStream;

    const audioTracks = recordStream.getAudioTracks();
    const hasAudioForRecording = audioTracks.some((t) => t.readyState === "live" && !t.muted);

    console.log("[SpotCamera] audio tracks", audioTracks.map((t) => ({
      readyState: t.readyState,
      muted: t.muted,
      enabled: t.enabled,
      label: t.label,
    })));
    logAudioTrackSettings("before record", recordStream);
    console.log("[SpotCamera] video tracks", recordStream.getVideoTracks().map((t) => ({
      readyState: t.readyState,
      muted: t.muted,
      enabled: t.enabled,
      label: t.label,
    })));

    if (audioTracks.length === 0) {
      setError("Microphone permission is required to record sound. Enable it in Settings → SpotDrop → Microphone.");
      return;
    }

    try {
      console.log("[SpotDrop camera] beginRecording (hold)", {
        mediaRecorderSupported: isMediaRecorderSupported(),
        videoTrackState: videoStream.getVideoTracks()[0]?.readyState,
        streamActive: videoStream.active,
        audioTrackCount: audioTracks.length,
        hasAudioForRecording,
      });

      const recorder = recordVideoFromStream(recordStream, CAMERA_MAX_VIDEO_SECONDS, {
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
  }, [clearPreviewZoomTransform, clearRecordingTick, endRecording, resetRecordingUi, stopZoomLoop]);

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

  const finishShutterPress = useCallback(() => {
    if (!shutterPressActiveRef.current) {
      return;
    }

    shutterPressActiveRef.current = false;
    shutterPointerIdRef.current = null;
    detachShutterDocumentListeners();
    clearHoldToRecordTimer();
    stopZoomLoop();
    setZoomIndicatorVisible(false);

    const pressDuration = Date.now() - pointerDownAtRef.current;
    const recordingActive =
      holdRecordingStartedRef.current ||
      recorderRef.current !== null ||
      recordingStartedRef.current;

    if (recordingActive) {
      holdRecordingStartedRef.current = false;

      if (pressDuration < HOLD_THRESHOLD_MS + TAP_PHOTO_GRACE_MS) {
        console.log("[SpotDrop camera] RECORD RELEASE (quick tap → photo)", { pressDuration });
        recorderRef.current?.cancel();
        resetRecordingUi();
        void takePhoto();
        return;
      }

      void endRecording();
      return;
    }

    if (pressDuration < HOLD_THRESHOLD_MS + TAP_PHOTO_GRACE_MS) {
      void takePhoto();
    }

    holdRecordingStartedRef.current = false;
  }, [clearHoldToRecordTimer, detachShutterDocumentListeners, endRecording, resetRecordingUi, setZoomIndicatorVisible, stopZoomLoop, takePhoto]);

  const handleShutterPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();

    if (isShutterDisabled || isRecording) {
      return;
    }

    pointerDownAtRef.current = Date.now();
    holdRecordingStartedRef.current = false;
    shutterPressActiveRef.current = true;
    shutterPointerIdRef.current = event.pointerId;
    clearHoldToRecordTimer();
    detachShutterDocumentListeners();

    try {
      shutterRef.current?.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture may fail on some browsers.
    }

    const onMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
    };

    const onEnd = (endEvent: PointerEvent) => {
      if (
        shutterPointerIdRef.current !== null &&
        endEvent.pointerId !== shutterPointerIdRef.current
      ) {
        return;
      }

      if (shutterRef.current?.hasPointerCapture(endEvent.pointerId)) {
        try {
          shutterRef.current.releasePointerCapture(endEvent.pointerId);
        } catch {
          // ignore
        }
      }

      finishShutterPress();
    };

    shutterDocumentListenersRef.current = { onMove, onEnd };
    document.addEventListener("pointermove", onMove, { passive: false });
    document.addEventListener("pointerup", onEnd);
    document.addEventListener("pointercancel", onEnd);

    holdRecordingStartedRef.current = true;
    console.log("[SpotDrop camera] RECORD START (pointer down)");
    beginRecording();
  };

  const handleShutterPointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    finishShutterPress();
  };

  const handleShutterPointerCancel = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    finishShutterPress();
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

    detachShutterDocumentListeners();
    stopCameraStream(streamRef.current);
    streamRef.current = null;
    stopCameraStream(audioStreamRef.current);
    audioStreamRef.current = null;
    onClose();
  };

  if (nativeFallback) {
    return <NativeCameraFallback onCapture={onCapture} onClose={onClose} />;
  }

  return (
    <div
      className="fixed inset-0 z-[130] flex min-h-[100dvh] flex-col bg-black text-white select-none touch-manipulation [-webkit-user-select:none] [-webkit-touch-callout:none]"
      style={{ WebkitUserSelect: "none", userSelect: "none", WebkitTapHighlightColor: "transparent" }}
    >
      {/* Black safe-area top spacer — keeps iPhone status bar / Dynamic Island visible above camera */}
      <div aria-hidden className="shrink-0 bg-black" style={{ height: "env(safe-area-inset-top)" }} />

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
            <div className="pointer-events-none absolute inset-0 overflow-hidden bg-black">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                disablePictureInPicture
                preload="auto"
                className={`pointer-events-none absolute inset-0 h-full w-full object-cover object-center ${
                  facingMode === "user" ? "scale-x-[-1]" : ""
                }`}
              />
            </div>
            {cameraStarting ? (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60">
                <Loader2 className="h-9 w-9 animate-spin text-white" aria-hidden />
                <p className="text-sm font-medium text-white/80">Preparing camera…</p>
              </div>
            ) : null}
          </>
        )}

        {isRecording ? (
          <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 flex-col items-center gap-2">
            <div className="flex items-center gap-2 rounded-full bg-red-600 px-3 py-1.5">
              <span className="h-2 w-2 animate-pulse rounded-full bg-white" aria-hidden />
              <span className="text-xs font-semibold tabular-nums tracking-wide">
                {formatRecordingSeconds(recordingElapsedMs)}
              </span>
            </div>
          </div>
        ) : null}

        <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-between px-4 pb-2 pt-3">
          <button
            type="button"
            onClick={handleClose}
            className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white"
            aria-label="Close"
          >
            <X className="h-7 w-7" strokeWidth={1.75} aria-hidden />
          </button>

          <div className="pointer-events-auto flex items-center gap-2">
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
        {!error && micWarning ? (
          <p className="mb-3 text-center text-xs leading-snug text-amber-300">{micWarning}</p>
        ) : null}

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
            ? "Release to stop recording"
            : `Tap photo · hold ${HOLD_THRESHOLD_MS / 1000}s+ for video · up to ${CAMERA_MAX_VIDEO_SECONDS}s`}
        </p>
      </div>
    </div>
  );
}
