"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { MOBILE_SAFE_AREA_INSET_TOP, MOBILE_WIDTH_SAFE_CLASS } from "@/lib/mobileLayout";
import { navigateBack } from "@/lib/navigateBack";

type MobileSecondaryHeaderProps = {
  title: string;
  /** Safe parent route when history is empty or unreliable. */
  backHref?: string;
  /**
   * Full override for back. Prefer leaving this unset and using backHref,
   * or call navigateBack yourself inside onBack.
   */
  onBack?: () => void;
  /** Runs before shared navigation when onBack is not provided. */
  onBeforeBack?: () => void;
  /** When true with backHref, always use backHref (Visit rooms / deterministic parents). */
  preferFallback?: boolean;
  className?: string;
  trailing?: ReactNode;
};

export default function MobileSecondaryHeader({
  title,
  backHref,
  onBack,
  onBeforeBack,
  preferFallback = false,
  className = "",
  trailing,
}: MobileSecondaryHeaderProps) {
  const router = useRouter();
  const { t } = useI18n();

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }

    onBeforeBack?.();
    navigateBack(router, backHref, { preferFallback });
  };

  return (
    <header
      className={`relative z-[80] flex shrink-0 select-none touch-manipulation items-center gap-2 border-b border-white/[0.08] bg-[#050816] px-3 pb-2.5 ${MOBILE_SAFE_AREA_INSET_TOP} md:px-5 ${MOBILE_WIDTH_SAFE_CLASS} ${className}`}
    >
      <button
        type="button"
        onClick={handleBack}
        className="relative z-[81] inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white transition hover:bg-white/10 active:scale-95 active:bg-white/15 pointer-events-auto"
        aria-label={t("common.back")}
      >
        <ChevronLeft className="h-5 w-5" strokeWidth={2} aria-hidden />
      </button>
      <h1 className="relative z-[81] min-w-0 flex-1 truncate text-lg font-bold text-white">{title}</h1>
      {trailing ? <div className="relative z-[81] shrink-0">{trailing}</div> : null}
    </header>
  );
}
