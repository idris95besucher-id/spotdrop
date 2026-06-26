"use client";

import { isUserOnline } from "@/lib/userPresence";

type UserOnlineDotProps = {
  lastSeenAt: string | null | undefined;
  className?: string;
};

export default function UserOnlineDot({ lastSeenAt, className = "" }: UserOnlineDotProps) {
  if (!isUserOnline(lastSeenAt)) {
    return null;
  }

  return (
    <span
      className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[#0B1026] bg-emerald-400 ${className}`}
      aria-hidden
    />
  );
}
