import { loadUserSettingsPreferences } from "@/lib/settingsPreferences";

export type NotificationSoundKind =
  | "direct_message"
  | "group_message"
  | "room_message"
  | "like"
  | "comment";

export type MessageNotificationSoundSkipReason =
  | "own_message"
  | "viewing_thread"
  | "muted"
  | "hidden_room"
  | "not_member"
  | "messages_disabled"
  | "sound_disabled"
  | "app_hidden"
  | "locked"
  | "play_failed"
  | "system_event"
  | "category_disabled"
  | "stale_catchup";

/** True when a realtime event is an old catch-up (e.g. after resume) — skip in-app sound/toast. */
export function isStaleRealtimeNotification(createdAt: string, maxAgeMs = 4000) {
  const ts = Date.parse(createdAt);

  if (!Number.isFinite(ts)) {
    return false;
  }

  return Date.now() - ts > maxAgeMs;
}

const SOUND_SOURCES: Record<NotificationSoundKind, string> = {
  direct_message: "/sounds/dm.wav",
  group_message: "/sounds/group.wav",
  room_message: "/sounds/room.wav",
  like: "/sounds/like.wav",
  comment: "/sounds/comment.wav",
};

/** Minimal silent WAV — used only to unlock HTMLAudio on iOS (never an audible tone). */
const SILENT_WAV_DATA_URI =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

let audio: HTMLAudioElement | null = null;
let unlocked = false;
let unlockListenersAttached = false;
/** Suppress in-app WAV during cold start / resume catch-up (APNs push sounds unaffected). */
let suppressInAppSoundUntil = 0;

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

export function skipMessageNotificationSound(reason: MessageNotificationSoundSkipReason) {
  console.log("[Notification sound] skipped", reason);
}

/** Block in-app notification WAV briefly after launch/resume (realtime catch-up). */
export function suppressInAppNotificationSounds(ms = 2500) {
  suppressInAppSoundUntil = Math.max(suppressInAppSoundUntil, Date.now() + ms);
}

export function initMessageNotificationSoundUnlock() {
  if (typeof window === "undefined" || unlockListenersAttached) {
    return;
  }

  unlockListenersAttached = true;
  // Cold start / first paint: never allow catch-up realtime to chirp a WAV.
  suppressInAppNotificationSounds(2500);

  const unlock = () => {
    if (unlocked) {
      return;
    }

    const element = getAudio();
    if (!element) {
      return;
    }

    // Truly silent unlock. Do NOT play dm.wav (even at low volume) — WKWebView
    // audio ignores the iPhone silent switch and was heard as a startup beep.
    element.muted = true;
    element.volume = 0;
    element.src = SILENT_WAV_DATA_URI;
    element.load();

    void element
      .play()
      .then(() => {
        element.pause();
        element.currentTime = 0;
        element.muted = false;
        element.volume = 0.55;
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

  const onVisible = () => {
    if (document.visibilityState === "visible") {
      suppressInAppNotificationSounds(2500);
    }
  };

  document.addEventListener("visibilitychange", onVisible);
}

function isAppVisible() {
  if (typeof document === "undefined") {
    return false;
  }

  return document.visibilityState === "visible";
}

function isSoundEnabledInSettings() {
  try {
    return loadUserSettingsPreferences().notifications.sound;
  } catch {
    return true;
  }
}

function isCategoryEnabled(kind: NotificationSoundKind) {
  try {
    const prefs = loadUserSettingsPreferences().notifications;

    if (!prefs.all) {
      return false;
    }

    switch (kind) {
      case "direct_message":
        return prefs.messages;
      case "group_message":
        return prefs.groupMessages;
      case "room_message":
        return prefs.roomMessages;
      case "like":
        return prefs.likes;
      case "comment":
        return prefs.comments;
      default:
        return true;
    }
  } catch {
    return true;
  }
}

export async function playNotificationSound(kind: NotificationSoundKind) {
  if (typeof window === "undefined") {
    return;
  }

  if (!isAppVisible()) {
    skipMessageNotificationSound("app_hidden");
    return;
  }

  if (Date.now() < suppressInAppSoundUntil) {
    skipMessageNotificationSound("stale_catchup");
    return;
  }

  if (!isSoundEnabledInSettings()) {
    skipMessageNotificationSound("sound_disabled");
    return;
  }

  if (!isCategoryEnabled(kind)) {
    skipMessageNotificationSound("category_disabled");
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
  element.volume = 0.55;
  element.src = SOUND_SOURCES[kind];
  element.load();

  try {
    await element.play();
    console.log("[Notification sound] play", kind);
  } catch {
    skipMessageNotificationSound("play_failed");
  }
}

/** @deprecated Prefer playNotificationSound("direct_message") */
export async function playMessageNotificationSound() {
  return playNotificationSound("direct_message");
}

export function isMessageNotificationSoundEnabled() {
  return unlocked;
}
