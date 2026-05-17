"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Globe2, LayoutGrid, LogOut, MessageCircle, Search as SearchIcon, UserRound } from "lucide-react";
import { getSafeAuthSession } from "@/lib/authSession";
import { supabase } from "@/lib/supabaseClient";

const iconClass =
  "h-[18px] w-[18px] shrink-0 text-slate-400 transition-colors group-hover:text-white";

const navLinkClass =
  "group inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800/55 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/35 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 sm:px-2.5";

const signOutClass =
  "group inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-800/55 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/35 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 sm:px-2.5";

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

    fetchSession();

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
  };

  if (loading) {
    return <span className="text-sm text-slate-400">Loading...</span>;
  }

  if (authError) {
    return <span className="text-sm text-amber-200">{authError}</span>;
  }

  if (!session?.user) {
    return (
      <nav className="flex flex-wrap items-center justify-end gap-2 sm:gap-3" aria-label="Main">
        <NavLink href="/rooms" label="Visit" icon={<Globe2 className={iconClass} strokeWidth={1.75} aria-hidden />} />
        <NavLink href="/feed" label="Feed" icon={<LayoutGrid className={iconClass} strokeWidth={1.75} aria-hidden />} />
        <NavLink href="/chats" label="Chats" icon={<MessageCircle className={iconClass} strokeWidth={1.75} aria-hidden />} />
        <NavLink href="/search" label="Search" icon={<SearchIcon className={iconClass} strokeWidth={1.75} aria-hidden />} />
        <Link
          href="/auth/login"
          className="inline-flex items-center rounded-full bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
        >
          Sign in
        </Link>
      </nav>
    );
  }

  return (
    <nav className="flex flex-wrap items-center justify-end gap-2 sm:gap-3" aria-label="Main">
      <NavLink href="/rooms" label="Visit" icon={<Globe2 className={iconClass} strokeWidth={1.75} aria-hidden />} />
      <NavLink href="/feed" label="Feed" icon={<LayoutGrid className={iconClass} strokeWidth={1.75} aria-hidden />} />
      <NavLink href="/chats" label="Chats" icon={<MessageCircle className={iconClass} strokeWidth={1.75} aria-hidden />} />
      <NavLink href="/search" label="Search" icon={<SearchIcon className={iconClass} strokeWidth={1.75} aria-hidden />} />
      <NavLink href="/profile" label="My Profile" icon={<UserRound className={iconClass} strokeWidth={1.75} aria-hidden />} />
      <button type="button" onClick={handleSignOut} className={signOutClass}>
        <LogOut className="h-[18px] w-[18px] shrink-0 text-slate-500 transition-colors group-hover:text-slate-200" strokeWidth={1.75} aria-hidden />
        Sign out
      </button>
    </nav>
  );
}
