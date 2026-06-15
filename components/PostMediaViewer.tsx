"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Pause, Play, Volume2, VolumeX } from "lucide-react";

type PostMediaViewerProps = {
  mediaUrl: string;
  mediaType: "image" | "video";
  alt?: string;
};

function formatVideoTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }

  const wholeSeconds = Math.floor(seconds);
  const minutes = Math.floor(wholeSeconds / 60);
  const remainder = wholeSeconds % 60;

  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export default function PostMediaViewer({ mediaUrl, mediaType, alt = "" }: PostMediaViewerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isBuffering, setIsBuffering] = useState(true);

  useEffect(() => {
    const video = videoRef.current;

    if (!video || mediaType !== "video") {
      return;
    }

    video.muted = isMuted;
  }, [isMuted, mediaType]);

  const togglePlay = async () => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    if (video.paused) {
      try {
        await video.play();
        setIsPlaying(true);
      } catch {
        setIsPlaying(false);
      }
      return;
    }

    video.pause();
    setIsPlaying(false);
  };

  const toggleMute = () => {
    setIsMuted((current) => !current);
  };

  const handleSeek = (value: number) => {
    const video = videoRef.current;

    if (!video || !Number.isFinite(duration) || duration <= 0) {
      return;
    }

    const nextTime = (value / 100) * duration;
    video.currentTime = nextTime;
    setProgress(value);
  };

  if (mediaType === "image") {
    return (
      <div className="flex h-full w-full items-center justify-center bg-black">
        <img src={mediaUrl} alt={alt} className="max-h-full max-w-full object-contain" />
      </div>
    );
  }

  return (
    <div className="relative flex h-full w-full items-center justify-center bg-black">
      <video
        ref={videoRef}
        src={mediaUrl}
        playsInline
        loop
        muted={isMuted}
        preload="metadata"
        className="max-h-full max-w-full object-contain"
        onClick={() => void togglePlay()}
        onLoadedMetadata={(event) => {
          const video = event.currentTarget;
          setDuration(video.duration || 0);
          setIsBuffering(false);
        }}
        onWaiting={() => setIsBuffering(true)}
        onCanPlay={() => setIsBuffering(false)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={(event) => {
          const video = event.currentTarget;
          const total = video.duration || 0;

          if (total > 0) {
            setProgress((video.currentTime / total) * 100);
          }
        }}
      />

      {isBuffering ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-white/80" aria-hidden />
        </div>
      ) : null}

      {!isPlaying ? (
        <button
          type="button"
          onClick={() => void togglePlay()}
          className="absolute inset-0 flex items-center justify-center"
          aria-label="Play video"
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm">
            <Play className="ml-1 h-8 w-8 fill-current" aria-hidden />
          </span>
        </button>
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent px-4 pb-4 pt-10">
        <div className="pointer-events-auto flex items-center gap-3">
          <button
            type="button"
            onClick={() => void togglePlay()}
            className="rounded-full p-2 text-white transition hover:bg-white/10"
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <Pause className="h-5 w-5" aria-hidden /> : <Play className="h-5 w-5 fill-current" aria-hidden />}
          </button>

          <button
            type="button"
            onClick={toggleMute}
            className="rounded-full p-2 text-white transition hover:bg-white/10"
            aria-label={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? <VolumeX className="h-5 w-5" aria-hidden /> : <Volume2 className="h-5 w-5" aria-hidden />}
          </button>

          <div className="flex min-w-0 flex-1 items-center gap-2">
            <input
              type="range"
              min={0}
              max={100}
              step={0.1}
              value={progress}
              onChange={(event) => handleSeek(Number(event.target.value))}
              className="h-1 w-full cursor-pointer appearance-none rounded-full bg-white/25 accent-white"
              aria-label="Video progress"
            />
            <span className="shrink-0 text-[11px] tabular-nums text-white/80">
              {formatVideoTime((progress / 100) * duration)} / {formatVideoTime(duration)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
