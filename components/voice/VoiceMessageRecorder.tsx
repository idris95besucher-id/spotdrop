"use client";

import { useEffect, useState } from "react";
import { Mic, Send, Square, Trash2 } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { useVoiceRecorder, type VoiceRecordingResult } from "@/lib/voiceMessages/useVoiceRecorder";

type VoiceMessageRecorderProps = {
  /** Called with a valid (non-empty, non-too-short) recording — the caller uploads + sends it. */
  onSend: (result: Extract<VoiceRecordingResult, { ok: true }>) => void;
  disabled?: boolean;
};

function formatDuration(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function WaveformBars({ waveform, live = false }: { waveform: number[]; live?: boolean }) {
  const bars = waveform.length > 0 ? waveform : [0];

  return (
    <div className="flex h-6 min-w-0 flex-1 items-center gap-[2px] overflow-hidden">
      {bars.map((level, index) => (
        <span
          key={index}
          className={`min-w-0 flex-1 rounded-full bg-cyan-400/80 ${live ? "transition-[height] duration-100" : ""}`}
          style={{ height: `${Math.max(15, level * 100)}%` }}
        />
      ))}
    </div>
  );
}

export default function VoiceMessageRecorder({ onSend, disabled = false }: VoiceMessageRecorderProps) {
  const { t } = useI18n();
  const recorder = useVoiceRecorder();
  const [tooShortHint, setTooShortHint] = useState(false);

  // A recording that finished but was too short/empty (e.g. an accidental tap-tap) has
  // nothing to review — clear it back to idle automatically instead of showing empty
  // Delete/Send buttons for a non-existent clip.
  useEffect(() => {
    if (recorder.pendingResult && !recorder.pendingResult.ok) {
      setTooShortHint(true);
      recorder.discardRecording();
      const timeoutId = window.setTimeout(() => setTooShortHint(false), 1500);
      return () => window.clearTimeout(timeoutId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder.pendingResult]);

  const handleMicTap = async () => {
    if (disabled) {
      return;
    }

    if (recorder.status === "idle") {
      await recorder.start();
      return;
    }

    if (recorder.status === "recording") {
      recorder.stop();
    }
  };

  const handleDelete = () => {
    recorder.discardRecording();
  };

  const handleSend = () => {
    const result = recorder.confirmSend();

    if (result?.ok) {
      onSend(result);
    }
  };

  if (recorder.status === "stopped" && recorder.pendingResult?.ok) {
    return (
      <div className="absolute inset-0 z-10 flex max-w-full items-center gap-2 overflow-hidden rounded-2xl border border-white/10 bg-[#0d1322] px-3">
        <button
          type="button"
          onClick={handleDelete}
          aria-label={t("voiceMessage.delete")}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-red-300 transition hover:bg-red-500/10"
        >
          <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        </button>

        <span className="shrink-0 text-sm font-medium tabular-nums text-white">
          {formatDuration(recorder.durationMs)}
        </span>
        <WaveformBars waveform={recorder.waveform} />

        <button
          type="button"
          onClick={handleSend}
          aria-label={t("common.send")}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-background transition hover:brightness-110"
        >
          <Send className="h-4 w-4" strokeWidth={2} aria-hidden />
        </button>
      </div>
    );
  }

  if (recorder.status === "recording") {
    return (
      <div className="absolute inset-0 z-10 flex max-w-full items-center gap-2 overflow-hidden rounded-2xl border border-red-400/25 bg-[#0d1322] px-3">
        <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-red-500" aria-hidden />
        <span className="shrink-0 text-sm font-medium tabular-nums text-white">
          {formatDuration(recorder.durationMs)}
        </span>
        <WaveformBars waveform={recorder.waveform} live />

        <button
          type="button"
          onClick={() => void handleMicTap()}
          aria-label={t("voiceMessage.stopRecording")}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-500 text-white transition hover:brightness-110"
        >
          <Square className="h-3.5 w-3.5 fill-current" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        disabled={disabled || recorder.status === "requesting-permission"}
        onClick={() => void handleMicTap()}
        aria-label={t("voiceMessage.startRecording")}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-background transition hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Mic className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
      </button>

      {recorder.permissionError ? (
        <p className="absolute bottom-full right-0 mb-2 w-56 rounded-xl bg-red-500/15 px-3 py-2 text-xs text-red-200 ring-1 ring-red-400/25">
          {recorder.permissionError}
        </p>
      ) : null}

      {tooShortHint ? (
        <p className="absolute bottom-full right-0 mb-2 w-44 rounded-xl bg-white/10 px-3 py-2 text-xs text-slate-200 ring-1 ring-white/15">
          {t("voiceMessage.tooShort")}
        </p>
      ) : null}
    </div>
  );
}
