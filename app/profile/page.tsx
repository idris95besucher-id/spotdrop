"use client";

import Link from "next/link";
import { Menu } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { getSafeAuthSession } from "@/lib/authSession";
import { markIntentionalSignOut } from "@/lib/authMessages";
import type { FollowProfile } from "@/lib/follows";
import { loadFollowConnections } from "@/lib/follows";
import { publicProfileUsername } from "@/lib/publicProfile";
import { ensureProfileRow } from "@/lib/profile";
import { uploadAvatarImage } from "@/lib/profileMedia";
import { supabase } from "@/lib/supabaseClient";
import {
  formatProfileLocationLine,
  resolveProfileLocation,
  type ResolvedProfileLocation,
} from "@/lib/profileLocation";
import ProfileAvatarActions from "@/components/ProfileAvatarActions";
import ProfileMenuSheet from "@/components/ProfileMenuSheet";
import { NotificationsBellLink } from "@/components/NotificationsProvider";
import { useSpotDrafts } from "@/components/SpotDraftsProvider";
import ShareProfileSheet from "@/components/ShareProfileSheet";
import ProfileCollectionsTab from "@/components/ProfileCollectionsTab";
import ProfileContentTabs, { type ProfileContentTab } from "@/components/ProfileContentTabs";
import Shell from "@/components/Shell";
import { useI18n } from "@/components/I18nProvider";
import { localizeError } from "@/lib/i18n/localizeError";
import { loadOwnProfileContent, type ProfileContentPost } from "@/lib/profileContent";
import { PROFILE_CONTENT_REFRESH_EVENT } from "@/lib/profileContentRefresh";
import { postIdsEqual } from "@/lib/postIds";
import { buildProfileMenuItems } from "@/lib/profileMenuItems";

type ProfileData = {
  username?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  country_slug?: string | null;
  city_slug?: string | null;
  city_id?: string | null;
};

function withTimeout<T>(promise: Promise<T>, message: string, timeoutMs = 6000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]);
}

export default function ProfilePage() {
  const { t } = useI18n();
  const router = useRouter();
  const { drafts } = useSpotDrafts();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [location, setLocation] = useState<ResolvedProfileLocation>({ countryName: null, cityName: null });
  const [session, setSession] = useState<Session | null>(null);
  const [followers, setFollowers] = useState<FollowProfile[]>([]);
  const [friends, setFriends] = useState<FollowProfile[]>([]);
  const [personalPosts, setPersonalPosts] = useState<ProfileContentPost[]>([]);
  const [spotPosts, setSpotPosts] = useState<ProfileContentPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingConnections, setLoadingConnections] = useState(true);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [activeProfileSection, setActiveProfileSection] = useState<"posts" | "followers" | "friends" | null>("posts");
  const [activeContentTab, setActiveContentTab] = useState<ProfileContentTab>("spots");
  const [connectionsError, setConnectionsError] = useState<string | null>(null);
  const [postsError, setPostsError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [shareProfileOpen, setShareProfileOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentSectionRef = useRef<HTMLElement | null>(null);

  const showSuccessMessage = useCallback((message: string) => {
    if (successTimeoutRef.current) {
      clearTimeout(successTimeoutRef.current);
    }

    setSuccessMessage(message);
    successTimeoutRef.current = setTimeout(() => setSuccessMessage(null), 2000);
  }, []);

  useEffect(() => {
    const didUpdate = window.sessionStorage.getItem("profileUpdated");

    if (!didUpdate) {
      return;
    }

    window.sessionStorage.removeItem("profileUpdated");
    const timeoutId = setTimeout(() => showSuccessMessage(t("profile.updatedSuccess")), 0);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [showSuccessMessage, t]);

  useEffect(() => {
    return () => {
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let profileSettled = false;

    const loadProfile = async () => {
      setLoading(true);
      setLoadingConnections(true);
      setLoadingPosts(true);
      setError(null);
      setConnectionsError(null);
      setPostsError(null);

      const timeoutId = window.setTimeout(() => {
        if (!profileSettled && !cancelled) {
          console.error("Profile load timeout:", JSON.stringify({ page: "/profile" }, null, 2));
          setError(t("profile.loadTimeout"));
          setLoading(false);
          setLoadingConnections(false);
          setLoadingPosts(false);
        }
      }, 7000);

      try {
        const { session, error: sessionError } = await withTimeout(
          getSafeAuthSession(),
          t("profile.sessionTimeout")
        );

        if (cancelled) {
          return;
        }

        setSession(session);

        if (sessionError) {
          setError(sessionError);
          return;
        }

        if (!session?.user) {
          return;
        }

        const ensuredProfile = await withTimeout(
          ensureProfileRow({ user: session.user }),
          t("profile.dataTimeout")
        );

        if (cancelled) {
          return;
        }

        if (ensuredProfile.error && !ensuredProfile.needsOnboarding) {
          setError(ensuredProfile.error);
        }

        if (!ensuredProfile.profile?.username) {
          setError(t("profile.completeFirst"));
          router.push("/onboarding");
          return;
        }

        setProfile(ensuredProfile.profile);
        setLoading(false);

        void resolveProfileLocation(ensuredProfile.profile).then((nextLocation) => {
          if (!cancelled) {
            setLocation(nextLocation);
          }
        });

        const followConnectionsPromise = loadFollowConnections(session.user.id);

        const postsPromise = loadOwnProfileContent(session.user.id);

        try {
          const [followConnectionsResult, profileContentResult] = await withTimeout(
            Promise.all([followConnectionsPromise, postsPromise]),
            t("profile.postsTimeout")
          );

          if (cancelled) {
            return;
          }

          if (profileContentResult.error) {
            console.error("Profile posts load error:", profileContentResult.error);
            setPostsError(profileContentResult.error);
            setPersonalPosts([]);
            setSpotPosts([]);
          } else {
            setPostsError(null);
            setPersonalPosts(profileContentResult.personal);
            setSpotPosts(profileContentResult.spotPosts);
          }

          if (followConnectionsResult.error) {
            console.error("Profile connections load error:", JSON.stringify(followConnectionsResult.error, null, 2));
            setConnectionsError(followConnectionsResult.error);
            setFollowers([]);
            setFriends([]);
          } else {
            setConnectionsError(null);
            setFollowers(followConnectionsResult.data?.followers ?? []);
            setFriends(followConnectionsResult.data?.friends ?? []);
          }
        } catch (secondaryLoadError) {
          console.error("Profile secondary data load error:", JSON.stringify(secondaryLoadError, null, 2));
          setConnectionsError(t("profile.connectionsPartialLoad"));
          setPostsError(t("profile.postsPartialLoad"));
          setPersonalPosts([]);
          setSpotPosts([]);
          setFollowers([]);
          setFriends([]);
        }
      } catch (loadError) {
        console.error("Profile load error:", JSON.stringify(loadError, null, 2));
        setError(
          loadError instanceof Error && loadError.message
            ? localizeError(t, loadError.message) ?? t("profile.unableToLoad")
            : t("profile.unableToLoad")
        );
      } finally {
        profileSettled = true;
        window.clearTimeout(timeoutId);

        if (!cancelled) {
          setLoading(false);
          setLoadingConnections(false);
          setLoadingPosts(false);
        }
      }
    };

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [router, loadAttempt, t]);

  const spotPostsCount = spotPosts.length;
  const followersCount = followers.length;
  const friendsCount = friends.length;
  const activeConnections = activeProfileSection === "friends" ? friends : followers;
  const locationLine = formatProfileLocationLine(location);

  const handlePostDeleted = useCallback((postId: string) => {
    const removePost = (items: ProfileContentPost[]) =>
      items.filter((post) => !postIdsEqual(post.id, postId));

    setPersonalPosts((current) => removePost(current));
    setSpotPosts((current) => removePost(current));
  }, []);

  const refreshProfileContent = useCallback(async () => {
    if (!session?.user?.id) {
      return;
    }

    setLoadingPosts(true);
    setPostsError(null);

    const result = await loadOwnProfileContent(session.user.id);

    if (result.error) {
      setPostsError(result.error);
      setPersonalPosts([]);
      setSpotPosts([]);
    } else {
      setPersonalPosts(result.personal);
      setSpotPosts(result.spotPosts);
    }

    setLoadingPosts(false);
  }, [session?.user?.id]);

  useEffect(() => {
    const handleRefresh = () => {
      void refreshProfileContent();
    };

    window.addEventListener(PROFILE_CONTENT_REFRESH_EVENT, handleRefresh);

    return () => {
      window.removeEventListener(PROFILE_CONTENT_REFRESH_EVENT, handleRefresh);
    };
  }, [refreshProfileContent]);

  const handleAvatarUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!session?.user?.id) {
      setError(t("profile.signInToUpload"));
      event.target.value = "";
      return;
    }

    setUploadingAvatar(true);
    setError(null);

    try {
      const publicUrl = await uploadAvatarImage(session.user.id, file);
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", session.user.id);

      if (updateError) {
        throw new Error(updateError.message || t("profile.unableToSavePhoto"));
      }

      setProfile((currentProfile) =>
        currentProfile ? { ...currentProfile, avatar_url: publicUrl } : { avatar_url: publicUrl }
      );
      showSuccessMessage(t("profile.photoUpdated"));
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? localizeError(t, uploadError.message) ?? t("profile.unableToUploadPhoto")
          : t("profile.unableToUploadPhoto")
      );
    } finally {
      setUploadingAvatar(false);
      event.target.value = "";
    }
  };

  const handleSignOut = useCallback(async () => {
    markIntentionalSignOut();
    await supabase.auth.signOut();
    router.replace("/auth/login");
  }, [router]);

  const handleOpenCollections = useCallback(() => {
    setActiveProfileSection("posts");
    setActiveContentTab("collections");
    window.requestAnimationFrame(() => {
      contentSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const profileMenuItems = useMemo(
    () =>
      buildProfileMenuItems(
        {
          draftCount: drafts.length,
          onOpenCollections: handleOpenCollections,
          onSignOut: () => void handleSignOut(),
        },
        t
      ),
    [drafts.length, handleOpenCollections, handleSignOut, t]
  );

  return (
    <Shell flushTop>
      {successMessage ? (
        <div className="fixed inset-x-4 top-4 z-50 mx-auto max-w-sm rounded-3xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-center text-sm font-medium text-emerald-200 shadow-lg shadow-black/30">
          {successMessage}
        </div>
      ) : null}

      <div className="mx-auto max-w-lg px-4 pb-6 pt-0 sm:max-w-xl">
        <header className="flex items-center justify-between pb-3 pt-[max(0.375rem,env(safe-area-inset-top))]">
          <h1 className="text-[1.75rem] font-bold tracking-[-0.03em] text-white">
            Spot<span className="text-primary">Drop</span>
          </h1>
          {session?.user && !loading && !error ? (
            <div className="flex items-center gap-1">
              <NotificationsBellLink className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white transition hover:bg-white/10 active:opacity-80" />
              <button
                type="button"
                onClick={() => setProfileMenuOpen(true)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white transition hover:bg-white/10 active:opacity-80"
                aria-label={t("profile.openProfileMenu")}
              >
                <Menu className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              </button>
            </div>
          ) : (
            <span className="h-9 w-9 shrink-0" aria-hidden />
          )}
        </header>

        <section className="text-center">
          <div className="flex flex-col items-center gap-1.5">
            {session?.user && !loading ? (
              <ProfileAvatarActions
                userId={session.user.id}
                avatarUrl={profile?.avatar_url}
                uploadingAvatar={uploadingAvatar}
                onAvatarUpload={handleAvatarUpload}
                onStoryCreated={() => showSuccessMessage(t("profile.storyShared"))}
              />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border border-primary/20 bg-card shadow-lg shadow-primary/10 sm:h-28 sm:w-28" />
            )}

            {!loading && profile?.username ? (
              <h1 className="max-w-full truncate text-lg font-semibold text-white">
                {publicProfileUsername(profile.username)}
              </h1>
            ) : null}

            {session?.user && !loading && !error ? (
              <div className="flex items-center justify-center gap-7 sm:gap-9">
                <button
                  type="button"
                  onClick={() => {
                    setActiveProfileSection("posts");
                    setActiveContentTab("spots");
                  }}
                  className={`flex min-w-[3.25rem] flex-col items-center gap-0.5 transition ${
                    activeProfileSection === "posts" ? "text-white" : "text-muted hover:text-white"
                  }`}
                >
                  <span className="text-base font-semibold tabular-nums text-white sm:text-lg">{spotPostsCount}</span>
                  <span className="text-xs">{t("profile.spots")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveProfileSection("followers")}
                  className={`flex min-w-[3.25rem] flex-col items-center gap-0.5 transition ${
                    activeProfileSection === "followers" ? "text-white" : "text-muted hover:text-white"
                  }`}
                >
                  <span className="text-base font-semibold tabular-nums text-white sm:text-lg">{followersCount}</span>
                  <span className="text-xs">{t("profile.followers")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveProfileSection("friends")}
                  className={`flex min-w-[3.25rem] flex-col items-center gap-0.5 transition ${
                    activeProfileSection === "friends" ? "text-white" : "text-muted hover:text-white"
                  }`}
                >
                  <span className="text-base font-semibold tabular-nums text-white sm:text-lg">{friendsCount}</span>
                  <span className="text-xs">{t("profile.friends")}</span>
                </button>
              </div>
            ) : null}

            {profile?.bio ? (
              <p className="max-w-sm line-clamp-2 text-xs leading-relaxed text-slate-400">{profile.bio}</p>
            ) : null}

            {locationLine ? (
              <p className="max-w-sm truncate text-xs font-medium text-slate-400">{locationLine}</p>
            ) : null}

            {loading ? (
              <p className="text-xs text-slate-500">{t("profile.loading")}</p>
            ) : error ? (
              <div className="w-full space-y-3 rounded-2xl border border-red-500/20 bg-red-500/5 p-4">
                <p className="text-sm text-red-300">{localizeError(t, error) ?? error}</p>
                <button
                  type="button"
                  onClick={() => setLoadAttempt((current) => current + 1)}
                  className="inline-flex rounded-full bg-primary px-4 py-2 text-xs font-semibold text-background transition hover:brightness-110"
                >
                  {t("common.tryAgain")}
                </button>
              </div>
            ) : !session?.user ? (
              <div className="w-full space-y-3 rounded-2xl border border-dashed border-primary/15 bg-card/60 p-5">
                <p className="text-sm font-medium text-white">{t("profile.notSignedIn")}</p>
                <p className="text-xs text-muted">{t("profile.signInPrompt")}</p>
                <Link
                  href="/auth/login"
                  className="inline-flex rounded-full bg-primary px-5 py-2 text-xs font-semibold text-background transition hover:brightness-110"
                >
                  {t("profile.loginNow")}
                </Link>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-center gap-2 pt-0.5">
                <Link
                  href="/profile/edit"
                  className="inline-flex shrink-0 items-center justify-center rounded-full border border-white/15 px-3.5 py-1.5 text-xs font-medium text-slate-200 transition hover:border-white/25 hover:bg-white/5 hover:text-white"
                >
                  {t("profile.editProfile")}
                </Link>
                <button
                  type="button"
                  onClick={() => setShareProfileOpen(true)}
                  className="inline-flex shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10 px-3.5 py-1.5 text-xs font-medium text-primary transition hover:border-primary/50 hover:bg-primary/15"
                >
                  {t("profile.shareProfile")}
                </button>
              </div>
            )}
          </div>
        </section>

        {session?.user && activeProfileSection && activeProfileSection !== "posts" ? (
          <section className="mt-3 space-y-2">
            {loadingConnections ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={`connection-loading-${index}`} className="rounded-3xl border border-white/10 bg-slate-900 p-5">
                    <div className="animate-pulse">
                      <div className="flex items-center gap-4">
                        <div className="h-14 w-14 rounded-full bg-slate-800" />
                        <div className="flex-1 space-y-2">
                          <div className="h-4 w-32 rounded-full bg-slate-800" />
                          <div className="h-3 w-20 rounded-full bg-slate-800/70" />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : connectionsError ? (
              <div className="rounded-3xl border border-red-500/20 bg-red-500/5 p-6 text-sm text-red-200">
                {localizeError(t, connectionsError) ?? connectionsError}
              </div>
            ) : activeConnections.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-700 bg-slate-900/60 p-8 text-center text-slate-400">
                {activeProfileSection === "followers" ? t("profile.noFollowersYet") : t("profile.noFriendsYet")}
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {activeConnections.map((person) => (
                  <Link
                    key={person.id}
                    href={`/user/${person.id}`}
                    className="flex items-center gap-4 rounded-3xl border border-white/10 bg-slate-900 p-5 transition hover:-translate-y-0.5 hover:border-cyan-300/40 hover:bg-slate-900/80"
                  >
                    <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-slate-800 text-lg font-semibold text-white">
                      {person.avatar_url ? (
                        <img src={person.avatar_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        publicProfileUsername(person.username).charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-white">{publicProfileUsername(person.username)}</p>
                      <p className="mt-1 text-sm text-slate-400">
                        {activeProfileSection === "followers" ? t("profile.followsYou") : t("profile.mutualFollow")}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {session?.user && (activeProfileSection === "posts" || activeProfileSection === null) ? (
          <section ref={contentSectionRef} className="-mx-4 mt-2 scroll-mt-2 sm:mx-0">
            {postsError ? (
              <div className="mx-4 mb-2 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-3 py-3 text-xs text-amber-100 sm:mx-0">
                <p>{localizeError(t, postsError) ?? postsError}</p>
                <button
                  type="button"
                  onClick={() => void refreshProfileContent()}
                  className="mt-2 inline-flex rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-slate-200"
                >
                  {t("common.tryAgain")}
                </button>
              </div>
            ) : null}
            <ProfileContentTabs
              compact
              activeTab={activeContentTab}
              onTabChange={setActiveContentTab}
              personalPosts={personalPosts}
              spotPosts={spotPosts}
              loading={loadingPosts}
              emptyPostsMessage={t("profile.noPostsYet")}
              emptySpotsMessage={t("profile.noPublicSpotsYet")}
              viewerUserId={session.user.id}
              onPostDeleted={handlePostDeleted}
              viewerAuthor={
                profile?.username
                  ? {
                      username: publicProfileUsername(profile.username),
                      avatar_url: profile.avatar_url,
                    }
                  : null
              }
              collectionsPanel={
                <ProfileCollectionsTab userId={session.user.id} viewerId={session.user.id} isOwner />
              }
            />
          </section>
        ) : null}
      </div>

      {profile?.username ? (
        <ShareProfileSheet
          isOpen={shareProfileOpen}
          onClose={() => setShareProfileOpen(false)}
          username={profile.username}
        />
      ) : null}

      <ProfileMenuSheet
        isOpen={profileMenuOpen}
        onClose={() => setProfileMenuOpen(false)}
        items={profileMenuItems}
        title={t("menu.title")}
      />
    </Shell>
  );
}
