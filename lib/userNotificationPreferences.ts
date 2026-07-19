import type { NotificationPreferences } from "@/lib/settingsPreferences";
import { supabase } from "@/lib/supabaseClient";

/** Sync local notification prefs to Supabase so APNs can honor Sound / categories. */
export async function syncUserNotificationPreferences(
  userId: string,
  prefs: NotificationPreferences
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("user_notification_preferences").upsert(
    {
      user_id: userId,
      all_enabled: prefs.all,
      direct_messages: prefs.messages,
      group_messages: prefs.groupMessages,
      room_messages: prefs.roomMessages,
      likes: prefs.likes,
      comments: prefs.comments,
      new_followers: prefs.newFollowers,
      sound: prefs.sound,
      vibration: prefs.vibration,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) {
    // Table may not exist until SQL migration is applied — don't block Settings UI.
    if (
      error.code === "42P01" ||
      error.code === "PGRST205" ||
      error.message.toLowerCase().includes("user_notification_preferences")
    ) {
      console.warn("[Push prefs] table missing — run enable-message-push-prefs-and-groups.sql");
      return { error: null };
    }

    console.error("[Push prefs] sync failed", error.message);
    return { error: error.message };
  }

  return { error: null };
}

export type ServerNotificationPreferences = {
  all_enabled: boolean;
  direct_messages: boolean;
  group_messages: boolean;
  room_messages: boolean;
  likes: boolean;
  comments: boolean;
  new_followers: boolean;
  sound: boolean;
  vibration: boolean;
};

export function defaultServerNotificationPreferences(): ServerNotificationPreferences {
  return {
    all_enabled: true,
    direct_messages: true,
    group_messages: true,
    room_messages: true,
    likes: true,
    comments: true,
    new_followers: true,
    sound: true,
    vibration: true,
  };
}

export function shouldAllowPushForType(
  type: string,
  prefs: ServerNotificationPreferences
): boolean {
  if (!prefs.all_enabled) {
    return false;
  }

  switch (type) {
    case "direct_message":
      return prefs.direct_messages;
    case "group_message":
      return prefs.group_messages;
    case "room_message":
    case "room_mention":
      return prefs.room_messages;
    case "new_follower":
      return prefs.new_followers;
    case "post_comment":
      return prefs.comments;
    default:
      return true;
  }
}
