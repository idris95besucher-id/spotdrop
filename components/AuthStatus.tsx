"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { LayoutGrid, Map as MapIcon, UserRound } from "lucide-react";
import { getSafeAuthSession } from "@/lib/authSession";
import { supabase } from "@/lib/supabaseClient";

const iconClass =
  "h-[18px] w-[18px] shrink-0 text-slate-400 transition-colors group-hover:text-white";

const navLinkClass =
  "group inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800/55 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/35 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 sm:px-2.5";

function NavLink({ href, icon, label }: { href: string; icon: ReactNode; label: string }) {
  return (
    <Link href={href} className={navLinkClass}>
      {icon}
      <span>{label}</span>
    </Link>
  );
}

export default function AuthStatus() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSession = async () => {
      const result = await getSafeAuthSession();
      setSession(result.session);
      setAuthError(result.error);
      setLoading(false);
    };

    const { data: { subscription } = {} } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setAuthError(null);
    });

    void fetchSession();

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  if (loading) {
    return <span className="text-sm text-slate-400">Loading...</span>;
  }

  if (authError) {
    return <span className="text-sm text-amber-200">{authError}</span>;
  }

  const profileHref = session?.user ? "/profile" : "/auth/login";

  return (
    <nav className="flex flex-wrap items-center justify-end gap-2 sm:gap-3" aria-label="Main">
      <NavLink href="/feed" label="Feed" icon={<LayoutGrid className={iconClass} strokeWidth={1.75} aria-hidden />} />
      <NavLink href="/map" label="Map" icon={<MapIcon className={iconClass} strokeWidth={1.75} aria-hidden />} />
      <NavLink href={profileHref} label="Profile" icon={<UserRound className={iconClass} strokeWidth={1.75} aria-hidden />} />
    </nav>
  );
}
