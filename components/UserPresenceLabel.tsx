"use client";

import { useI18n } from "@/components/I18nProvider";
import { formatUserPresenceLabel } from "@/lib/userPresence";

type UserPresenceLabelProps = {
  lastSeenAt: string | null | undefined;
  className?: string;
  showDot?: boolean;
};

export default function UserPresenceLabel({
  lastSeenAt,
  className = "",
  showDot = true,
}: UserPresenceLabelProps) {
  const { t, locale } = useI18n();
  const presence = formatUserPresenceLabel(lastSeenAt, t, locale);

  return (
    <p className={`flex min-w-0 items-center gap-1.5 truncate text-xs ${className}`}>
      {presence.isOnline && showDot ? (
        <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" aria-hidden />
      ) : null}
      <span className={presence.isOnline ? "font-medium text-emerald-300" : "text-muted"}>
        {presence.label}
      </span>
    </p>
  );
}
