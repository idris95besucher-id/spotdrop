import { supabase } from "@/lib/supabaseClient";
import type { VoiceAudioConnectOptions, VoiceAudioSession } from "@/lib/cityVoiceAudio/types";

type SignalPayload =
  | { type: "listener-ready"; from: string }
  | { type: "offer"; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { type: "answer"; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { type: "ice"; from: string; to: string; candidate: RTCIceCandidateInit };

const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

function createPeerConnection(onTrack: (stream: MediaStream) => void) {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  pc.ontrack = (event) => {
    if (event.streams[0]) {
      onTrack(event.streams[0]);
    }
  };

  return pc;
}

export function createWebRtcVoiceSession(options: VoiceAudioConnectOptions): VoiceAudioSession {
  const { voiceRoomId, userId, role } = options;
  const canPublishAudio = role === "host" || role === "speaker";
  const channelName = `voice_signal_${voiceRoomId}`;
  let channel = supabase.channel(channelName, {
    config: { broadcast: { self: false } },
  });

  const peerConnections = new Map<string, RTCPeerConnection>();
  const remoteAudioElements = new Map<string, HTMLAudioElement>();
  let localStream: MediaStream | null = null;
  let muted = false;
  let connected = false;

  const attachRemoteStream = (peerId: string, stream: MediaStream) => {
    let audio = remoteAudioElements.get(peerId);
    if (!audio) {
      audio = document.createElement("audio");
      audio.autoplay = true;
      audio.setAttribute("playsinline", "true");
      audio.dataset.voicePeer = peerId;
      document.body.appendChild(audio);
      remoteAudioElements.set(peerId, audio);
    }
    audio.srcObject = stream;
    void audio.play().catch(() => undefined);
  };

  const removePeer = (peerId: string) => {
    const pc = peerConnections.get(peerId);
    if (pc) {
      pc.close();
      peerConnections.delete(peerId);
    }
    const audio = remoteAudioElements.get(peerId);
    if (audio) {
      audio.pause();
      audio.remove();
      remoteAudioElements.delete(peerId);
    }
  };

  const sendSignal = async (payload: SignalPayload) => {
    await channel.send({
      type: "broadcast",
      event: "signal",
      payload,
    });
  };

  const ensurePublisherConnection = async (listenerId: string) => {
    if (!canPublishAudio || !localStream) {
      return;
    }

    if (peerConnections.has(listenerId)) {
      return;
    }

    const pc = createPeerConnection((stream) => attachRemoteStream(listenerId, stream));
    for (const track of localStream.getTracks()) {
      pc.addTrack(track, localStream);
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        void sendSignal({
          type: "ice",
          from: userId,
          to: listenerId,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    peerConnections.set(listenerId, pc);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await sendSignal({
      type: "offer",
      from: userId,
      to: listenerId,
      sdp: offer,
    });
  };

  const handleSignal = async (payload: SignalPayload) => {
    if ("to" in payload && payload.to && payload.to !== userId) {
      return;
    }

    if (payload.type === "listener-ready" && canPublishAudio) {
      await ensurePublisherConnection(payload.from);
      return;
    }

    if (payload.type === "offer" && !canPublishAudio) {
      removePeer(payload.from);
      const pc = createPeerConnection((stream) => attachRemoteStream(payload.from, stream));
      peerConnections.set(payload.from, pc);

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          void sendSignal({
            type: "ice",
            from: userId,
            to: payload.from,
            candidate: event.candidate.toJSON(),
          });
        }
      };

      await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await sendSignal({
        type: "answer",
        from: userId,
        to: payload.from,
        sdp: answer,
      });
      return;
    }

    if (payload.type === "answer" && canPublishAudio) {
      const pc = peerConnections.get(payload.from);
      if (pc && !pc.currentRemoteDescription) {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      }
      return;
    }

    if (payload.type === "ice") {
      const pc = peerConnections.get(payload.from);
      if (pc && payload.candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
        } catch {
          // Ignore stale ICE candidates during teardown.
        }
      }
    }
  };

  return {
    canPublish: () => canPublishAudio,
    isMuted: () => muted,
    connect: async () => {
      if (connected) {
        return;
      }

      channel = supabase.channel(channelName, {
        config: { broadcast: { self: false } },
      });

      channel.on("broadcast", { event: "signal" }, ({ payload }) => {
        void handleSignal(payload as SignalPayload);
      });

      await new Promise<void>((resolve, reject) => {
        channel.subscribe((status) => {
          if (status === "SUBSCRIBED") {
            resolve();
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            reject(new Error("Voice signaling channel failed."));
          }
        });
      });

      if (canPublishAudio) {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        for (const track of localStream.getAudioTracks()) {
          track.enabled = !muted;
        }
      } else {
        await sendSignal({ type: "listener-ready", from: userId });
      }

      connected = true;
    },
    disconnect: async () => {
      connected = false;

      for (const peerId of [...peerConnections.keys()]) {
        removePeer(peerId);
      }

      if (localStream) {
        for (const track of localStream.getTracks()) {
          track.stop();
        }
        localStream = null;
      }

      await supabase.removeChannel(channel);
    },
    setMuted: async (nextMuted: boolean) => {
      muted = nextMuted;
      if (localStream) {
        for (const track of localStream.getAudioTracks()) {
          track.enabled = !nextMuted;
        }
      }
    },
  };
}
