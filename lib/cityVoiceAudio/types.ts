export type VoiceAudioRole = "host" | "speaker" | "listener";

export type VoiceAudioConnectOptions = {
  voiceRoomId: string;
  countrySlug: string;
  citySlug: string;
  userId: string;
  role: VoiceAudioRole;
};

export type VoiceAudioSession = {
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  setMuted: (muted: boolean) => Promise<void>;
  isMuted: () => boolean;
  canPublish: () => boolean;
};

export function isLiveKitVoiceConfigured() {
  return process.env.NEXT_PUBLIC_LIVEKIT_ENABLED === "true";
}
