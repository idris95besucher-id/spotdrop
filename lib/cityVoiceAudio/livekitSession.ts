import { Room, RoomEvent, Track } from "livekit-client";
import { buildLiveKitRoomName } from "@/lib/cityVoiceRoom";
import type { VoiceAudioConnectOptions, VoiceAudioSession } from "@/lib/cityVoiceAudio/types";

export function createLiveKitVoiceSession(options: VoiceAudioConnectOptions): VoiceAudioSession {
  const { voiceRoomId, countrySlug, citySlug, userId, role } = options;
  const canPublishAudio = role === "host" || role === "speaker";
  let room: Room | null = null;
  let muted = false;
  const audioElements = new Map<string, HTMLAudioElement>();

  const attachAudio = (track: Track, participantSid: string) => {
    if (track.kind !== Track.Kind.Audio) {
      return;
    }

    let element = audioElements.get(participantSid);
    if (!element) {
      element = track.attach() as HTMLAudioElement;
      element.autoplay = true;
      element.setAttribute("playsinline", "true");
      audioElements.set(participantSid, element);
    }
  };

  return {
    canPublish: () => canPublishAudio,
    isMuted: () => muted,
    connect: async () => {
      const roomName = buildLiveKitRoomName(countrySlug, citySlug, voiceRoomId);
      const { data: sessionData } = await import("@/lib/supabaseClient").then((m) =>
        m.supabase.auth.getSession()
      );
      const accessToken = sessionData.session?.access_token;

      if (!accessToken) {
        throw new Error("Sign in required for voice chat.");
      }

      const { getHostedApiBaseUrl } = await import("@/lib/hostedApiBase");
      const isNativeWebView =
        typeof window !== "undefined" &&
        (window.location.protocol === "capacitor:" || window.location.protocol === "ionic:");
      const apiBase = isNativeWebView ? getHostedApiBaseUrl() : "";

      const response = await fetch(`${apiBase}/api/livekit/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          roomName,
          identity: userId,
          canPublish: canPublishAudio,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "LiveKit is not configured.");
      }

      const { token, url } = (await response.json()) as { token: string; url: string };
      room = new Room({ adaptiveStream: true, dynacast: true });

      room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
        attachAudio(track, participant.sid);
      });

      room.on(RoomEvent.TrackUnsubscribed, (track, _publication, participant) => {
        track.detach();
        audioElements.get(participant.sid)?.remove();
        audioElements.delete(participant.sid);
      });

      await room.connect(url, token);

      if (canPublishAudio) {
        await room.localParticipant.setMicrophoneEnabled(!muted);
      }
    },
    disconnect: async () => {
      for (const element of audioElements.values()) {
        element.pause();
        element.remove();
      }
      audioElements.clear();

      if (room) {
        await room.disconnect();
        room = null;
      }
    },
    setMuted: async (nextMuted: boolean) => {
      muted = nextMuted;
      if (room && canPublishAudio) {
        await room.localParticipant.setMicrophoneEnabled(!nextMuted);
      }
    },
  };
}
