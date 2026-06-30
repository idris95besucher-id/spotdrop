"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { ArrowLeft, Image as ImageIcon, Loader2, RotateCcw, X, Zap, ZapOff } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { pickMediaFromGallery } from "@/lib/pickMediaFromGallery";
import {
  CAMERA_MAX_VIDEO_SECONDS,
  capturePhotoFromVideo,
  recordVideoFromStream,
  cameraSupportsTorch,
  setTorchEnabled,
  startCameraStream,
  stopCameraStream,
  type CameraFacingMode,
} from "@/lib/cameraCapture";
import { setImmersiveOverlayActive } from "@/lib/immersiveOverlay";
import { createStory } from "@/lib/stories";
import {
  getStoryMediaType,
  NOT_SIGNED_IN_UPLOAD_MESSAGE,
  readVideoDurationSeconds,
  STORY_MAX_VIDEO_SECONDS,
  uploadStoryMedia,
} from "@/lib/storyMedia";

type StoryCameraFlowProps = {
  userId: string;
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
  overlayClassName?: string;
  initialGalleryFile?: File | null;
};

type Phase = "camera" | "preview";
type CaptureKind = "photo" | "video";

function formatRecordingSeconds(elapsedMs: number) {
  const total = Math.min(Math.floor(elapsedMs / 1000), CAMERA_MAX_VIDEO_SECONDS);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function StoryCameraFlow({
  userId,
  isOpen,
  onClose,
  onCreated,
  overlayClassName = "z-[130]",
  initialGalleryFile = null,
}: StoryCameraFlowProps) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>("camera");
  const [facingMode, setFacingMode] = useState<CameraFacingMode>("environment");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [captureKind, setCaptureKind] = useState<CaptureKind>("photo");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingElapsedMs, setRecordingElapsedMs] = useState(0);
  const [captureBusy, setCaptureBusy] = useState(false);

  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<"image" | "video" | null>(null);

  const [caption, setCaption] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initialGalleryHandledRef = useRef(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<ReturnType<typeof recordVideoFromStream> | null>(null);
  const recordingStartedRef = useRef(false);
  const recordingTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);

  const clearRecordingTick = useCallback(() => {
    if (recordingTickRef.current) {
      clearInterval(recordingTickRef.current);
      recordingTickRef.current = null;
    }
  }, []);

  const resetMedia = useCallback(() => {
    if (mediaPreviewUrl) {
      URL.revokeObjectURL(mediaPreviewUrl);
    }

    setMediaFile(null);
    setMediaPreviewUrl(null);
    setMediaType(null);
  }, [mediaPreviewUrl]);

  const resetAll = useCallback(() => {
    resetMedia();
    setCaption("");
    setError(null);
    setCameraError(null);
    setCaptureKind("photo");
    setIsRecording(false);
    setRecordingElapsedMs(0);
    setCaptureBusy(false);
    recordingStartedRef.current = false;

    clearRecordingTick();
    recorderRef.current?.cancel();
    recorderRef.current = null;
    setTorchOn(false);
    setPhase("camera");
  }, [clearRecordingTick, resetMedia]);

  const handleClose = useCallback(() => {
    stopCameraStream(streamRef.current);
    streamRef.current = null;
    resetAll();
    onClose();
  }, [onClose, resetAll]);

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
      /* autoplay may require gesture */
    }
  }, []);

  const startCamera = useCallback(
    async (nextFacing: CameraFacingMode = facingMode) => {
      setCameraStarting(true);
      setCameraError(null);

      stopCameraStream(streamRef.current);
      streamRef.current = null;

      try {
        const stream = await startCameraStream(nextFacing);
        streamRef.current = stream;
        await attachStreamToVideo(stream);
        setTorchSupported(cameraSupportsTorch(stream));
        setTorchOn(false);
      } catch (caught) {
        setCameraError(
          caught instanceof Error ? caught.message : "Unable to access the camera."
        );
      } finally {
        setCameraStarting(false);
      }
    },
    [attachStreamToVideo, facingMode]
  );

  const goToPreview = useCallback(
    async (file: File, type: "image" | "video") => {
      stopCameraStream(streamRef.current);
      streamRef.current = null;

      if (type === "video") {
        if (file.size < 2048) {
          setError("Recording too short. Try again.");
          setPhase("camera");
          void startCamera();
          return;
        }

        const duration = await readVideoDurationSeconds(file);

        if (duration !== null && duration > STORY_MAX_VIDEO_SECONDS) {
          setError(`Videos must be ${STORY_MAX_VIDEO_SECONDS} seconds or less.`);
          setPhase("camera");
          void startCamera();
          return;
        }
      }

      setMediaPreviewUrl((prev) => {
        if (prev) {
          URL.revokeObjectURL(prev);
        }

        return URL.createObjectURL(file);
      });
      setMediaFile(file);
      setMediaType(type);
      setError(null);
      setPhase("preview");
    },
    [startCamera]
  );

  useEffect(() => {
    if (!isOpen) {
      initialGalleryHandledRef.current = false;
      setImmersiveOverlayActive(false);
      stopCameraStream(streamRef.current);
      streamRef.current = null;
      resetAll();
      return;
    }

    setImmersiveOverlayActive(true);
    document.body.style.overflow = "hidden";

    if (initialGalleryFile && !initialGalleryHandledRef.current) {
      initialGalleryHandledRef.current = true;
      const storyType = getStoryMediaType(initialGalleryFile);

      if (storyType) {
        void goToPreview(initialGalleryFile, storyType);
      }

      return () => {
        setImmersiveOverlayActive(false);
        document.body.style.overflow = "";
        stopCameraStream(streamRef.current);
        streamRef.current = null;
      };
    }

    if (phase === "camera") {
      void startCamera();
    }

    return () => {
      setImmersiveOverlayActive(false);
      document.body.style.overflow = "";
      stopCameraStream(streamRef.current);
      streamRef.current = null;
    };
  }, [goToPreview, initialGalleryFile, isOpen, phase, resetAll, startCamera]);

  const handleRetake = useCallback(() => {
    resetMedia();
    setPhase("camera");
    void startCamera();
  }, [resetMedia, startCamera]);

  const takePhoto = useCallback(async () => {
    const video = videoRef.current;

    if (!video || !streamRef.current) {
      return;
    }

    try {
      const file = await capturePhotoFromVideo(video);
      await goToPreview(file, "image");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to take photo.");
    }
  }, [goToPreview]);

  const endRecording = useCallback(async () => {
    if (!recordingStartedRef.current || !recorderRef.current) {
      return;
    }

    clearRecordingTick();
    setIsRecording(false);
    setCaptureBusy(true);

    try {
      const file = await recorderRef.current.stop();
      recorderRef.current = null;
      recordingStartedRef.current = false;
      recordingStartedAtRef.current = null;
      setRecordingElapsedMs(0);
      await goToPreview(file, "video");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save video.");
      recordingStartedRef.current = false;
      recorderRef.current = null;
      setPhase("camera");
      void startCamera();
    } finally {
      setCaptureBusy(false);
    }
  }, [clearRecordingTick, goToPreview, startCamera]);

  const beginRecording = useCallback(() => {
    const stream = streamRef.current;

    if (!stream || recordingStartedRef.current) {
      return;
    }

    try {
      const recorder = recordVideoFromStream(stream, CAMERA_MAX_VIDEO_SECONDS);
      recorderRef.current = recorder;
      recordingStartedRef.current = true;
      recordingStartedAtRef.current = Date.now();
      setIsRecording(true);
      setRecordingElapsedMs(0);

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
      }, 200);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to record video.");
    }
  }, [clearRecordingTick, endRecording]);

  const handleCaptureKindChange = (kind: CaptureKind) => {
    if (kind === captureKind) {
      return;
    }

    if (isRecording) {
      void endRecording();
    }

    setCaptureKind(kind);
    setError(null);
  };

  const handleShutter = async () => {
    if (cameraStarting || Boolean(cameraError) || captureBusy) {
      return;
    }

    if (captureKind === "photo") {
      setCaptureBusy(true);
      setError(null);

      try {
        await takePhoto();
      } finally {
        setCaptureBusy(false);
      }

      return;
    }

    setError(null);

    if (isRecording) {
      await endRecording();
      return;
    }

    beginRecording();
  };

  const openGalleryPicker = async () => {
    if (galleryPickerDisabled) {
      return;
    }

    setCaptureBusy(true);
    setError(null);

    try {
      const file = await pickMediaFromGallery();

      if (!file) {
        return;
      }

      const storyType = getStoryMediaType(file);

      if (!storyType) {
        setError("Stories support photos and videos only.");
        return;
      }

      await goToPreview(file, storyType);
    } finally {
      setCaptureBusy(false);
    }
  };

  const galleryPickerDisabled = isRecording || captureBusy || cameraStarting || Boolean(cameraError);

  const handleSwitchCamera = async () => {
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

  const handlePublishStory = async () => {
    if (!userId) {
      setError(NOT_SIGNED_IN_UPLOAD_MESSAGE);
      return;
    }

    if (!mediaFile || !mediaType) {
      setError("Capture a photo or video first.");
      return;
    }

    const storyType = getStoryMediaType(mediaFile);

    if (!storyType) {
      setError("Unsupported media type.");
      return;
    }

    setPublishing(true);
    setError(null);

    try {
      const upload = await uploadStoryMedia(userId, mediaFile);
      const result = await createStory({
        userId,
        mediaUrl: upload.mediaUrl,
        mediaType: upload.mediaType,
        caption: caption.trim() || "Story",
        visibility: "public",
        sharedToRoom: false,
        cityId: null,
        placeId: null,
      });

      if (result.error) {
        setError(result.error);
        setPublishing(false);
        return;
      }

      handleClose();
      onCreated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to publish.");
    }

    setPublishing(false);
  };

  if (!isOpen) {
    return null;
  }

  const shutterLabel =
    captureKind === "photo"
      ? "Take photo"
      : isRecording
        ? "Stop recording"
        : "Start recording";

  return (
    <div
      className={`fixed inset-0 flex min-h-[100dvh] flex-col bg-black text-white select-none [-webkit-user-select:none] [-webkit-touch-callout:none] ${overlayClassName}`}
      style={{ WebkitUserSelect: "none", userSelect: "none" }}
    >
      {phase === "camera" ? (
        <>
          <div className="relative min-h-0 flex-1 touch-manipulation overflow-hidden bg-black">
            {cameraError ? (
              <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
                <p className="text-sm text-white/80">{cameraError}</p>
                <button
                  type="button"
                  onClick={() => void startCamera()}
                  className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black"
                >
                  Try again
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
                  className={`absolute inset-0 h-full w-full object-cover [transform:translateZ(0)] ${
                    facingMode === "user" ? "scale-x-[-1]" : ""
                  }`}
                />
                {cameraStarting ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60">
                    <Loader2 className="h-9 w-9 animate-spin text-white" aria-hidden />
                    <p className="text-sm font-medium text-white/80">Starting camera…</p>
                  </div>
                ) : null}
              </>
            )}

            {isRecording ? (
              <div className="absolute left-1/2 top-[max(3.5rem,env(safe-area-inset-top))] z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-red-600/95 px-3 py-1.5 shadow-lg">
                <span className="h-2 w-2 animate-pulse rounded-full bg-white" aria-hidden />
                <span className="text-xs font-semibold tabular-nums tracking-wide">
                  {formatRecordingSeconds(recordingElapsedMs)}
                </span>
              </div>
            ) : null}

            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
              <button
                type="button"
                onClick={handleClose}
                className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full text-white"
                aria-label="Close"
              >
                <X className="h-7 w-7" strokeWidth={1.75} aria-hidden />
              </button>

              {torchSupported ? (
                <button
                  type="button"
                  onClick={() => void handleToggleTorch()}
                  className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full text-white"
                  aria-label={torchOn ? "Flash off" : "Flash on"}
                >
                  {torchOn ? (
                    <Zap className="h-6 w-6 text-amber-300" aria-hidden />
                  ) : (
                    <ZapOff className="h-6 w-6" aria-hidden />
                  )}
                </button>
              ) : (
                <span className="h-11 w-11" aria-hidden />
              )}
            </div>
          </div>

          <div className="relative shrink-0 touch-manipulation bg-gradient-to-t from-black via-black/90 to-transparent px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-6">
            {error ? (
              <p className="mb-3 text-center text-sm text-red-300">{error}</p>
            ) : null}

            <p className="mb-5 text-center text-xs font-bold uppercase tracking-[0.2em] text-white">
              Story
            </p>

            <div className="mb-5 flex items-center justify-center gap-8">
              {(["photo", "video"] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => handleCaptureKindChange(kind)}
                  disabled={isRecording && kind === "photo"}
                  className={`relative pb-1 text-xs font-bold uppercase tracking-[0.2em] transition ${
                    captureKind === kind ? "text-white" : "text-white/45"
                  } disabled:opacity-40`}
                >
                  {kind}
                  {captureKind === kind ? (
                    <span className="absolute inset-x-0 -bottom-0.5 mx-auto h-0.5 w-5 rounded-full bg-white" />
                  ) : null}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between px-2">
              <button
                type="button"
                onClick={() => void openGalleryPicker()}
                disabled={galleryPickerDisabled}
                className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border-2 border-white bg-white/10 disabled:opacity-40"
                aria-label="Open photo library"
              >
                <ImageIcon className="h-5 w-5 text-white" aria-hidden />
              </button>

              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  void handleShutter();
                }}
                onPointerDown={(event) => event.preventDefault()}
                onContextMenu={(event) => event.preventDefault()}
                disabled={Boolean(cameraError) || cameraStarting || captureBusy}
                className="relative flex h-[4.75rem] w-[4.75rem] items-center justify-center disabled:opacity-50"
                aria-label={shutterLabel}
              >
                <span
                  className={`absolute inset-0 rounded-full border-[3px] ${
                    captureKind === "video" && isRecording ? "border-red-500" : "border-white"
                  }`}
                />
                <span
                  className={`rounded-full transition-all ${
                    captureKind === "video" && isRecording
                      ? "h-9 w-9 bg-red-500"
                      : "h-[3.35rem] w-[3.35rem] bg-white"
                  }`}
                />
              </button>

              <button
                type="button"
                onClick={() => void handleSwitchCamera()}
                disabled={cameraStarting || captureBusy || isRecording || Boolean(cameraError)}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/10 text-white disabled:opacity-40"
                aria-label="Switch camera"
              >
                <RotateCcw className="h-6 w-6" strokeWidth={1.75} aria-hidden />
              </button>
            </div>

            {captureKind === "video" ? (
              <p className="mt-3 text-center text-xs text-white/50">
                {isRecording
                  ? `Tap to stop · ${formatRecordingSeconds(recordingElapsedMs)}`
                  : `Tap to record · up to ${STORY_MAX_VIDEO_SECONDS}s`}
              </p>
            ) : (
              <p className="mt-3 text-center text-xs text-white/45">Visible for 24 hours</p>
            )}
          </div>
        </>
      ) : phase === "preview" && mediaPreviewUrl && mediaType ? (
        <>
          {publishing ? (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/85 px-6">
              <Loader2 className="h-9 w-9 animate-spin text-white" aria-hidden />
              <p className="text-sm font-medium text-white">Sharing story…</p>
            </div>
          ) : null}

          <header className="flex shrink-0 items-center justify-between px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <button
              type="button"
              onClick={handleRetake}
              disabled={publishing}
              className="rounded-full p-2.5 text-white hover:bg-white/10 disabled:opacity-50"
              aria-label={t("spotEditor.retake")}
            >
              <ArrowLeft className="h-6 w-6" strokeWidth={1.75} aria-hidden />
            </button>
            <p className="text-sm font-semibold text-white">Story</p>
            <button
              type="button"
              onClick={handleClose}
              disabled={publishing}
              className="rounded-full p-2.5 text-white hover:bg-white/10 disabled:opacity-50"
              aria-label="Close"
            >
              <X className="h-6 w-6" strokeWidth={1.75} aria-hidden />
            </button>
          </header>

          <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
            {mediaType === "image" ? (
              <img src={mediaPreviewUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <video
                key={mediaPreviewUrl}
                src={mediaPreviewUrl}
                className="h-full w-full object-cover"
                autoPlay
                playsInline
                muted
                loop
                preload="auto"
              />
            )}
          </div>

          <div className="shrink-0 space-y-3 border-t border-white/10 bg-black px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <p className="text-center text-xs text-white/45">Your story disappears after 24 hours</p>

            <textarea
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              placeholder="Add a caption…"
              rows={2}
              disabled={publishing}
              className="w-full resize-none rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
            />

            {error ? (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {error}
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => void handlePublishStory()}
              disabled={publishing}
              className="w-full rounded-xl bg-white py-3.5 text-sm font-semibold text-black disabled:opacity-40"
            >
              Share to story
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
