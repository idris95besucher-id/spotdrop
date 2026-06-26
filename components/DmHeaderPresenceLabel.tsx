"use client";

import { useEffect } from "react";
import { useI18n } from "@/components/I18nProvider";
import { formatDmHeaderPresenceLabel, type DmPartnerPresenceStatus } from "@/lib/userPresence";

type DmHeaderPresenceLabelProps = {
  presence: DmPartnerPresenceStatus;
  className?: string;
};

/** DM thread header presence — live online dot or relative last seen. */
export default function DmHeaderPresenceLabel({ presence, className = "" }: DmHeaderPresenceLabelProps) {
  const { t } = useI18n();
  const formatted = formatDmHeaderPresenceLabel(presence, t);

  useEffect(() => {
    console.log("[Online] DmHeaderPresenceLabel props", {
      isOnline: presence.isOnline,
      lastSeenAt: presence.lastSeenAt,
      label: formatted.label,
      formattedIsOnline: formatted.isOnline,
    });
  }, [presence.isOnline, presence.lastSeenAt, formatted.label, formatted.isOnline]);

  return (
    <p className={`flex min-w-0 items-center gap-1.5 truncate text-xs ${className}`}>
      {formatted.isOnline ? (
        <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" aria-hidden />
      ) : null}
      <span className={formatted.isOnline ? "font-medium text-emerald-300" : "text-muted"}>
        {formatted.label}
      </span>
    </p>
  );
}
