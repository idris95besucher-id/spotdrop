"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { UserRound, X } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { checkCanMessageUser } from "@/lib/messagePrivacy";
import type { LiveMapUser } from "@/lib/userLiveLocation";
import { supabase } from "@/lib/supabaseClient";

type LiveMapUserSheetProps = {
  user: LiveMapUser | null;
  onClose: () => void;
};

function locationLine(user: LiveMapUser) {
  const parts = [user.city, user.country].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

export default function LiveMapUserSheet({ user, onClose }: LiveMapUserSheetProps) {
  const { t } = useI18n();
  const [canMessage, setCanMessage] = useState(false);

  useEffect(() => {
    if (!user) {
      setCanMessage(false);
      return;
    }

    let cancelled = false;

    const loadMessagePermission = async () => {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (cancelled || !authUser || authUser.id === user.user_id) {
        setCanMessage(false);
        return;
      }

      const permission = await checkCanMessageUser(authUser.id, user.user_id);

      if (!cancelled) {
        setCanMessage(permission.allowed);
      }
    };

    void loadMessagePermission();

    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user) {
    return null;
  }

  const place = locationLine(user);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-4">
      <button type="button" className="absolute inset-0 bg-black/50" aria-label={t("map.closeProfileCard")} onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-t-3xl border border-white/10 bg-slate-950 shadow-2xl md:rounded-3xl">
        <div className="flex justify-center pt-2 md:hidden">
          <span className="h-1 w-10 rounded-full bg-white/20" />
        </div>

        <div className="flex items-start justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-cyan-400/40 bg-slate-800 text-white">
              {user.avatar_url ? (
                <img src={user.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <UserRound className="h-6 w-6 text-slate-400" strokeWidth={1.5} aria-hidden />
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-white">@{user.username}</p>
              {place ? <p className="truncate text-sm text-slate-400">{place}</p> : null}
              <p className="mt-1 text-xs font-medium text-cyan-300">{t("map.userOnline")}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"
            aria-label={t("common.close")}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className={`grid gap-2.5 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] ${canMessage ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>
          <Link
            href={`/user/${user.user_id}`}
            className="inline-flex w-full items-center justify-center rounded-full bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
            onClick={onClose}
          >
            {t("profile.viewProfile")}
          </Link>
          {canMessage ? (
            <Link
              href={`/dm/${user.user_id}`}
              className="inline-flex w-full items-center justify-center rounded-full border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              onClick={onClose}
            >
              {t("profile.message")}
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
