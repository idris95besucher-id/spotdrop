"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

type MobileSecondaryHeaderProps = {
  title: string;
  backHref: string;
  className?: string;
};

export default function MobileSecondaryHeader({
  title,
  backHref,
  className = "",
}: MobileSecondaryHeaderProps) {
  const router = useRouter();

  return (
    <header
      className={`flex shrink-0 items-center gap-2 border-b border-white/[0.08] bg-[#050816] px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:px-5 ${className}`}
    >
      <button
        type="button"
        onClick={() => router.push(backHref)}
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition hover:bg-white/10 active:opacity-80"
        aria-label={`Back to ${title}`}
      >
        <ChevronLeft className="h-5 w-5" strokeWidth={2} aria-hidden />
      </button>
      <h1 className="min-w-0 truncate text-lg font-bold text-white">{title}</h1>
    </header>
  );
}
