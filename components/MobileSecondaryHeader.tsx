"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { MOBILE_SAFE_AREA_INSET_TOP, MOBILE_WIDTH_SAFE_CLASS } from "@/lib/mobileLayout";

type MobileSecondaryHeaderProps = {
  title: string;
  backHref: string;
  onBack?: () => void;
  className?: string;
  trailing?: ReactNode;
};

export default function MobileSecondaryHeader({
  title,
  backHref,
  onBack,
  className = "",
  trailing,
}: MobileSecondaryHeaderProps) {
  const router = useRouter();

  return (
    <header
      className={`flex shrink-0 select-none touch-manipulation items-center gap-2 border-b border-white/[0.08] bg-[#050816] px-3 pb-2.5 ${MOBILE_SAFE_AREA_INSET_TOP} md:px-5 ${MOBILE_WIDTH_SAFE_CLASS} ${className}`}
    >
      <button
        type="button"
        onClick={() => {
          onBack?.();
          router.push(backHref);
        }}
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition hover:bg-white/10 active:opacity-80"
        aria-label={`Back to ${title}`}
      >
        <ChevronLeft className="h-5 w-5" strokeWidth={2} aria-hidden />
      </button>
      <h1 className="min-w-0 flex-1 truncate text-lg font-bold text-white">{title}</h1>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </header>
  );
}
