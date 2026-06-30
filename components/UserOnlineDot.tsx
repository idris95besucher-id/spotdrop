"use client";

import { useUserOnlineStatus } from "@/lib/useUserOnlineStatus";

type UserOnlineDotProps = {
  userId: string;
  lastSeenAt: string | null | undefined;
  username?: string | null;
  rawIsOnline?: unknown;
  screen?: string;
  className?: string;
};

export default function UserOnlineDot({
  userId,
  lastSeenAt,
  username,
  rawIsOnline,
  screen = "online-dot",
  className = "",
}: UserOnlineDotProps) {
  const isOnline = useUserOnlineStatus(userId, lastSeenAt, {
    screen,
    username,
    rawIsOnline,
  });

  if (!isOnline) {
    return null;
  }

  return (
    <span
      className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[#0B1026] bg-emerald-400 ${className}`}
      aria-hidden
    />
  );
}
