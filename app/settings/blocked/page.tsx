"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserRound } from "lucide-react";
import Shell from "@/components/Shell";
import { SettingsPageHeader } from "@/components/settings/SettingsUI";
import { useI18n } from "@/components/I18nProvider";
import { getSafeAuthSession } from "@/lib/authSession";
import { publicProfileUsername } from "@/lib/publicProfile";
import { loadUserSettingsPreferences, unblockUser } from "@/lib/settingsPreferences";
import { supabase } from "@/lib/supabaseClient";

type BlockedProfile = {
  id: string;
  username: string;
  avatar_url: string | null;
};

export default function BlockedUsersPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [blockedProfiles, setBlockedProfiles] = useState<BlockedProfile[]>([]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      const { session } = await getSafeAuthSession();

      if (!session?.user) {
        router.replace("/auth/login");
        return;
      }

      const prefs = loadUserSettingsPreferences();
      const blockedIds = prefs.blockedUserIds;

      if (blockedIds.length === 0) {
        if (active) {
          setBlockedProfiles([]);
          setLoading(false);
        }

        return;
      }

      const { data } = await supabase
        .from("profiles")
        .select("id, username, avatar_url")
        .in("id", blockedIds);

      if (!active) {
        return;
      }

      setBlockedProfiles(
        (data ?? []).map((row) => ({
          id: String(row.id),
          username: String(row.username ?? "user"),
          avatar_url: (row.avatar_url as string | null) ?? null,
        }))
      );
      setLoading(false);
    };

    void load();

    return () => {
      active = false;
    };
  }, [router]);

  const handleUnblock = (userId: string) => {
    unblockUser(userId);
    setBlockedProfiles((current) => current.filter((profile) => profile.id !== userId));
  };

  return (
    <Shell>
      <div className="mx-auto max-w-lg space-y-6 px-1 pb-10 pt-2">
        <SettingsPageHeader title={t("settings.blocked.title")} />

        <div className="rounded-2xl border border-white/[0.08] bg-[#0B1026]">
          {loading ? (
            <p className="px-4 py-6 text-sm text-muted">{t("settings.blocked.loading")}</p>
          ) : blockedProfiles.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <UserRound className="mx-auto h-8 w-8 text-muted" strokeWidth={1.5} aria-hidden />
              <p className="mt-3 text-sm font-medium text-white">{t("settings.blocked.empty")}</p>
              <p className="mt-1 text-xs text-muted">{t("settings.blocked.emptyBody")}</p>
            </div>
          ) : (
            <ul className="divide-y divide-white/[0.06]">
              {blockedProfiles.map((profile) => (
                <li key={profile.id} className="flex items-center gap-3 px-4 py-3.5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/[0.06]">
                    {profile.avatar_url ? (
                      <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <UserRound className="h-4 w-4 text-muted" aria-hidden />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">
                      {publicProfileUsername(profile.username)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleUnblock(profile.id)}
                    className="shrink-0 rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/5"
                  >
                    {t("settings.blocked.unblock")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Shell>
  );
}
