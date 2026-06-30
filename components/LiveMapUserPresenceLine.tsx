"use client";

import { useI18n } from "@/components/I18nProvider";
import { formatUserPresenceLabel } from "@/lib/userPresence";
import type { LiveMapUser } from "@/lib/userLiveLocation";
import { useUserOnlineStatus } from "@/lib/useUserOnlineStatus";

type LiveMapUserPresenceLineProps = {
  user: Pick<LiveMapUser, "user_id" | "username" | "is_online" | "last_seen_at">;
  screen?: string;
  className?: string;
};

export default function LiveMapUserPresenceLine({
  user,
  screen = "map-user-presence",
  className = "mt-0.5 text-[11px] font-medium text-cyan-300",
}: LiveMapUserPresenceLineProps) {
  const { t, locale } = useI18n();
  const isOnline = useUserOnlineStatus(user.user_id, user.last_seen_at, {
    screen,
    username: user.username,
    isOnlineFlag: user.is_online,
  });
  const presence = formatUserPresenceLabel(user.last_seen_at, t, locale, {
    isOnline,
    userId: user.user_id,
    username: user.username,
    isOnlineFlag: user.is_online,
    screen,
  });

  if (!presence.label) {
    return null;
  }

  return (
    <p className={`${className} ${presence.isOnline ? "text-cyan-300" : "text-slate-500"}`}>
      {presence.label}
    </p>
  );
}
