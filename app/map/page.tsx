"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import BernDiscoveryMap from "@/components/BernDiscoveryMap";
import Shell from "@/components/Shell";
import { getSafeAuthSession } from "@/lib/authSession";

export default function MapPage() {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const { session } = await getSafeAuthSession();
      setUserId(session?.user?.id ?? null);
    };

    void load();
  }, []);

  return (
    <Shell>
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <section className="rounded-3xl border border-white/10 bg-slate-900/90 px-5 py-4 shadow-xl shadow-black/20 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm uppercase tracking-[0.35em] text-cyan-300">Map</p>
              <h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">Discover places</h1>
              <p className="mt-1 text-sm text-slate-400">Bern &amp; Oberland — tap a pin for posts and stories.</p>
            </div>
            <Link
              href="/rooms/switzerland/bern"
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-cyan-300/40 hover:bg-white/10 hover:text-white"
            >
              Open Bern room
            </Link>
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-white/10 bg-slate-950 shadow-2xl shadow-black/30">
          <BernDiscoveryMap userId={userId} />
        </section>
      </div>
    </Shell>
  );
}
