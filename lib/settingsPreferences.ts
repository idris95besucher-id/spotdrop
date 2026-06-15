import { DEFAULT_ACCENT_COLOR, isAccentColorCode } from "@/lib/themeAccent";
import { DEFAULT_LANGUAGE, isAppLanguageCode } from "@/lib/languages";
import {
  MESSAGE_PRIVACY_VALUES,
  normalizeMessagePrivacy,
  type MessagePrivacy,
} from "@/lib/messagePrivacy";

export type { MessagePrivacy };

export type NotificationPreferences = {
  likes: boolean;
  comments: boolean;
  newFollowers: boolean;
  messages: boolean;
};

export type UserSettingsPreferences = {
  language: string;
  accentColor: string;
  messagePrivacy: MessagePrivacy;
  notifications: NotificationPreferences;
  blockedUserIds: string[];
};

const STORAGE_KEY = "spotdrop_user_settings";

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  likes: true,
  comments: true,
  newFollowers: true,
  messages: true,
};

export const DEFAULT_USER_SETTINGS: UserSettingsPreferences = {
  language: DEFAULT_LANGUAGE,
  accentColor: DEFAULT_ACCENT_COLOR,
  messagePrivacy: "everyone",
  notifications: DEFAULT_NOTIFICATION_PREFERENCES,
  blockedUserIds: [],
};

export const MESSAGE_PRIVACY_OPTIONS: { value: MessagePrivacy; label: string; description: string }[] = [
  { value: "everyone", label: "Everyone", description: "Anyone can send you a direct message." },
  { value: "followers", label: "Followers only", description: "Only people who follow you can message you." },
  { value: "friends", label: "Friends only", description: "Only mutual friends can message you." },
  { value: "nobody", label: "Nobody", description: "Direct messages are turned off." },
];

function readStorage(): UserSettingsPreferences {
  if (typeof window === "undefined") {
    return DEFAULT_USER_SETTINGS;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return DEFAULT_USER_SETTINGS;
    }

    const parsed = JSON.parse(raw) as Partial<UserSettingsPreferences>;

    return {
      language:
        parsed.language && isAppLanguageCode(parsed.language) ? parsed.language : DEFAULT_USER_SETTINGS.language,
      accentColor:
        parsed.accentColor && isAccentColorCode(parsed.accentColor)
          ? parsed.accentColor
          : DEFAULT_USER_SETTINGS.accentColor,
      messagePrivacy: normalizeMessagePrivacy(parsed.messagePrivacy),
      notifications: {
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        ...parsed.notifications,
      },
      blockedUserIds: Array.isArray(parsed.blockedUserIds) ? parsed.blockedUserIds : [],
    };
  } catch {
    return DEFAULT_USER_SETTINGS;
  }
}

export function loadUserSettingsPreferences(): UserSettingsPreferences {
  return readStorage();
}

export function saveUserSettingsPreferences(preferences: UserSettingsPreferences) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
}

export function updateUserSettingsPreferences(
  patch: Partial<Omit<UserSettingsPreferences, "notifications">> & {
    notifications?: Partial<NotificationPreferences>;
  }
): UserSettingsPreferences {
  const current = readStorage();
  const next: UserSettingsPreferences = {
    ...current,
    ...patch,
    messagePrivacy: patch.messagePrivacy
      ? normalizeMessagePrivacy(patch.messagePrivacy)
      : current.messagePrivacy,
    notifications: {
      ...current.notifications,
      ...patch.notifications,
    },
  };

  saveUserSettingsPreferences(next);
  return next;
}

export function unblockUser(userId: string) {
  const current = readStorage();

  return updateUserSettingsPreferences({
    blockedUserIds: current.blockedUserIds.filter((id) => id !== userId),
  });
}

export { MESSAGE_PRIVACY_VALUES };
