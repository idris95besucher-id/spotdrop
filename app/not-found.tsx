"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isCapacitorNative } from "@/lib/capacitorUtils";

export default function NotFound() {
  const router = useRouter();

  useEffect(() => {
    if (isCapacitorNative()) {
      router.replace("/profile");
    }
  }, [router]);

  if (isCapacitorNative()) {
    return null;
  }

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-[#050816] px-6 text-center text-white">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <Link href="/profile" className="rounded-full bg-cyan-400 px-5 py-2 text-sm font-semibold text-slate-950">
        Go to profile
      </Link>
    </div>
  );
}
