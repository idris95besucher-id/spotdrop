import { createLiveKitVoiceSession } from "@/lib/cityVoiceAudio/livekitSession";
import { isLiveKitVoiceConfigured, type VoiceAudioConnectOptions, type VoiceAudioSession } from "@/lib/cityVoiceAudio/types";
import { createWebRtcVoiceSession } from "@/lib/cityVoiceAudio/webRtcSession";

export function createCityVoiceAudioSession(options: VoiceAudioConnectOptions): VoiceAudioSession {
  if (isLiveKitVoiceConfigured()) {
    return createLiveKitVoiceSession(options);
  }

  return createWebRtcVoiceSession(options);
}

export type { VoiceAudioConnectOptions, VoiceAudioSession } from "@/lib/cityVoiceAudio/types";
export { isLiveKitVoiceConfigured } from "@/lib/cityVoiceAudio/types";
