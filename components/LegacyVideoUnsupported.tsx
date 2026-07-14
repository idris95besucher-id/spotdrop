"use client";

import { useI18n } from "@/components/I18nProvider";

type LegacyVideoUnsupportedProps = {
  className?: string;
  compact?: boolean;
};

/**
 * Safe placeholder for legacy video posts that already exist in production.
 * Does not autoplay, mount a player, or expose controls.
 */
export default function LegacyVideoUnsupported({
  className = "",
  compact = false,
}: LegacyVideoUnsupportedProps) {
  const { t } = useI18n();

  return (
    <div
      className={`flex h-full w-full flex-col items-center justify-center bg-[#0a0b10] px-6 text-center ${className}`}
      role="img"
      aria-label={t("spot.videoNoLongerSupported")}
    >
      <p
        className={`font-medium leading-snug text-white/75 ${
          compact ? "text-[11px]" : "text-sm"
        }`}
      >
        {t("spot.videoNoLongerSupported")}
      </p>
    </div>
  );
}
