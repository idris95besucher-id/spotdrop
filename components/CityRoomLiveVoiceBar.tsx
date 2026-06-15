"use client";

import Link from "next/link";
import { Mic, MicOff, Radio, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createCityVoiceAudioSession, type VoiceAudioSession } from "@/lib/cityVoiceAudio";
import {
  countActiveVoiceListeners,
  endCityVoiceRoom,
  fetchActiveCityVoiceRoom,
  fetchMyActiveVoiceParticipation,
  joinCityVoiceRoom,
  leaveCityVoiceParticipation,
  startCityVoiceRoom,
  subscribeToCityVoiceRoom,
  type CityVoiceParticipant,
  type CityVoiceRoom,
} from "@/lib/cityVoiceRoom";

type CityRoomLiveVoiceBarProps = {
  countrySlug: string;
  citySlug: string;
  userId: string | null;
};

type VoiceUiState = "idle" | "connecting" | "connected";

export default function CityRoomLiveVoiceBar({ countrySlug, citySlug, userId }: CityRoomLiveVoiceBarProps) {
  const [activeRoom, setActiveRoom] = useState<CityVoiceRoom | null>(null);
  const [participation, setParticipation] = useState<CityVoiceParticipant | null>(null);
  const [listenerCount, setListenerCount] = useState(0);
  const [uiState, setUiState] = useState<VoiceUiState>("idle");
  const [muted, setMuted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioSessionRef = useRef<VoiceAudioSession | null>(null);

  const isHost = participation?.role === "host";
  const isConnected = uiState === "connected" && participation !== null;
  const canPublish = participation?.role === "host" || participation?.role === "speaker";

  const refreshVoiceState = useCallback(async () => {
    const room = await fetchActiveCityVoiceRoom(countrySlug, citySlug);
    setActiveRoom(room);

    if (!room) {
      setParticipation(null);
      setListenerCount(0);
      return;
    }

    setListenerCount(await countActiveVoiceListeners(room.id));

    if (userId) {
      setParticipation(await fetchMyActiveVoiceParticipation(room.id, userId));
    } else {
      setParticipation(null);
    }
  }, [citySlug, countrySlug, userId]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        await refreshVoiceState();
      } catch (loadError) {
        if (!cancelled) {
          console.error("Failed to load city voice room:", loadError);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshVoiceState]);

  useEffect(() => {
    const subscription = subscribeToCityVoiceRoom(
      countrySlug,
      citySlug,
      activeRoom?.id ?? null,
      {
        onRoomChange: (room) => {
          setActiveRoom(room);
          if (!room) {
            setParticipation(null);
            setListenerCount(0);
            if (uiState !== "idle") {
              setUiState("idle");
            }
          }
        },
        onListenerCountChange: setListenerCount,
        onParticipationChange: setParticipation,
      },
      userId
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [activeRoom?.id, citySlug, countrySlug, uiState, userId]);

  const disconnectAudio = useCallback(async () => {
    if (audioSessionRef.current) {
      await audioSessionRef.current.disconnect();
      audioSessionRef.current = null;
    }
    setUiState("idle");
    setMuted(false);
  }, []);

  useEffect(() => {
    if (!activeRoom && uiState !== "idle") {
      void disconnectAudio();
      setParticipation(null);
    }
  }, [activeRoom, disconnectAudio, uiState]);

  useEffect(() => {
    return () => {
      void audioSessionRef.current?.disconnect();
      audioSessionRef.current = null;
    };
  }, []);

  const connectAudio = useCallback(
    async (room: CityVoiceRoom, participant: CityVoiceParticipant) => {
      await disconnectAudio();

      const session = createCityVoiceAudioSession({
        voiceRoomId: room.id,
        countrySlug,
        citySlug,
        userId: participant.user_id,
        role: participant.role,
      });

      setUiState("connecting");
      await session.connect();
      audioSessionRef.current = session;
      setUiState("connected");
    },
    [citySlug, countrySlug, disconnectAudio]
  );

  const handleStartLive = async () => {
    if (!userId || busy) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const { room, participant } = await startCityVoiceRoom(countrySlug, citySlug, userId);
      setActiveRoom(room);
      setParticipation(participant);
      await connectAudio(room, participant);
      setListenerCount(await countActiveVoiceListeners(room.id));
    } catch (startError) {
      console.error("Failed to start live voice:", startError);
      setError(startError instanceof Error ? startError.message : "Could not start live voice.");
      await disconnectAudio();
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async () => {
    if (!userId || !activeRoom || busy) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const participant = await joinCityVoiceRoom(activeRoom.id, userId, "listener");
      setParticipation(participant);
      await connectAudio(activeRoom, participant);
      setListenerCount(await countActiveVoiceListeners(activeRoom.id));
    } catch (joinError) {
      console.error("Failed to join live voice:", joinError);
      setError(joinError instanceof Error ? joinError.message : "Could not join live voice.");
      await disconnectAudio();
    } finally {
      setBusy(false);
    }
  };

  const handleLeave = async () => {
    if (!participation || busy) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await disconnectAudio();
      await leaveCityVoiceParticipation(participation.id);
      setParticipation(null);
    } catch (leaveError) {
      console.error("Failed to leave live voice:", leaveError);
      setError(leaveError instanceof Error ? leaveError.message : "Could not leave live voice.");
    } finally {
      setBusy(false);
    }
  };

  const handleEndLive = async () => {
    if (!userId || !activeRoom || !isHost || busy) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await disconnectAudio();
      await endCityVoiceRoom(activeRoom.id, userId);
      setActiveRoom(null);
      setParticipation(null);
      setListenerCount(0);
    } catch (endError) {
      console.error("Failed to end live voice:", endError);
      setError(endError instanceof Error ? endError.message : "Could not end live voice.");
    } finally {
      setBusy(false);
    }
  };

  const handleToggleMute = async () => {
    if (!audioSessionRef.current || !canPublish) {
      return;
    }

    const nextMuted = !muted;
    await audioSessionRef.current.setMuted(nextMuted);
    setMuted(nextMuted);
  };

  const showStartLive = !activeRoom && userId;
  const showLiveInvite = activeRoom && !isConnected;
  const showConnected = activeRoom && isConnected;

  return (
    <div className="shrink-0 border-b border-cyan-500/20 bg-gradient-to-r from-cyan-950/50 via-slate-950/90 to-slate-950/90 px-4 py-2.5 backdrop-blur-xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${
              activeRoom ? "border-red-400/40 bg-red-500/15" : "border-white/10 bg-white/5"
            }`}
          >
            {activeRoom ? (
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-70" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-400" />
              </span>
            ) : (
              <Radio className="h-4 w-4 text-slate-400" strokeWidth={1.75} aria-hidden />
            )}
          </div>

          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-300/90">Live Voice</p>
            {showConnected ? (
              <p className="truncate text-sm font-medium text-white">
                Connected{canPublish ? (muted ? " · Muted" : " · Speaking") : " · Listening"}
              </p>
            ) : showLiveInvite ? (
              <p className="truncate text-sm font-medium text-white">
                Live now · {listenerCount} listening
              </p>
            ) : (
              <p className="truncate text-sm text-slate-300">Start a live audio room for this city.</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {showStartLive ? (
            <button
              type="button"
              onClick={() => void handleStartLive()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-full bg-cyan-500 px-3.5 py-2 text-xs font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:opacity-60"
            >
              <Mic className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              Start Live
            </button>
          ) : null}

          {showLiveInvite && userId ? (
            <button
              type="button"
              onClick={() => void handleJoin()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-full bg-cyan-500 px-3.5 py-2 text-xs font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:opacity-60"
            >
              <Volume2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              Join
            </button>
          ) : null}

          {showLiveInvite && !userId ? (
            <Link
              href="/auth/login"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-white/10"
            >
              Sign in to join
            </Link>
          ) : null}

          {showConnected ? (
            <>
              {canPublish ? (
                <button
                  type="button"
                  onClick={() => void handleToggleMute()}
                  disabled={busy}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white transition hover:bg-white/10 disabled:opacity-60"
                  aria-label={muted ? "Unmute microphone" : "Mute microphone"}
                >
                  {muted ? (
                    <MicOff className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  ) : (
                    <Mic className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  )}
                </button>
              ) : null}

              <button
                type="button"
                onClick={() => void (isHost ? handleEndLive() : handleLeave())}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-white/10 disabled:opacity-60"
              >
                {isHost ? "End Live" : "Leave"}
              </button>
            </>
          ) : null}
        </div>
      </div>

      {error ? <p className="mt-2 text-xs text-red-300">{error}</p> : null}
      {uiState === "connecting" ? (
        <p className="mt-2 text-xs text-slate-400">Connecting audio…</p>
      ) : null}
    </div>
  );
}
