"use client";

import Link from "next/link";
import { useI18n } from "@/components/I18nProvider";
import ProfileAvatar from "@/components/ProfileAvatar";
import UsernameWithVerification from "@/components/UsernameWithVerification";
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
  const bio = profile.bio?.trim() || null;

  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="group relative select-none touch-manipulation overflow-hidden rounded-[22px] border border-white/10 bg-gradient-to-br from-slate-900/95 via-slate-900/90 to-slate-950/95 p-4 shadow-lg shadow-black/20 transition duration-200 hover:-translate-y-0.5 hover:border-cyan-300/40 hover:shadow-cyan-950/30 active:scale-[0.99]"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-400/0 via-cyan-400/0 to-cyan-400/0 opacity-0 transition group-hover:opacity-100 group-hover:from-cyan-400/5 group-hover:to-indigo-400/5" />
      <div className="relative flex items-start gap-3.5">
        <ProfileAvatar
          src={profile.avatar_url}
          sizeClassName="h-14 w-14"
          iconClassName="h-6 w-6"
          className="border border-white/10 bg-slate-800 shadow-md shadow-black/30"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="min-w-0 max-w-full">
              <UsernameWithVerification
                username={publicProfileUsername(profile.username)}
                isVerified={profile.is_verified}
                className="text-[16px] font-semibold text-white"
                iconSize={15}
              />
            </h2>
            {isOnline ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {t("common.online")}
              </span>
            ) : null}
          </div>
          {locationLabel ? <p className="mt-1.5 text-[13px] text-slate-300">{locationLabel}</p> : null}
          {bio ? <p className="mt-2 line-clamp-2 text-[12px] leading-snug text-slate-400">{bio}</p> : null}
        </div>
      </div>
    </Link>
  );
}
