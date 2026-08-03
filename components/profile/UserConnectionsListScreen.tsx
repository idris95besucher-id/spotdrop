"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import MobileSecondaryHeader from "@/components/MobileSecondaryHeader";
import NavigationStackScreen from "@/components/NavigationStackScreen";
import ProfileAvatar from "@/components/ProfileAvatar";
import Shell from "@/components/Shell";
import { useI18n } from "@/components/I18nProvider";
import { localizeError } from "@/lib/i18n/localizeError";
import { loadFollowConnections, type FollowProfile } from "@/lib/follows";
import { MOBILE_BOTTOM_NAV_PADDING, MOBILE_MAIN_SCROLL_CLASS } from "@/lib/mobileLayout";
import { publicProfileUsername } from "@/lib/publicProfile";

type UserConnectionsListScreenProps = {
  ownerUserId: string;
  listType: "followers" | "friends";
  backHref: string;
};

export default function UserConnectionsListScreen({
  ownerUserId,
  listType,
  backHref,
}: UserConnectionsListScreenProps) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [people, setPeople] = useState<FollowProfile[]>([]);

  const title = listType === "followers" ? t("profile.followers") : t("profile.friends");
  const emptyMessage =
    listType === "followers" ? t("profile.noFollowersYet") : t("profile.noFriendsYet");

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError(null);

      const { data, error: loadError } = await loadFollowConnections(ownerUserId);

      if (!active) {
        return;
      }

      if (loadError || !data) {
        setPeople([]);
        setError(loadError ?? "Unable to load users.");
        setLoading(false);
        return;
      }

      setPeople(listType === "followers" ? data.followers : data.friends);
      setLoading(false);
    };

    void load();

    return () => {
      active = false;
    };
  }, [listType, ownerUserId]);

  return (
    <Shell showHeader={false} flushTop fixedLayout>
      <NavigationStackScreen
        fallbackHref={backHref}
        preferFallback
        className="min-h-0 flex-1"
      >
        <MobileSecondaryHeader title={title} backHref={backHref} />
        <div className={`${MOBILE_MAIN_SCROLL_CLASS} ${MOBILE_BOTTOM_NAV_PADDING}`}>
          <div className="space-y-2 px-4 py-4">
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={`connection-loading-${index}`}
                    className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/80 p-3"
                  >
                    <div className="h-12 w-12 animate-pulse rounded-full bg-slate-800" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="h-4 w-28 animate-pulse rounded-full bg-slate-800" />
                      <div className="h-3 w-20 animate-pulse rounded-full bg-slate-800/70" />
                    </div>
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-200">
                {localizeError(t, error) ?? error}
              </div>
            ) : people.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/60 p-8 text-center text-sm text-slate-400">
                {emptyMessage}
              </div>
            ) : (
              <div className="space-y-2">
                {people.map((person) => {
                  const displayName = person.name?.trim() || null;

                  return (
                    <Link
                      key={person.id}
                      href={`/user?id=${encodeURIComponent(person.id)}`}
                      className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/80 p-3 transition hover:border-cyan-300/40 hover:bg-slate-900 active:opacity-80"
                    >
                      <ProfileAvatar
                        src={person.avatar_url}
                        sizeClassName="h-12 w-12"
                        iconClassName="h-5 w-5"
                        className="bg-slate-800"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-semibold text-white">
                          {publicProfileUsername(person.username)}
                        </p>
                        {displayName ? (
                          <p className="mt-0.5 truncate text-[13px] text-slate-400">{displayName}</p>
                        ) : null}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </NavigationStackScreen>
    </Shell>
  );
}
