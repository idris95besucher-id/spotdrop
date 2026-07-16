/**
 * One shared audio system: at most one voice message plays at a time across DM, group, and
 * City Room bubbles alike, since they all import this same module-level singleton. A player
 * calls `playExclusively` before starting playback; any previously-playing element is paused
 * first. The previously-playing component discovers this the normal way — its own <audio>
 * element fires a native `pause` event, which it should already be listening to in order to
 * sync its own play/pause icon — so no separate pub/sub broadcast is needed.
 */

let currentAudio: HTMLAudioElement | null = null;

export async function playExclusively(audio: HTMLAudioElement): Promise<void> {
  if (currentAudio && currentAudio !== audio) {
    currentAudio.pause();
  }

  currentAudio = audio;
  await audio.play();
}

export function releaseIfCurrent(audio: HTMLAudioElement) {
  if (currentAudio === audio) {
    currentAudio = null;
  }
}
