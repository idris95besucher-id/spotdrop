"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { playExclusively, releaseIfCurrent } from "@/lib/voiceMessages/audioPlaybackManager";

const SPEED_STEPS = [1, 1.5, 2, 0.5] as const;
const DEFAULT_WAVEFORM_BARS = 28;

type VoiceMessagePlayerProps = {
  audioUrl: string;
  durationSeconds: number | null;
  waveform: number[] | null;
  isOwnMessage: boolean;
};

function formatTime(seconds: number) {
  const safe = Number.isFinite(seconds) && seconds >= 0 ? seconds : 0;
  const minutes = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

export default function VoiceMessagePlayer({
  audioUrl,
  durationSeconds,
  waveform,
  isOwnMessage,
}: VoiceMessagePlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const totalDurationRef = useRef(durationSeconds ?? 0);
  const rafIdRef = useRef<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [knownDuration, setKnownDuration] = useState(durationSeconds ?? 0);
  const [speedIndex, setSpeedIndex] = useState(0);

  // Fixed bar count regardless of how many amplitude samples were captured — bars are laid
  // out with flex-1/min-w-0 below, so however many there are, they always exactly divide the
  // track's real rendered width. This is what "shrink to fit" means here: the bar *count* is
  // stable (no layout jump), the bar *width* is whatever the container has room for.
  const bars = useMemo(
    () => (waveform && waveform.length > 0 ? waveform : Array.from({ length: DEFAULT_WAVEFORM_BARS }, () => 0.4)),
    [waveform]
  );

  useEffect(() => {
    return () => {
      const audio = audioRef.current;
      if (audio) {
        releaseIfCurrent(audio);
      }
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, []);

  // Drives the waveform highlight. `timeupdate` alone fires too coarsely/unevenly across
  // browsers (as few as ~4 times/sec) to move one bar at a time — with ~28 bars, that reads
  // as several bars jumping blue at once instead of a smooth sweep. Polling the real
  // `audio.currentTime` every animation frame while playing gives a continuous, per-bar
  // progression regardless of how often the browser itself fires `timeupdate`.
  useEffect(() => {
    if (!isPlaying) {
      return;
    }

    const tick = () => {
      const audio = audioRef.current;
      if (audio) {
        setCurrentTime(audio.currentTime);
      }
      rafIdRef.current = requestAnimationFrame(tick);
    };

    rafIdRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [isPlaying]);

  const ensureAudio = () => {
    if (audioRef.current) {
      return audioRef.current;
    }

    const audio = new Audio(audioUrl);
    audio.preload = "metadata";
    audio.playbackRate = SPEED_STEPS[speedIndex] ?? 1;

    // Belt-and-suspenders alongside the rAF loop above (e.g. covers the moment right after a
    // seek, or a frame before the rAF loop has kicked in) — cheap, and rAF is the one driving
    // the smooth per-bar sweep during actual playback.
    audio.addEventListener("timeupdate", () => {
      setCurrentTime(audio.currentTime);
    });
    // MediaRecorder output (webm/opus especially) often has no finalized duration in its
    // container — `loadedmetadata` fires with `duration: Infinity`/NaN, and the browser only
    // fixes it up later via `durationchange` once it has scanned enough of the file. Listening
    // to both means the progress bar/time label pick up the *real* file length as soon as the
    // browser knows it, instead of being stuck on the stored (wall-clock-estimated) duration —
    // note this never affects when playback actually stops; that's `ended`, below, untouched.
    const onDurationResolved = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        totalDurationRef.current = audio.duration;
        setKnownDuration(audio.duration);
      }
    };
    audio.addEventListener("loadedmetadata", onDurationResolved);
    audio.addEventListener("durationchange", onDurationResolved);
    audio.addEventListener("play", () => setIsPlaying(true));
    audio.addEventListener("pause", () => {
      setIsPlaying(false);
      releaseIfCurrent(audio);
    });
    audio.addEventListener("ended", () => {
      setIsPlaying(false);
      setCurrentTime(0);
      releaseIfCurrent(audio);
    });

    audioRef.current = audio;
    return audio;
  };

  const togglePlay = async () => {
    const audio = ensureAudio();

    if (isPlaying) {
      audio.pause();
      return;
    }

    try {
      await playExclusively(audio);
    } catch (error) {
      console.error("[voice-message] playback failed", error);
    }
  };

  const cycleSpeed = () => {
    const nextIndex = (speedIndex + 1) % SPEED_STEPS.length;
    setSpeedIndex(nextIndex);

    if (audioRef.current) {
      audioRef.current.playbackRate = SPEED_STEPS[nextIndex]!;
    }
  };

  const seekTo = (clientX: number) => {
    const track = trackRef.current;
    const duration = knownDuration || durationSeconds || 0;

    if (!track || duration <= 0) {
      return;
    }

    const rect = track.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const audio = ensureAudio();
    audio.currentTime = fraction * duration;
    setCurrentTime(audio.currentTime);
  };

  const totalDuration = knownDuration || durationSeconds || 0;
  const progress = totalDuration > 0 ? Math.min(1, currentTime / totalDuration) : 0;
  // Floor, not round — a bar should only light up once its slice of the timeline has actually
  // been played, not the instant playback crosses its midpoint. Combined with the rAF loop
  // above, this is what makes bars flip one at a time in a smooth left-to-right sweep instead
  // of jumping in clusters.
  const playedBarCount = Math.floor(progress * bars.length);
  const displayTime = isPlaying || currentTime > 0 ? currentTime : totalDuration;

  return (
    <div
      // The waveform below is a horizontal seek target — opt it out of the shared full-screen
      // swipe-back gesture (lib/useInteractiveSwipeBack.ts) explicitly. Now that swipe-back can
      // start from anywhere (not just a screen edge), this matters wherever the bubble sits.
      data-swipe-back-disabled
      className={`flex w-56 max-w-[85vw] shrink-0 items-center gap-2.5 overflow-hidden rounded-2xl px-3 py-2.5 ${
        isOwnMessage ? "bg-primary/20 text-cyan-50" : "border border-white/10 bg-[#0B1026] text-slate-100"
      }`}
    >
      <button
        type="button"
        onClick={() => void togglePlay()}
        aria-label={isPlaying ? "Pause" : "Play"}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/15"
      >
        {isPlaying ? (
          <Pause className="h-4 w-4 fill-current" aria-hidden />
        ) : (
          <Play className="h-4 w-4 fill-current" aria-hidden />
        )}
      </button>

      <div className="min-w-0 flex-1 overflow-hidden">
        <div
          ref={trackRef}
          onClick={(event) => seekTo(event.clientX)}
          className="flex h-6 min-w-0 cursor-pointer items-center gap-[2px] overflow-hidden"
        >
          {bars.map((level, index) => (
            <span
              key={index}
              className={`min-w-0 flex-1 rounded-full transition-colors ${
                index < playedBarCount ? "bg-cyan-300" : "bg-white/25"
              }`}
              style={{ height: `${Math.max(15, level * 100)}%` }}
            />
          ))}
        </div>
        <span className="mt-0.5 block truncate text-[11px] tabular-nums text-slate-400">
          {formatTime(displayTime)}
        </span>
      </div>

      <button
        type="button"
        onClick={cycleSpeed}
        className="shrink-0 rounded-full bg-white/10 px-2 py-1 text-[11px] font-semibold tabular-nums text-slate-200 transition hover:bg-white/15"
      >
        {SPEED_STEPS[speedIndex]}x
      </button>
    </div>
  );
}
