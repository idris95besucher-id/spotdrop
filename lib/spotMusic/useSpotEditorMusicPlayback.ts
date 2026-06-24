"use client";

import { useCallback, useEffect, useRef } from "react";

const EDITOR_MUSIC_LOAD_TIMEOUT_MS = 12_000;

function disposeAudio(audio: HTMLAudioElement | null) {
  if (!audio) {
    return;
  }

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

/** Plays selected track audio alongside editor video preview (user gesture required). */
export function useSpotEditorMusicPlayback(audioUrl: string | null) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const loadedUrlRef = useRef<string | null>(null);
  const playRequestRef = useRef(0);

  const stopMusic = useCallback(() => {
    playRequestRef.current += 1;
    disposeAudio(audioRef.current);
    audioRef.current = null;
    loadedUrlRef.current = null;
  }, []);

  const startMusic = useCallback(async () => {
    const url = audioUrl?.trim();
    if (!url) {
      return;
    }

    const requestId = playRequestRef.current + 1;
    playRequestRef.current = requestId;

    console.log("[Spot Editor] music preview start", { audio_url: url });

    let audio = audioRef.current;
    if (!audio || loadedUrlRef.current !== url) {
      stopMusic();
      playRequestRef.current = requestId;

      audio = new Audio();
      audio.loop = true;
      audio.preload = "auto";
      audio.src = url;
      audio.load();
      audioRef.current = audio;
      loadedUrlRef.current = url;

      try {
        await waitForAudioReady(audio, EDITOR_MUSIC_LOAD_TIMEOUT_MS);
      } catch (error) {
        console.error("MUSIC PLAY ERROR", { audio_url: url, error });
        stopMusic();
        return;
      }
    }

    if (playRequestRef.current !== requestId) {
      return;
    }

    try {
      if (audio.currentTime > 0) {
        audio.currentTime = 0;
      }
      await audio.play();
    } catch (error) {
      console.error("MUSIC PLAY ERROR", { audio_url: url, error });
      stopMusic();
    }
  }, [audioUrl, stopMusic]);

  useEffect(() => {
    stopMusic();
  }, [audioUrl, stopMusic]);

  useEffect(() => {
    return () => {
      stopMusic();
    };
  }, [stopMusic]);

  return { startMusic, stopMusic };
}
