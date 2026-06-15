"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import {
  captureVideoFrameBlob,
  coverBlobToFile,
  generateVideoCoverFileFromUrl,
} from "@/lib/videoCover";
import {
  generateFilmstripFrames,
  revokeFilmstripFrames,
  type FilmstripFrame,
} from "@/lib/videoFilmstrip";

type VideoCoverPickerProps = {
  videoUrl: string;
  onConfirm: (coverFile: File, previewUrl: string) => void;
  onBack: () => void;
};

const FILMSTRIP_FRAME_COUNT = 12;
const TOAST_DURATION_MS = 3200;

function formatTime(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

export default function VideoCoverPicker({ videoUrl, onConfirm, onBack }: VideoCoverPickerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const filmstripFramesRef = useRef<FilmstripFrame[]>([]);
  const scrubbingRef = useRef(false);
  const previewReadyRef = useRef(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [duration, setDuration] = useState(0);
  const [coverTime, setCoverTime] = useState(0);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [filmstripFrames, setFilmstripFrames] = useState<FilmstripFrame[]>([]);
  const [filmstripLoading, setFilmstripLoading] = useState(true);
  const [framePreviewUrl, setFramePreviewUrl] = useState<string | null>(null);
  const [continuing, setContinuing] = useState(false);
  const [useAutoCover, setUseAutoCover] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const showToast = useCallback((message: string) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }

    setToastMessage(message);

    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, TOAST_DURATION_MS);
  }, []);

  const revokeFramePreview = useCallback((url: string | null) => {
    if (url?.startsWith("blob:")) {
      URL.revokeObjectURL(url);
    }
  }, []);

  const updateFramePreview = useCallback(
    async (time: number) => {
      const video = videoRef.current;

      if (!video || !videoLoaded) {
        return;
      }

      try {
        const blob = await captureVideoFrameBlob(video, time);
        const objectUrl = URL.createObjectURL(blob);
        setFramePreviewUrl((current) => {
          revokeFramePreview(current);
          return objectUrl;
        });
      } catch {
        // Live video element remains the primary preview.
      }
    },
    [revokeFramePreview, videoLoaded]
  );

  const syncVideoToTime = useCallback((time: number) => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    const safeTime = Math.max(0, Math.min(time, Math.max(duration - 0.01, 0)));
    setCoverTime(safeTime);

    try {
      if (Math.abs(video.currentTime - safeTime) > 0.02) {
        video.currentTime = safeTime;
      }
    } catch {
      // Seek can fail while metadata is still loading.
    }
  }, [duration]);

  const preparePreviewVideo = useCallback(async () => {
    const video = videoRef.current;

    if (!video || previewReadyRef.current) {
      return;
    }

    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth === 0) {
      return;
    }

    previewReadyRef.current = true;

    const nextDuration = Number.isFinite(video.duration) ? video.duration : 0;
    setDuration(nextDuration);
    setVideoLoaded(true);
    setError(null);

    try {
      video.currentTime = 0.01;
      await video.play();
      video.pause();
    } catch {
      // Autoplay may be blocked; seek still paints the first frame on most devices.
    }

    if (!scrubbingRef.current) {
      syncVideoToTime(0.01);
    }

    void updateFramePreview(0.01);
  }, [syncVideoToTime, updateFramePreview]);

  const handleVideoError = useCallback(async () => {
    setVideoLoaded(false);
    setUseAutoCover(true);
    showToast("Using automatic cover");

    try {
      const file = await generateVideoCoverFileFromUrl(videoUrl, 1);
      const preview = URL.createObjectURL(file);
      setFramePreviewUrl((current) => {
        revokeFramePreview(current);
        return preview;
      });
    } catch {
      setError("Unable to load this video for cover selection.");
    }
  }, [revokeFramePreview, showToast, videoUrl]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";

      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }

      revokeFilmstripFrames(filmstripFramesRef.current);
      filmstripFramesRef.current = [];
    };
  }, []);

  useEffect(() => {
    previewReadyRef.current = false;
    setVideoLoaded(false);
    setDuration(0);
    setCoverTime(0);
    setUseAutoCover(false);
    setError(null);

    return () => {
      setFramePreviewUrl((current) => {
        revokeFramePreview(current);
        return null;
      });
    };
  }, [revokeFramePreview, videoUrl]);

  useEffect(() => {
    let cancelled = false;
    setFilmstripLoading(true);
    revokeFilmstripFrames(filmstripFramesRef.current);
    filmstripFramesRef.current = [];

    void generateFilmstripFrames(videoUrl, FILMSTRIP_FRAME_COUNT)
      .then((frames) => {
        if (cancelled) {
          revokeFilmstripFrames(frames);
          return;
        }

        filmstripFramesRef.current = frames;
        setFilmstripFrames(frames);
      })
      .catch(() => {
        if (!cancelled) {
          showToast("Using automatic cover");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setFilmstripLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [showToast, videoUrl]);

  useEffect(() => {
    return () => {
      revokeFramePreview(framePreviewUrl);
    };
  }, [framePreviewUrl, revokeFramePreview]);

  const handleSliderInput = (value: number) => {
    const video = videoRef.current;

    scrubbingRef.current = true;

    if (video) {
      video.pause();
      const safeTime = Math.max(0, Math.min(value, Math.max(duration - 0.01, 0)));
      setCoverTime(safeTime);

      try {
        video.currentTime = safeTime;
      } catch {
        // Ignore seek errors while metadata is loading.
      }
    } else {
      setCoverTime(value);
    }
  };

  const handleSliderCommit = () => {
    scrubbingRef.current = false;
    void updateFramePreview(coverTime);
  };

  const handleFilmstripTap = (time: number) => {
    const video = videoRef.current;

    if (video) {
      video.pause();
    }

    scrubbingRef.current = false;
    syncVideoToTime(time);
    void updateFramePreview(time);
  };

  const handleContinue = async () => {
    setContinuing(true);
    setError(null);

    try {
      if (useAutoCover || !videoRef.current || !videoLoaded) {
        const file = await generateVideoCoverFileFromUrl(videoUrl, coverTime || 1);
        const preview = framePreviewUrl ?? URL.createObjectURL(file);
        onConfirm(file, preview);
        return;
      }

      const video = videoRef.current;
      const blob = await captureVideoFrameBlob(video, coverTime);
      const file = coverBlobToFile(blob);
      const preview = URL.createObjectURL(blob);
      onConfirm(file, preview);
    } catch {
      try {
        showToast("Using automatic cover");
        const file = await generateVideoCoverFileFromUrl(videoUrl, 1);
        const preview = framePreviewUrl ?? URL.createObjectURL(file);
        onConfirm(file, preview);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Unable to save cover frame.");
      }
    } finally {
      setContinuing(false);
    }
  };

  const showLiveVideo = videoLoaded && !useAutoCover;

  return (
    <div className="fixed inset-0 z-[100] flex min-h-[100dvh] flex-col bg-black text-white">
      <header className="flex shrink-0 items-center justify-between px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onBack}
          disabled={continuing}
          className="rounded-full p-2.5 text-white transition hover:bg-white/10 active:scale-95 disabled:opacity-50"
          aria-label="Back"
        >
          <ArrowLeft className="h-6 w-6" strokeWidth={1.75} aria-hidden />
        </button>

        <p className="text-sm font-semibold tracking-wide text-white">Choose cover</p>

        <button
          type="button"
          onClick={() => void handleContinue()}
          disabled={continuing || (!videoLoaded && !useAutoCover)}
          className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90 active:scale-95 disabled:opacity-50"
        >
          {continuing ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            "Continue"
          )}
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
          <div className="relative overflow-hidden rounded-2xl bg-neutral-950 shadow-2xl shadow-black/80">
            <div className="relative aspect-[9/16] max-h-[min(52vh,480px)] w-full bg-neutral-900">
              <video
                ref={videoRef}
                src={videoUrl}
                className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-300 ${
                  showLiveVideo ? "opacity-100" : "opacity-0"
                }`}
                preload="auto"
                playsInline
                muted
                disablePictureInPicture
                controls={false}
                controlsList="nodownload noplaybackrate noremoteplayback"
                onLoadedData={() => void preparePreviewVideo()}
                onCanPlay={() => void preparePreviewVideo()}
                onSeeked={() => {
                  const video = videoRef.current;

                  if (video && scrubbingRef.current) {
                    setCoverTime(video.currentTime);
                  }
                }}
                onError={() => void handleVideoError()}
              />

              {useAutoCover && framePreviewUrl ? (
                <img
                  src={framePreviewUrl}
                  alt=""
                  className="absolute inset-0 h-full w-full object-contain"
                />
              ) : null}

              {!videoLoaded && !useAutoCover ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-neutral-900">
                  <div className="h-[70%] w-[85%] animate-pulse rounded-xl bg-white/10" />
                  <Loader2 className="h-7 w-7 animate-spin text-white/70" aria-hidden />
                  <p className="text-xs text-white/50">Loading video…</p>
                </div>
              ) : null}
            </div>

            {framePreviewUrl && showLiveVideo ? (
              <div className="flex items-center gap-3 border-t border-white/10 bg-black/60 px-3 py-2.5 backdrop-blur-sm">
                <img
                  src={framePreviewUrl}
                  alt=""
                  className="h-12 w-12 shrink-0 rounded-lg object-cover ring-1 ring-white/20"
                />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-white">Selected frame</p>
                  <p className="text-[11px] tabular-nums text-white/50">{formatTime(coverTime)}</p>
                </div>
              </div>
            ) : null}
          </div>

          <p className="mt-3 text-center text-xs text-white/45">Drag the timeline to choose a frame</p>

          <div className="mt-4 space-y-3">
            <div className="min-h-[3.25rem]">
              {filmstripLoading ? (
                <div className="flex gap-1 rounded-lg border border-white/10 bg-white/5 p-1">
                  {Array.from({ length: FILMSTRIP_FRAME_COUNT }).map((_, index) => (
                    <div
                      key={index}
                      className="h-11 flex-1 animate-pulse rounded-sm bg-white/10"
                      style={{ animationDelay: `${index * 60}ms` }}
                    />
                  ))}
                </div>
              ) : filmstripFrames.length > 0 ? (
                <div className="flex gap-0.5 overflow-hidden rounded-lg border border-white/10 bg-white/5 p-0.5">
                  {filmstripFrames.map((frame, index) => {
                    const isActive =
                      Math.abs(coverTime - frame.time) <
                      (duration || 1) / (filmstripFrames.length * 2);

                    return (
                      <button
                        key={`${frame.url}-${index}`}
                        type="button"
                        onClick={() => handleFilmstripTap(frame.time)}
                        className={`relative h-11 flex-1 overflow-hidden rounded-sm transition ${
                          isActive ? "ring-2 ring-white scale-[1.02]" : "opacity-75 hover:opacity-100"
                        }`}
                        aria-label={`Frame at ${formatTime(frame.time)}`}
                      >
                        <img src={frame.url} alt="" className="h-full w-full object-cover" />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-center text-[11px] text-white/40">Frame previews unavailable</p>
              )}
            </div>

            <div className="rounded-2xl bg-white/5 px-4 py-3">
              <div className="mb-2 flex items-center justify-between text-[11px] font-medium tabular-nums text-white/50">
                <span>{formatTime(coverTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={duration || 1}
                step={0.01}
                value={coverTime}
                disabled={!duration || continuing || (!videoLoaded && !useAutoCover)}
                onInput={(event) => handleSliderInput(Number(event.currentTarget.value))}
                onChange={(event) => handleSliderInput(Number(event.currentTarget.value))}
                onPointerUp={handleSliderCommit}
                onTouchEnd={handleSliderCommit}
                className="cover-range h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/20 accent-white"
                aria-label="Choose cover frame"
                style={{
                  background: duration
                    ? `linear-gradient(to right, white 0%, white ${(coverTime / duration) * 100}%, rgba(255,255,255,0.2) ${(coverTime / duration) * 100}%, rgba(255,255,255,0.2) 100%)`
                    : undefined,
                }}
              />
            </div>

            {error ? <p className="text-center text-sm text-red-400">{error}</p> : null}
          </div>
        </div>
      </div>

      {toastMessage ? (
        <div
          className="pointer-events-none fixed bottom-[max(5.5rem,env(safe-area-inset-bottom))] left-1/2 z-[110] -translate-x-1/2"
          role="status"
        >
          <p className="rounded-full bg-white/95 px-4 py-2 text-sm font-medium text-black shadow-lg">
            {toastMessage}
          </p>
        </div>
      ) : null}
    </div>
  );
}
