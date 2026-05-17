import Link from "next/link";
import type { ReactNode } from "react";
import AuthStatus from "@/components/AuthStatus";

export default function Shell({ children, showHeader = true }: { children: ReactNode; showHeader?: boolean }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        {showHeader ? (
          <header className="mb-8 flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-4 shadow-xl sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Link href="/" className="text-2xl font-semibold text-white">
                SpotDrop
              </Link>
            </div>
            <AuthStatus />
          </header>
        ) : null}
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
