"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getAudioBlobDurationSeconds } from "@/lib/voiceMessages/audioDuration";

/** Below this, a recording is treated as an accidental tap, not a real voice message. */
export const MIN_VOICE_MESSAGE_MS = 800;
/** Number of amplitude samples kept for the live/recorded waveform bar. */
const WAVEFORM_SAMPLE_COUNT = 40;
const SAMPLE_INTERVAL_MS = 100;

/**
 * Tap once to start, tap again to stop — no press-hold, no drag-to-lock/cancel. That gesture
 * model was replaced because it depended on every pointerdown/pointermove/pointerup/pointercancel
 * firing in the right order on a real device, and any one of them getting dropped (a scroll
 * stealing the gesture, the OS interrupting touch tracking, etc.) left the recorder stuck with
 * no way to stop it. A plain click/tap has exactly one event to get right.
 *
 * "stopped" is a review state, not a send: stop() only stops the mic and freezes the result —
 * it never sends anything. The component shows Delete/Send from that frozen result; Send calls
 * confirmSend() (which hands back the result once and resets), Delete calls discardRecording().
 */
export type VoiceRecorderStatus = "idle" | "requesting-permission" | "recording" | "stopped";

export type VoiceRecordingResult =
  | { ok: true; blob: Blob; mimeType: string; durationMs: number; waveform: number[] }
  | { ok: false; reason: "too-short" | "empty" };

function pickAudioRecorderMimeType(): string {
  if (typeof MediaRecorder === "undefined") {
    return "";
  }

  const candidates = [
    "audio/mp4",
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/aac",
    "audio/ogg;codecs=opus",
  ];

  for (const mimeType of candidates) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType;
    }
  }

  return "";
}

/**
 * Shared recording engine for voice messages — one hook used identically by the DM, group,
 * and City Room composers (via VoiceMessageRecorder). Owns the MediaRecorder + mic stream +
 * live amplitude metering.
 *
 * Two distinct teardown paths, deliberately different:
 * - `releaseResources()` — immediate, synchronous release of everything (tracks, AudioContext,
 *   timers). Used by `discardRecording()` and unmount, where the recording is being thrown
 *   away anyway, so there's nothing to lose by not waiting.
 * - `stop()` — has its own sequencing: it keeps the mic stream alive until the MediaRecorder's
 *   own `stop` event confirms every chunk (including the final one) has been emitted, and only
 *   then releases the stream/AudioContext. See the comment on `stop()` for why this matters.
 */
export function useVoiceRecorder() {
  const [status, setStatus] = useState<VoiceRecorderStatus>("idle");
  const [durationMs, setDurationMs] = useState(0);
  const [waveform, setWaveform] = useState<number[]>([]);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [pendingResult, setPendingResult] = useState<VoiceRecordingResult | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sampleIntervalRef = useRef<number | null>(null);
  const durationIntervalRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const waveformRef = useRef<number[]>([]);
  const mimeTypeRef = useRef("");
  // Synchronous guards — plain booleans checked/set before any `await`, so a second tap that
  // lands before React commits a state update still can't start (or stop, or send) twice.
  const startingRef = useRef(false);
  const stoppingRef = useRef(false);
  const sentRef = useRef(false);

  /** Stops all tracks (releasing the OS mic indicator), closes the AudioContext, clears both timers. */
  const releaseResources = useCallback(() => {
    if (sampleIntervalRef.current !== null) {
      window.clearInterval(sampleIntervalRef.current);
      sampleIntervalRef.current = null;
    }

    if (durationIntervalRef.current !== null) {
      window.clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }

    // A tap-to-stop is already in flight (waiting on the recorder's own "stop" event, or its
    // watchdog) — e.g. the owning component unmounted a beat after the user tapped stop but
    // before that async flush landed. Don't race it: killing the tracks here, right now, is
    // exactly the truncation bug described on `stop()` below. Its own `finalize()` will stop
    // the tracks itself the moment the pending flush actually completes.
    if (stoppingRef.current) {
      return;
    }

    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        // Already stopped/stopping — nothing to do.
      }
    }
    recorderRef.current = null;

    for (const track of streamRef.current?.getTracks() ?? []) {
      track.stop();
    }
    streamRef.current = null;

    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      void audioContextRef.current.close().catch(() => {});
    }
    audioContextRef.current = null;
    analyserRef.current = null;
  }, []);

  // Stop recording (release the mic) if the component using this hook unmounts — e.g. the
  // user navigates away from the chat mid-recording. This is the *only* automatic stop; it
  // never fires from a re-render, only from the owning component actually going away.
  useEffect(() => {
    return () => {
      releaseResources();
    };
  }, [releaseResources]);

  const sampleAmplitude = useCallback(() => {
    const analyser = analyserRef.current;

    if (!analyser) {
      return;
    }

    const data = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(data);

    let sumSquares = 0;

    for (const value of data) {
      const normalized = (value - 128) / 128;
      sumSquares += normalized * normalized;
    }

    const rms = Math.sqrt(sumSquares / data.length);
    const level = Math.min(1, rms * 4); // scale up — raw mic RMS is usually quiet

    waveformRef.current = [...waveformRef.current, level].slice(-WAVEFORM_SAMPLE_COUNT);
    setWaveform(waveformRef.current);
  }, []);

  const start = useCallback(async (): Promise<{ error: string | null }> => {
    // Synchronous, checked-and-set before any await — this is what actually prevents two
    // concurrent recordings, unlike a `status` check alone (state updates are async, so two
    // taps landing before the first re-render both used to see "idle").
    if (startingRef.current || status !== "idle") {
      return { error: null };
    }

    startingRef.current = true;
    setPermissionError(null);
    setStatus("requesting-permission");

    let stream: MediaStream;

    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (caught) {
      const message =
        caught instanceof DOMException && caught.name === "NotAllowedError"
          ? "Microphone access was denied. Enable it in Settings to send voice messages."
          : "Unable to access the microphone.";
      setPermissionError(message);
      setStatus("idle");
      startingRef.current = false;
      return { error: message };
    }

    streamRef.current = stream;
    chunksRef.current = [];
    waveformRef.current = [];
    sentRef.current = false;
    setPendingResult(null);
    setWaveform([]);
    setDurationMs(0);

    const mimeType = pickAudioRecorderMimeType();
    mimeTypeRef.current = mimeType;

    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    recorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    // No timeslice: the encoder buffers the entire recording internally and hands back exactly
    // one `dataavailable` (the whole file) when `stop()` is called. A timeslice (periodic
    // `start(ms)`) forces the encoder to flush mid-recording at arbitrary boundaries instead —
    // some MediaRecorder implementations (notably mobile WebKit/Chromium mp4 and webm/opus
    // muxers) have shipped with bugs where a chunk boundary lands mid audio-frame and either
    // drops or corrupts a few milliseconds of audio right at that seam. We don't need
    // incremental chunks for anything (nothing streams or uploads mid-recording), so there's no
    // upside to timeslicing — only the downside of an extra failure mode.
    recorder.start();

    try {
      const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

      if (AudioContextCtor) {
        const audioContext = new AudioContextCtor();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        audioContextRef.current = audioContext;
        analyserRef.current = analyser;
      }
    } catch (caught) {
      console.warn("[voice-message] amplitude metering unavailable", caught);
    }

    startedAtRef.current = performance.now();
    sampleIntervalRef.current = window.setInterval(sampleAmplitude, SAMPLE_INTERVAL_MS);
    durationIntervalRef.current = window.setInterval(() => {
      setDurationMs(performance.now() - startedAtRef.current);
    }, 100);

    setStatus("recording");
    startingRef.current = false;
    return { error: null };
  }, [sampleAmplitude, status]);

  /**
   * Tap-to-stop: stops recording and freezes the result for review. Never sends — the
   * component reads `pendingResult` to show Delete/Send and calls confirmSend()/
   * discardRecording() explicitly.
   *
   * This used to call the same `releaseResources()` used for discard/unmount, which stops
   * every media stream track *immediately*, synchronously, right after calling
   * `recorder.stop()`. That was the actual cause of clipped recordings: `MediaRecorder.stop()`
   * only *requests* a final flush — per spec it queues a task to emit one last
   * `dataavailable` (containing whatever audio was still buffered) and only then fires
   * `stop`. Killing the underlying MediaStreamTrack before that task runs can cut that final
   * chunk short or drop it entirely, silently truncating the tail of the recording — the
   * stored file was already incomplete before it ever reached upload. The fix: keep the mic
   * stream alive until the recorder's own `stop` event confirms it has genuinely finished,
   * *then* release the stream/AudioContext. Only stop()/discardRecording()/unmount ever touch
   * the stream now, and stop() is the only one that waits.
   */
  const stop = useCallback(() => {
    if (stoppingRef.current || status !== "recording") {
      return;
    }

    stoppingRef.current = true;

    const recorder = recorderRef.current;
    const elapsedMs = performance.now() - startedAtRef.current;
    const finalWaveform = waveformRef.current;

    // Timers are purely cosmetic (duration counter, live waveform) — safe to clear right away.
    if (sampleIntervalRef.current !== null) {
      window.clearInterval(sampleIntervalRef.current);
      sampleIntervalRef.current = null;
    }
    if (durationIntervalRef.current !== null) {
      window.clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }

    setDurationMs(elapsedMs);
    setWaveform(finalWaveform);

    const finalize = async () => {
      // Only now is it safe to actually release the mic — the recorder has confirmed (via its
      // own "stop" event) that it already emitted every chunk, including the final one.
      for (const track of streamRef.current?.getTracks() ?? []) {
        track.stop();
      }
      streamRef.current = null;

      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        void audioContextRef.current.close().catch(() => {});
      }
      audioContextRef.current = null;
      analyserRef.current = null;
      recorderRef.current = null;

      if (elapsedMs < MIN_VOICE_MESSAGE_MS || chunksRef.current.length === 0) {
        setPendingResult({ ok: false, reason: "too-short" });
        setStatus("stopped");
        stoppingRef.current = false;
        return;
      }

      const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current || "audio/webm" });
      chunksRef.current = [];

      if (blob.size === 0) {
        setPendingResult({ ok: false, reason: "empty" });
        setStatus("stopped");
        stoppingRef.current = false;
        return;
      }

      // The wall-clock timer (elapsedMs) is only ever an *estimate* of how long the mic was
      // open — it can't account for encoder start-up latency or the exact sample the encoder
      // ended on. Decode the real, finished file and store *that* duration, so anything
      // downstream (playback UI, "how long is this clip" elsewhere) reflects the actual audio
      // rather than a timer that was never guaranteed to match it. Falls back to the timer if
      // the blob can't be probed (e.g. an unsupported codec in this browser).
      const decodedSeconds = await getAudioBlobDurationSeconds(blob);
      const durationMs = decodedSeconds > 0 ? Math.round(decodedSeconds * 1000) : Math.round(elapsedMs);

      setPendingResult({ ok: true, blob, mimeType: blob.type, durationMs, waveform: finalWaveform });
      setStatus("stopped");
      stoppingRef.current = false;
    };

    if (!recorder || recorder.state === "inactive") {
      void finalize();
      return;
    }

    // Belt-and-suspenders: if "stop" somehow never fires (shouldn't happen per spec, but a
    // stuck recorder must not leave the mic held open forever), finalize anyway after a timeout.
    const watchdogId = window.setTimeout(() => {
      console.warn("[voice-message] recorder 'stop' event never fired — finalizing anyway");
      recorder.onstop = null;
      void finalize();
    }, 2000);

    recorder.onstop = () => {
      window.clearTimeout(watchdogId);
      void finalize();
    };

    try {
      recorder.stop();
    } catch (caught) {
      console.error("[voice-message] recorder.stop() threw", caught);
      window.clearTimeout(watchdogId);
      void finalize();
    }
  }, [status]);

  /** Delete button in the review state — discard the recording, back to idle. */
  const discardRecording = useCallback(() => {
    releaseResources();
    chunksRef.current = [];
    waveformRef.current = [];
    sentRef.current = false;
    setPendingResult(null);
    setDurationMs(0);
    setWaveform([]);
    setStatus("idle");
  }, [releaseResources]);

  /** Send button in the review state — hands back the frozen result exactly once. */
  const confirmSend = useCallback((): VoiceRecordingResult | null => {
    if (sentRef.current || status !== "stopped" || !pendingResult) {
      return null;
    }

    sentRef.current = true;
    const result = pendingResult;
    setPendingResult(null);
    setDurationMs(0);
    setWaveform([]);
    setStatus("idle");
    return result;
  }, [pendingResult, status]);

  return {
    status,
    durationMs,
    waveform,
    permissionError,
    pendingResult,
    start,
    stop,
    discardRecording,
    confirmSend,
  };
}
