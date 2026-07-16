const MESSAGE_SOUND_SOURCES = ["/sounds/message.mp3", "/sounds/message.m4a"] as const;

export type MessageNotificationSoundSkipReason =
  | "own_message"
  | "viewing_thread"
  | "muted"
  | "hidden_room"
  | "not_member"
  | "messages_disabled"
  | "locked"
  | "play_failed"
  | "system_event";

let audio: HTMLAudioElement | null = null;
let unlocked = false;
let unlockListenersAttached = false;
let resolvedSoundSrc: string | null = null;

function getAudio() {
  if (typeof window === "undefined") {
    return null;
  }

  if (!audio) {
    audio = new Audio();
    audio.preload = "auto";
    audio.volume = 0.55;
  }

  return audio;
}

function resolveSoundSrc() {
  if (resolvedSoundSrc) {
    return resolvedSoundSrc;
  }

  resolvedSoundSrc = MESSAGE_SOUND_SOURCES[0];
  return resolvedSoundSrc;
}

export function skipMessageNotificationSound(reason: MessageNotificationSoundSkipReason) {
  console.log("[Notification sound] skipped", reason);
}

export function initMessageNotificationSoundUnlock() {
  if (typeof window === "undefined" || unlockListenersAttached) {
    return;
  }

  unlockListenersAttached = true;

  const unlock = () => {
    if (unlocked) {
      return;
    }

    const element = getAudio();
    if (!element) {
      return;
    }

    element.src = resolveSoundSrc();
    element.load();

    void element
      .play()
      .then(() => {
        element.pause();
        element.currentTime = 0;
        unlocked = true;
        console.log("[Notification sound] unlocked");
      })
      .catch(() => {
        // iOS requires a user gesture; keep listening until one succeeds.
      });
  };

  const options: AddEventListenerOptions = { capture: true, passive: true };

  window.addEventListener("pointerdown", unlock, options);
  window.addEventListener("touchstart", unlock, options);
  window.addEventListener("keydown", unlock, options);
}

export async function playMessageNotificationSound() {
  if (typeof window === "undefined") {
    return;
  }

  if (!unlocked) {
    skipMessageNotificationSound("locked");
    return;
  }

  const element = getAudio();
  if (!element) {
    skipMessageNotificationSound("play_failed");
    return;
  }

  element.pause();
  element.currentTime = 0;
  element.src = resolveSoundSrc();
  element.load();

  try {
    await element.play();
    console.log("[Notification sound] play");
  } catch {
    skipMessageNotificationSound("play_failed");
  }
}

export function isMessageNotificationSoundEnabled() {
  return unlocked;
}
