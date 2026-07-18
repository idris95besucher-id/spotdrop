"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Camera, ImageIcon, Loader2, RotateCcw, X, Zap, ZapOff } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import { isCapacitorNative } from "@/lib/capacitorUtils";
import {
  capturePhotoFromVideo,
  cameraSupportsTorch,
  setTorchEnabled,
  mapCameraPermissionError,
  startCameraStream,
  stopCameraStream,
  type CameraFacingMode,
} from "@/lib/cameraCapture";
import {
  createSpotCaptureGpsSession,
  freezeCameraSpotLocation,
} from "@/lib/captureDeviceSpotLocation";
import type { SpotGeoLocation } from "@/lib/spotLocation";
import { openSpotDropCamera } from "@/lib/spotDropCamera";

export type SpotCreateCameraMode = "photo" | "video" | "text";

/** Tab order for the web-fallback mode switcher and its swipe gesture. On
 * native builds the same PHOTO | VIDEO | TEXT row is rendered *inside* the
 * unified native camera screen instead — see `openSpotDropCamera`. */
const CREATE_MODE_ORDER: SpotCreateCameraMode[] = ["photo", "video", "text"];

type SpotInstagramCameraProps = {
  onClose: () => void;
  onCapture: (
    file: File,
    mediaType: "image" | "video",
    location: SpotGeoLocation | null,
    /** Native camera video only: `Capacitor.convertFileSrc` path to the file still on disk. */
    nativeWebPath?: string,
    /** Absolute iOS filesystem path — upload streams from disk (no base64). */
    nativeFilePath?: string,
    /** On-disk size from the native recorder (stub File.size is 0). */
    nativeFileSizeBytes?: number
  ) => void;
  showCreateModes?: boolean;
  createMode?: SpotCreateCameraMode;
  onCreateModeChange?: (mode: SpotCreateCameraMode) => void;
  onPickGallery?: () => void;
  galleryDisabled?: boolean;
};

/**
 * Native camera fallback when the unified native camera screen can't be
 * opened (permission denied, plugin unavailable, or a genuine capture
 * failure). Photo capture only, via the system file picker — never opens a
 * video recorder.
 */
function NativeCameraFallback({
  onCapture,
  onClose,
}: {
  onCapture: SpotInstagramCameraProps["onCapture"];
  onClose: () => void;
}) {
  const { t } = useI18n();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const gpsSessionRef = useRef(createSpotCaptureGpsSession());

  useEffect(() => {
    const session = gpsSessionRef.current;
    session.start();

    return () => {
      session.stop();
    };
  }, []);

  const emitCapture = useCallback(
    async (file: File) => {
      let location: SpotGeoLocation | null = null;

      try {
        location = await freezeCameraSpotLocation(gpsSessionRef.current);
      } catch {
        location = null;
      }

      onCapture(file, "image", location);
    },
    [onCapture]
  );

  const handlePhotoChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (file) void emitCapture(file);
    },
    [emitCapture]
  );

  return (
    <div
      className="fixed inset-0 z-[130] flex flex-col bg-black text-white select-none touch-manipulation"
      style={{ WebkitTapHighlightColor: "transparent" }}
    >
      <div aria-hidden className="shrink-0 bg-black" style={{ height: "env(safe-area-inset-top)" }} />

      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={handlePhotoChange}
      />

      <div
        className="absolute left-0 right-0 z-10 flex items-center px-4 pt-3"
        style={{ top: "env(safe-area-inset-top)" }}
      >
        <button
          type="button"
          onClick={onClose}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white"
          aria-label={t("spotCamera.close")}
        >
          <X className="h-7 w-7" strokeWidth={1.75} aria-hidden />
        </button>
      </div>

      <div
        className="flex flex-1 flex-col items-center justify-center gap-10 px-8"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <Camera className="h-16 w-16 text-white/20" strokeWidth={1} aria-hidden />
          <p className="text-lg font-semibold text-white">{t("spotCamera.createTitle")}</p>
          <p className="max-w-xs text-sm leading-relaxed text-white/50">
            {t("spotCamera.createPhotoOnlyBody")}
          </p>
        </div>

        <button
          type="button"
          onClick={() => photoInputRef.current?.click()}
          className="flex w-full max-w-xs items-center justify-center gap-3 rounded-2xl bg-white py-4 text-[15px] font-semibold text-black transition active:scale-[0.98]"
        >
          <Camera className="h-5 w-5" strokeWidth={2} aria-hidden />
          {t("spotCamera.takePhoto")}
        </button>
      </div>
    </div>
  );
}

export default function SpotInstagramCamera({
  onClose,
  onCapture,
  showCreateModes = false,
  createMode = "photo",
  onCreateModeChange,
  onPickGallery,
  galleryDisabled = false,
}: SpotInstagramCameraProps) {
  const { t } = useI18n();
  const native = isCapacitorNative();

  const [facingMode, setFacingMode] = useState<CameraFacingMode>("environment");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraStarting, setCameraStarting] = useState(true);
  const [cameraReady, setCameraReady] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nativeFallback, setNativeFallback] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const shutterRef = useRef<HTMLButtonElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startAttemptedRef = useRef(false);
  const nativeOpenAttemptedRef = useRef(false);
  const shutterPressActiveRef = useRef(false);
  const shutterPointerIdRef = useRef<number | null>(null);
  const shutterDocumentListenersRef = useRef<{
    onMove: (event: PointerEvent) => void;
    onEnd: (event: PointerEvent) => void;
  } | null>(null);
  const gpsSessionRef = useRef(createSpotCaptureGpsSession());
  const frozenCaptureLocationRef = useRef<SpotGeoLocation | null>(null);

  const detachShutterDocumentListeners = useCallback(() => {
    const listeners = shutterDocumentListenersRef.current;

    if (!listeners) {
      return;
    }

    document.removeEventListener("pointermove", listeners.onMove, true);
    document.removeEventListener("pointerup", listeners.onEnd, true);
    document.removeEventListener("pointercancel", listeners.onEnd, true);
    shutterDocumentListenersRef.current = null;
  }, []);

  const attachStreamToVideo = useCallback(async (stream: MediaStream) => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

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
      setCameraReady(false);

      stopCameraStream(streamRef.current);
      streamRef.current = null;

      try {
        // Photo preview only — never request microphone / audio tracks.
        const stream = await startCameraStream(nextFacing, {
          quality: "hd",
          includeAudio: false,
        });
        streamRef.current = stream;
        await attachStreamToVideo(stream);
        setTorchSupported(cameraSupportsTorch(stream));
        setTorchOn(false);
        setCameraReady(true);
      } catch (caught) {
        console.error("[SpotDrop camera] startCamera failed", caught);
        setCameraError(mapCameraPermissionError(caught));
        setCameraReady(false);
      } finally {
        setCameraStarting(false);
      }
    },
    [attachStreamToVideo, facingMode]
  );

  // Shared GPS freeze session — used by both the native and web capture paths.
  useEffect(() => {
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    const gpsSession = gpsSessionRef.current;
    gpsSession.start();
    frozenCaptureLocationRef.current = null;

    return () => {
      gpsSession.stop();
      frozenCaptureLocationRef.current = null;
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
      detachShutterDocumentListeners();
      stopCameraStream(streamRef.current);
      streamRef.current = null;
    };
  }, [detachShutterDocumentListeners]);

  const freezeLocation = useCallback(async () => {
    let location: SpotGeoLocation | null = frozenCaptureLocationRef.current;

    try {
      location = await freezeCameraSpotLocation(gpsSessionRef.current);
      frozenCaptureLocationRef.current = location;
    } catch {
      // Keep prior freeze if any.
    }

    return location;
  }, []);

  // --- Native path -----------------------------------------------------
  //
  // On a native build this is the *only* camera surface: one native
  // AVCaptureSession, opened once, handling PHOTO and VIDEO internally.
  // `getUserMedia` is never started here — there is deliberately no native
  // controller presented on top of a web preview.
  useEffect(() => {
    if (!native || nativeOpenAttemptedRef.current) {
      return;
    }

    nativeOpenAttemptedRef.current = true;
    let cancelled = false;

    void (async () => {
      try {
        const outcome = await openSpotDropCamera({
          photoOnly: !showCreateModes,
          initialMode: createMode === "video" ? "video" : "photo",
        });

        if (cancelled) {
          return;
        }

        if (outcome.kind === "text") {
          onCreateModeChange?.("text");
          return;
        }

        const location = await freezeLocation();
        if (cancelled) {
          return;
        }

        if (outcome.kind === "photo") {
          onCapture(outcome.file, "image", location);
        } else {
          onCapture(
            outcome.file,
            "video",
            location,
            outcome.webPath,
            outcome.nativePath,
            outcome.sizeBytes
          );
        }
      } catch (caught) {
        if (cancelled) {
          return;
        }

        const code = (caught as { code?: string } | undefined)?.code;
        const message = caught instanceof Error ? caught.message : "";
        const wasCancelled = code === "USER_CANCELLED" || message.toLowerCase().includes("cancel");

        if (wasCancelled) {
          onClose();
          return;
        }

        console.error("[SpotDrop camera] openSpotDropCamera failed", caught);
        setNativeFallback(true);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Intentionally mount-once: the native screen owns PHOTO ⇄ VIDEO
    // switching internally, so nothing here should re-trigger a re-open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [native]);

  // --- Web fallback path -------------------------------------------------

  useLayoutEffect(() => {
    if (native || startAttemptedRef.current) {
      return;
    }

    startAttemptedRef.current = true;
    void startCamera("environment");
  }, [native, startCamera]);

  useEffect(() => {
    if (!cameraReady) {
      return;
    }

    const stream = streamRef.current;

    if (!stream) {
      return;
    }

    void attachStreamToVideo(stream);
  }, [attachStreamToVideo, cameraReady]);

  const takePhoto = useCallback(async () => {
    const video = videoRef.current;

    if (!video || !streamRef.current || captureBusy) {
      return;
    }

    setCaptureBusy(true);
    setError(null);

    try {
      const location = await freezeLocation();
      const file = await capturePhotoFromVideo(video);
      stopCameraStream(streamRef.current);
      streamRef.current = null;
      onCapture(file, "image", location);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("spotCamera.error.photoFailed"));
    } finally {
      setCaptureBusy(false);
    }
  }, [captureBusy, freezeLocation, onCapture, t]);

  const isShutterDisabled =
    cameraStarting || captureBusy || createMode === "video" || !cameraReady;

  const finishShutterPress = useCallback(() => {
    if (!shutterPressActiveRef.current) {
      return;
    }

    shutterPressActiveRef.current = false;
    shutterPointerIdRef.current = null;
    detachShutterDocumentListeners();
    void takePhoto();
  }, [detachShutterDocumentListeners, takePhoto]);

  const handleShutterPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();

    if (isShutterDisabled) {
      return;
    }

    shutterPressActiveRef.current = true;
    shutterPointerIdRef.current = event.pointerId;
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
    document.addEventListener("pointermove", onMove, { passive: false, capture: true });
    document.addEventListener("pointerup", onEnd, { capture: true });
    document.addEventListener("pointercancel", onEnd, { capture: true });
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
    if (captureBusy) {
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
    detachShutterDocumentListeners();
    stopCameraStream(streamRef.current);
    streamRef.current = null;
    onClose();
  };

  if (nativeFallback) {
    return <NativeCameraFallback onCapture={onCapture} onClose={onClose} />;
  }

  if (native) {
    // The native camera screen is presented full-screen over the app; this
    // component has nothing of its own to show while that's open besides a
    // plain black backdrop (avoids a white flash during the modal's
    // present/dismiss animation).
    return <div className="fixed inset-0 z-[130] bg-black" aria-hidden />;
  }

  const localizedError = localizeUserMessage(t, error);
  const localizedCameraError = localizeUserMessage(t, cameraError);

  return (
    <div
      className="fixed inset-0 z-[130] flex min-h-[100dvh] flex-col bg-black text-white select-none touch-manipulation [-webkit-user-select:none] [-webkit-touch-callout:none]"
      style={{ WebkitUserSelect: "none", userSelect: "none", WebkitTapHighlightColor: "transparent" }}
    >
      <div aria-hidden className="shrink-0 bg-black" style={{ height: "env(safe-area-inset-top)" }} />

      <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
        {cameraError && !cameraReady ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
            <p className="text-sm text-white/80">
              {localizedCameraError ?? t("spotCamera.error.cameraRequired")}
            </p>
            <button
              type="button"
              onClick={() => void startCamera()}
              className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black"
            >
              {t("spotCamera.enableCamera")}
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
                <p className="text-sm font-medium text-white/80">{t("spotCamera.preparing")}</p>
              </div>
            ) : null}
          </>
        )}

        <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-between px-4 pb-2 pt-3">
          <button
            type="button"
            onClick={handleClose}
            className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white"
            aria-label={t("spotCamera.closeAria")}
          >
            <X className="h-7 w-7" strokeWidth={1.75} aria-hidden />
          </button>

          <div className="pointer-events-auto flex items-center gap-2">
            {torchSupported ? (
              <button
                type="button"
                onClick={() => void handleToggleTorch()}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white disabled:opacity-40"
                aria-label={torchOn ? t("spotCamera.flashOff") : t("spotCamera.flashOn")}
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
              disabled={cameraStarting || captureBusy}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white disabled:opacity-40"
              aria-label={t("spotCamera.switchCamera")}
            >
              <RotateCcw className="h-6 w-6" strokeWidth={1.75} aria-hidden />
            </button>
          </div>
        </div>
      </div>

      <div
        className="relative z-30 shrink-0 bg-gradient-to-t from-black via-black/95 to-transparent px-4 pt-8"
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1.75rem)",
        }}
        onTouchStart={(event) => {
          if (!showCreateModes) {
            return;
          }

          (event.currentTarget as HTMLElement).dataset.swipeX = String(
            event.changedTouches[0]?.clientX ?? 0
          );
        }}
        onTouchEnd={(event) => {
          if (!showCreateModes || !onCreateModeChange) {
            return;
          }

          const startX = Number((event.currentTarget as HTMLElement).dataset.swipeX ?? NaN);
          const endX = event.changedTouches[0]?.clientX ?? startX;

          if (!Number.isFinite(startX)) {
            return;
          }

          const delta = endX - startX;
          const currentIndex = CREATE_MODE_ORDER.indexOf(createMode);

          if (currentIndex === -1) {
            return;
          }

          if (delta < -70 && currentIndex < CREATE_MODE_ORDER.length - 1) {
            onCreateModeChange(CREATE_MODE_ORDER[currentIndex + 1]!);
          } else if (delta > 70 && currentIndex > 0) {
            onCreateModeChange(CREATE_MODE_ORDER[currentIndex - 1]!);
          }
        }}
      >
        {localizedError ? <p className="mb-3 text-center text-sm text-red-300">{localizedError}</p> : null}

        {showCreateModes ? (
          <div className="mb-5 flex items-center justify-center gap-6 overflow-x-auto px-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {(
              [
                { id: "photo" as const, label: "PHOTO" },
                { id: "video" as const, label: "VIDEO" },
                { id: "text" as const, label: "TEXT" },
              ] as const
            ).map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => onCreateModeChange?.(mode.id)}
                className={`relative shrink-0 pb-1.5 text-[11px] font-bold uppercase tracking-[0.22em] transition ${
                  createMode === mode.id ? "text-white" : "text-white/45"
                }`}
              >
                {mode.label}
                {createMode === mode.id ? (
                  <span className="absolute inset-x-0 -bottom-0.5 mx-auto h-0.5 w-5 rounded-full bg-white" />
                ) : null}
              </button>
            ))}
          </div>
        ) : null}

        {createMode === "video" ? (
          <div className="mb-4">
            <p className="text-center text-xs text-white/70">{t("spotCamera.videoWebOnly")}</p>
          </div>
        ) : null}

        <div className="flex items-center justify-between px-3">
          {onPickGallery && createMode !== "video" ? (
            <button
              type="button"
              onClick={() => onPickGallery()}
              disabled={galleryDisabled || captureBusy || cameraStarting}
              className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[0.875rem] border-2 border-white/90 bg-white/10 transition active:scale-95 disabled:opacity-40"
              aria-label={t("spotLocationCard.optionChoosePhoto")}
            >
              <ImageIcon className="h-5 w-5 text-white" aria-hidden />
            </button>
          ) : (
            <span className="h-12 w-12" aria-hidden />
          )}

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
            aria-label={t("spotCamera.shutterAriaPhotoOnly")}
          >
            <span className="absolute inset-0 rounded-full border-[3.5px] border-white" />
            <span className="h-[3.5rem] w-[3.5rem] rounded-full bg-white" />
          </button>

          <span className="h-12 w-12" aria-hidden />
        </div>

        <p className="mt-5 text-center text-[11px] leading-snug text-white/55">
          {t("spotCamera.hintPhotoOnly")}
        </p>
      </div>
    </div>
  );
}
