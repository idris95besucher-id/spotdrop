"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserRound } from "lucide-react";
import ProfileAvatar from "@/components/ProfileAvatar";
import SettingsScreenLayout from "@/components/settings/SettingsScreenLayout";
import UsernameWithVerification from "@/components/UsernameWithVerification";
import { SettingsPageHeader } from "@/components/settings/SettingsUI";
import { useI18n } from "@/components/I18nProvider";
import { getSafeAuthSession } from "@/lib/authSession";
import { publicProfileUsername } from "@/lib/publicProfile";
import { syncLocalBlocksToServer, unblockUserOnServer } from "@/lib/userBlocks";
import { supabase } from "@/lib/supabaseClient";

type BlockedProfile = {
  id: string;
  username: string;
  avatar_url: string | null;
  is_verified: boolean | null;
};

export default function BlockedUsersPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [blockedProfiles, setBlockedProfiles] = useState<BlockedProfile[]>([]);
  const [actingId, setActingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      const { session } = await getSafeAuthSession();

      if (!session?.user) {
        router.replace("/auth/login");
        return;
      }

      const blockerId = session.user.id;
      if (active) {
        setViewerId(blockerId);
      }

      const blockedIds = await syncLocalBlocksToServer(blockerId);

      if (blockedIds.length === 0) {
        if (active) {
          setBlockedProfiles([]);
          setLoading(false);
        }

        return;
      }

      const { data } = await supabase
        .from("profiles")
        .select("id, username, avatar_url, is_verified")
        .in("id", blockedIds);

      if (!active) {
        return;
      }

      setBlockedProfiles(
        (data ?? []).map((row) => ({
          id: String(row.id),
          username: String(row.username ?? "user"),
          avatar_url: (row.avatar_url as string | null) ?? null,
          is_verified: (row.is_verified as boolean | null) ?? null,
        }))
      );
      setLoading(false);
    };

    void load();

    return () => {
      active = false;
    };
  }, [router]);

  const handleUnblock = async (userId: string) => {
    if (!viewerId) {
      return;
    }

    setActingId(userId);
    const result = await unblockUserOnServer(viewerId, userId);
    setActingId(null);

    if (result.error) {
      return;
    }

    setBlockedProfiles((current) => current.filter((profile) => profile.id !== userId));
  };

  return (
    <SettingsScreenLayout>
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
                  <ProfileAvatar
                    src={profile.avatar_url}
                    sizeClassName="h-10 w-10"
                    iconClassName="h-4 w-4"
                    className="bg-white/[0.06]"
                  />
                  <div className="min-w-0 flex-1">
                    <UsernameWithVerification
                      username={publicProfileUsername(profile.username)}
                      isVerified={profile.is_verified}
                      className="text-sm font-medium text-white"
                      iconSize={14}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleUnblock(profile.id)}
                    disabled={actingId === profile.id}
                    className="shrink-0 rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/5 disabled:opacity-50"
                  >
                    {t("settings.blocked.unblock")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
    </SettingsScreenLayout>
  );
}
