"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";

type AuthShellProps = {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  footer?: ReactNode;
  showLogo?: boolean;
};

export default function AuthShell({
  children,
  title,
  subtitle,
  footer,
  showLogo = true,
}: AuthShellProps) {
  return (
    <Shell showHeader={false}>
      <div className="flex min-h-[100dvh] w-full max-w-full min-w-0 flex-col justify-center overflow-x-hidden overflow-y-auto overscroll-y-contain px-4 py-6 sm:py-8">
        <div className="mx-auto w-full min-w-0 max-w-[420px]">
          {showLogo ? (
            <div className="mb-6 text-center sm:mb-8">
              <Link href="/auth" className="inline-block text-3xl font-bold tracking-tight text-white">
                Spot<span className="text-primary">Drop</span>
              </Link>
            </div>
          ) : null}

          <div className="w-full min-w-0 overflow-visible rounded-2xl border border-primary/10 bg-card p-5 shadow-2xl shadow-black/40 sm:p-7">
            {title ? <h1 className="text-center text-xl font-semibold text-white">{title}</h1> : null}
            {subtitle ? <p className="mt-2 text-center text-sm leading-relaxed text-muted">{subtitle}</p> : null}
            <div className={`min-w-0 ${title || subtitle ? "mt-5 sm:mt-6" : ""}`}>{children}</div>
          </div>

          {footer ? <div className="mt-5 text-center text-sm text-muted sm:mt-6">{footer}</div> : null}
        </div>
      </div>
    </Shell>
  );
}
