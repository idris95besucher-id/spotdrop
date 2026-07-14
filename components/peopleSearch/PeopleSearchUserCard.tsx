"use client";

import Link from "next/link";
import { UserRound } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import type { PeopleSearchProfile } from "@/lib/peopleSearch";
import { publicProfileUsername } from "@/lib/publicProfile";

type PeopleSearchUserCardProps = {
  profile: PeopleSearchProfile;
  locationLabel?: string | null;
  isOnline?: boolean;
  /** Called before navigation so scroll/filters can be persisted. */
  onNavigate?: () => void;
};

export default function PeopleSearchUserCard({
  profile,
  locationLabel = null,
  isOnline = false,
  onNavigate,
}: PeopleSearchUserCardProps) {
  const { t } = useI18n();
  const href = `/user?id=${encodeURIComponent(profile.id)}`;

  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="group relative select-none touch-manipulation overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-br from-slate-900/95 via-slate-900/90 to-slate-950/95 p-5 shadow-lg shadow-black/20 transition duration-200 hover:-translate-y-0.5 hover:border-cyan-300/40 hover:shadow-cyan-950/30 active:scale-[0.99]"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-400/0 via-cyan-400/0 to-cyan-400/0 opacity-0 transition group-hover:opacity-100 group-hover:from-cyan-400/5 group-hover:to-indigo-400/5" />
      <div className="relative flex items-start gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-slate-800 text-xl font-semibold text-white shadow-md shadow-black/30">
          {profile.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <UserRound className="h-7 w-7 text-slate-400" strokeWidth={1.5} aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-lg font-semibold text-white">
              {publicProfileUsername(profile.username)}
            </h2>
            {isOnline ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                {t("common.online")}
              </span>
            ) : null}
          </div>
          {locationLabel ? <p className="mt-3 text-sm text-slate-300">{locationLabel}</p> : null}
          <p className="mt-4 text-sm font-medium text-cyan-300 transition group-hover:text-cyan-200">
            {t("profile.viewProfile")}
          </p>
        </div>
      </div>
    </Link>
  );
}
