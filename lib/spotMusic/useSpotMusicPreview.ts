"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { logMusicPlayClicked } from "@/lib/spotMusic/previewUrls";
import type { SpotMusicTrack } from "@/lib/spotMusic/types";

export type SpotMusicPreviewState = {
  playingTrackId: string | null;
  loadingTrackId: string | null;
  errorTrackId: string | null;
  errorMessage: string | null;
};

const PREVIEW_LOAD_TIMEOUT_MS = 12_000;

function resetAudioSource(audio: HTMLAudioElement) {
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
}

function waitForAudioReady(audio: HTMLAudioElement, timeoutMs: number) {
  return new Promise<void>((resolve, reject) => {
    if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      resolve();
      return;
    }

    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("timeout"));
    }, timeoutMs);

    const onReady = () => {
      cleanup();
      resolve();
    };

    const onError = () => {
      cleanup();
      reject(new Error("load_failed"));
    };

    const cleanup = () => {
      window.clearTimeout(timeout);
      audio.removeEventListener("canplay", onReady);
      audio.removeEventListener("error", onError);
    };

    audio.addEventListener("canplay", onReady, { once: true });
    audio.addEventListener("error", onError, { once: true });
  });
}

export function useSpotMusicPreview() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playingTrackIdRef = useRef<string | null>(null);
  const playingUrlRef = useRef<string | null>(null);
  const playRequestRef = useRef(0);
  const [state, setState] = useState<SpotMusicPreviewState>({
    playingTrackId: null,
    loadingTrackId: null,
    errorTrackId: null,
    errorMessage: null,
  });

  const stopPreview = useCallback(() => {
    playRequestRef.current += 1;

    if (audioRef.current) {
      resetAudioSource(audioRef.current);
    }

    playingTrackIdRef.current = null;
    playingUrlRef.current = null;
    setState({
      playingTrackId: null,
      loadingTrackId: null,
      errorTrackId: null,
      errorMessage: null,
    });
  }, []);

  const setPreviewError = useCallback((trackId: string, message: string, error?: unknown) => {
    console.error("MUSIC PLAY ERROR", {
      trackId,
      message,
      error,
    });

    playRequestRef.current += 1;

    if (audioRef.current) {
      resetAudioSource(audioRef.current);
    }

    playingTrackIdRef.current = null;
    playingUrlRef.current = null;
    setState({
      playingTrackId: null,
      loadingTrackId: null,
      errorTrackId: trackId,
      errorMessage: message,
    });
  }, []);

  const toggleTrackPreview = useCallback(
    async (track: SpotMusicTrack, previewUrl: string | null) => {
      logMusicPlayClicked(track, previewUrl);

      if (!previewUrl) {
        setPreviewError(track.id, "missing_url");
        return;
      }

      if (playingTrackIdRef.current === track.id && playingUrlRef.current === previewUrl) {
        stopPreview();
        return;
      }

      stopPreview();

      const requestId = playRequestRef.current + 1;
      playRequestRef.current = requestId;

      setState({
        playingTrackId: null,
        loadingTrackId: track.id,
        errorTrackId: null,
        errorMessage: null,
      });

      let audio = audioRef.current;
      if (!audio) {
        audio = new Audio();
        audio.preload = "auto";
        audioRef.current = audio;
      }

      audio.pause();
      audio.src = previewUrl;
      audio.load();

      try {
        await waitForAudioReady(audio, PREVIEW_LOAD_TIMEOUT_MS);

        if (playRequestRef.current !== requestId) {
          return;
        }

        await audio.play();

        if (playRequestRef.current !== requestId) {
          resetAudioSource(audio);
          return;
        }

        playingTrackIdRef.current = track.id;
        playingUrlRef.current = previewUrl;
        setState({
          playingTrackId: track.id,
          loadingTrackId: null,
          errorTrackId: null,
          errorMessage: null,
        });
      } catch (error) {
        if (playRequestRef.current !== requestId) {
          return;
        }

        const message =
          error instanceof Error && error.message === "timeout"
            ? "timeout"
            : error instanceof Error && error.message === "load_failed"
              ? "load_failed"
              : "play_blocked";

        setPreviewError(track.id, message, error);
      }
    },
    [setPreviewError, stopPreview]
  );

  useEffect(() => {
    return () => {
      stopPreview();
      audioRef.current = null;
    };
  }, [stopPreview]);

  return {
    ...state,
    stopPreview,
    toggleTrackPreview,
  };
}
