"use client";

import Link from "next/link";
import { Megaphone, Menu } from "lucide-react";
import ProfileAvatar from "@/components/ProfileAvatar";
import ProfileGalleryAvatarLink from "@/components/profile/ProfileGalleryAvatarLink";
import UsernameWithVerification from "@/components/UsernameWithVerification";
import { normalizeAvatarUrl } from "@/lib/avatarUrl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { getSafeAuthSession } from "@/lib/authSession";
import { markIntentionalSignOut } from "@/lib/authMessages";
import { unregisterPushBeforeSignOut } from "@/lib/nativePush";
import type { FollowProfile } from "@/lib/follows";
import { loadFollowConnections } from "@/lib/follows";
import { publicProfileUsername } from "@/lib/publicProfile";
import { ensureProfileRow } from "@/lib/profile";
import { supabase } from "@/lib/supabaseClient";
import {
  formatProfileLocationLineLocalized,
  resolveProfileLocation,
  type ResolvedProfileLocation,
} from "@/lib/profileLocation";
import ProfileSavedTab from "@/components/ProfileSavedTab";
import ProfileMySpotsTab from "@/components/ProfileMySpotsTab";
import ProfileMenuSheet from "@/components/ProfileMenuSheet";
import ShareProfileSheet from "@/components/ShareProfileSheet";
import ProfileContentTabs, {
  normalizeProfileMainTab,
  type ProfileMainTab,
} from "@/components/ProfileContentTabs";
import ProfileAppHeader from "@/components/profile/ProfileAppHeader";
import Shell from "@/components/Shell";
import { useI18n } from "@/components/I18nProvider";
import { localizeError } from "@/lib/i18n/localizeError";
import { loadOwnProfileContent, type ProfileContentPost } from "@/lib/profileContent";
import {
  loadProfileGalleryVisibility,
  type ProfileGalleryVisibility,
} from "@/lib/profileGalleryVisibility";
import { PROFILE_CONTENT_REFRESH_EVENT, PROFILE_FOLLOWERS_REFRESH_EVENT, PROFILE_META_REFRESH_EVENT } from "@/lib/profileContentRefresh";
import { postIdsEqual } from "@/lib/postIds";
import { useNotifications } from "@/components/NotificationsProvider";
import { buildProfileMenuItems } from "@/lib/profileMenuItems";

type ProfileData = {
  username?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  country_slug?: string | null;
  city_slug?: string | null;
  city_id?: string | null;
  is_official?: boolean | null;
  is_verified?: boolean | null;
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
  const { t, locale } = useI18n();
  const router = useRouter();
  const { unreadCount: notificationsUnreadCount } = useNotifications();
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
  const [activeContentTab, setActiveContentTab] = useState<ProfileMainTab>("spots");
  const [connectionsError, setConnectionsError] = useState<string | null>(null);
  const [postsError, setPostsError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [shareProfileOpen, setShareProfileOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [galleryVisibility, setGalleryVisibility] = useState<ProfileGalleryVisibility>("everyone");
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showSuccessMessage = useCallback((message: string) => {
    if (successTimeoutRef.current) {
      clearTimeout(successTimeoutRef.current);
    }

    setSuccessMessage(message);
    successTimeoutRef.current = setTimeout(() => setSuccessMessage(null), 2000);
  }, []);

  useEffect(() => {
    const tab = window.sessionStorage.getItem("spotdrop:profile-tab");

    if (tab === "spots" || tab === "my-spots" || tab === "saved" || tab === "collections") {
      window.sessionStorage.removeItem("spotdrop:profile-tab");
      setActiveProfileSection("posts");
      setActiveContentTab(normalizeProfileMainTab(tab === "collections" ? "saved" : tab));
    }

    const needsPublishRefresh = window.sessionStorage.getItem("spotdrop:profile-refresh-after-publish");

    if (needsPublishRefresh) {
      window.sessionStorage.removeItem("spotdrop:profile-refresh-after-publish");
      // Content reload runs via PROFILE_CONTENT_REFRESH_EVENT and/or the session load below.
    }
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

        setProfile({
          ...ensuredProfile.profile,
          avatar_url: normalizeAvatarUrl(ensuredProfile.profile.avatar_url),
        });
        setLoading(false);

        void loadProfileGalleryVisibility(session.user.id).then((visibility) => {
          if (!cancelled) {
            setGalleryVisibility(visibility);
          }
        });

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
  const locationLine = formatProfileLocationLineLocalized(location, locale);

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

  const refreshFollowers = useCallback(async () => {
    if (!session?.user?.id) {
      return;
    }

    setLoadingConnections(true);
    setConnectionsError(null);

    const followConnectionsResult = await loadFollowConnections(session.user.id);

    if (followConnectionsResult.error) {
      setConnectionsError(followConnectionsResult.error);
      setFollowers([]);
      setFriends([]);
    } else {
      setFollowers(followConnectionsResult.data?.followers ?? []);
      setFriends(followConnectionsResult.data?.friends ?? []);
    }

    setLoadingConnections(false);
  }, [session?.user?.id]);

  useEffect(() => {
    const handleRefresh = (event: Event) => {
      const detail = (event as CustomEvent<{ tab?: "spots" | "my-spots" | "saved" }>).detail;

      if (detail?.tab === "spots" || detail?.tab === "my-spots" || detail?.tab === "saved") {
        setActiveProfileSection("posts");
        setActiveContentTab(detail.tab);
      }

      void refreshProfileContent();
    };

    window.addEventListener(PROFILE_CONTENT_REFRESH_EVENT, handleRefresh);

    return () => {
      window.removeEventListener(PROFILE_CONTENT_REFRESH_EVENT, handleRefresh);
    };
  }, [refreshProfileContent]);

  useEffect(() => {
    const handleFollowersRefresh = () => {
      void refreshFollowers();
    };

    window.addEventListener(PROFILE_FOLLOWERS_REFRESH_EVENT, handleFollowersRefresh);

    return () => {
      window.removeEventListener(PROFILE_FOLLOWERS_REFRESH_EVENT, handleFollowersRefresh);
    };
  }, [refreshFollowers]);

  useEffect(() => {
    const handleMetaRefresh = () => {
      void (async () => {
        const { session: activeSession } = await getSafeAuthSession();

        if (!activeSession?.user) {
          return;
        }

        const { data } = await supabase
          .from("profiles")
          .select("avatar_url")
          .eq("id", activeSession.user.id)
          .maybeSingle();

        // Always apply — including explicit null after profile photo deletion.
        setProfile((current) =>
          current
            ? { ...current, avatar_url: normalizeAvatarUrl(data?.avatar_url) }
            : current
        );
      })();
    };

    window.addEventListener(PROFILE_META_REFRESH_EVENT, handleMetaRefresh);

    return () => {
      window.removeEventListener(PROFILE_META_REFRESH_EVENT, handleMetaRefresh);
    };
  }, []);

  const handleSignOut = useCallback(async () => {
    markIntentionalSignOut();

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const userId = session?.user?.id;

    if (userId) {
      await unregisterPushBeforeSignOut(userId);
    }

    await supabase.auth.signOut();
    router.replace("/auth/login");
  }, [router]);

  const profileMenuItems = useMemo(
    () =>
      buildProfileMenuItems(
        {
          onSignOut: () => void handleSignOut(),
          notificationsUnreadCount,
        },
        t
      ),
    [handleSignOut, notificationsUnreadCount, t]
  );

  return (
    <Shell
      flushTop
      fixedLayout
      topBar={
        <ProfileAppHeader
          actions={
            session?.user && !loading && !error ? (
              <button
                type="button"
                onClick={() => setProfileMenuOpen(true)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-white transition hover:bg-white/10 active:opacity-80"
                aria-label={t("profile.openProfileMenu")}
              >
                <Menu className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              </button>
            ) : undefined
          }
        />
      }
    >
      {successMessage ? (
        <div className="fixed inset-x-4 top-[calc(env(safe-area-inset-top,0px)+1rem)] z-50 mx-auto max-w-sm rounded-3xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-center text-sm font-medium text-emerald-200 shadow-lg shadow-black/30">
          {successMessage}
        </div>
      ) : null}

      {/* Single scroll surface: header collapses; Posts/Saved tabs stay sticky. */}
      <div
        data-mobile-main-scroll=""
        className="flex-1 min-h-0 w-full min-w-0 max-w-full overflow-x-hidden overflow-y-auto overscroll-y-contain touch-pan-y [-webkit-overflow-scrolling:touch]"
      >
      <div className="profile-header-enter mx-auto w-full min-w-0 max-w-lg px-4 pt-2 pb-2">
        <section className="text-center">
          <div className="flex flex-col items-center gap-0.5">
            {session?.user && !loading ? (
              <div className="profile-header-avatar">
                {profile?.is_official === true ? (
                  <ProfileAvatar
                    src={normalizeAvatarUrl(profile?.avatar_url)}
                    sizeClassName="h-14 w-14"
                    className="border border-white/10 shadow-xl shadow-black/50"
                  />
                ) : (
                  <ProfileGalleryAvatarLink
                    key={normalizeAvatarUrl(profile?.avatar_url) ?? "no-avatar"}
                    avatarUrl={normalizeAvatarUrl(profile?.avatar_url)}
                    ownerUserId={session.user.id}
                    viewerUserId={session.user.id}
                    visibility={galleryVisibility}
                    showLabel
                  />
                )}
              </div>
            ) : (
              <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-primary/20 bg-card shadow-lg shadow-primary/10" />
            )}

            {!loading && profile?.username ? (
              <h1 className="profile-header-rise max-w-full">
                <UsernameWithVerification
                  username={publicProfileUsername(profile.username)}
                  isVerified={profile.is_verified}
                  className="text-base font-semibold text-white"
                  iconSize={15}
                />
              </h1>
            ) : null}

            {session?.user && !loading && !error && profile?.is_official !== true ? (
              <div className="profile-header-rise-delay mt-2 grid w-full grid-cols-3 items-center">
                <button
                  type="button"
                  onClick={() => setActiveProfileSection("posts")}
                  className="flex flex-col items-center justify-center gap-0.5 py-1 transition active:opacity-70"
                >
                  <span className="text-[17px] font-bold leading-none tabular-nums text-white">
                    {spotPostsCount}
                  </span>
                  <span
                    className={`text-[12px] leading-none ${
                      activeProfileSection === "posts" ? "text-slate-300" : "text-muted"
                    }`}
                  >
                    {t("profile.posts")}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveProfileSection("followers")}
                  className="flex flex-col items-center justify-center gap-0.5 py-1 transition active:opacity-70"
                >
                  <span className="text-[17px] font-bold leading-none tabular-nums text-white">
                    {followersCount}
                  </span>
                  <span
                    className={`text-[12px] leading-none ${
                      activeProfileSection === "followers" ? "text-slate-300" : "text-muted"
                    }`}
                  >
                    {t("profile.followers")}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveProfileSection("friends")}
                  className="flex flex-col items-center justify-center gap-0.5 py-1 transition active:opacity-70"
                >
                  <span className="text-[17px] font-bold leading-none tabular-nums text-white">
                    {friendsCount}
                  </span>
                  <span
                    className={`text-[12px] leading-none ${
                      activeProfileSection === "friends" ? "text-slate-300" : "text-muted"
                    }`}
                  >
                    {t("profile.friends")}
                  </span>
                </button>
              </div>
            ) : null}

            {profile?.bio ? (
              profile?.is_official === true ? (
                <p className="profile-header-rise-delay mx-auto mt-3 max-w-[340px] text-center text-[17px] leading-6 text-slate-300">
                  {profile.bio}
                </p>
              ) : (
                <p className="profile-header-rise-delay max-w-sm line-clamp-1 text-[11px] leading-snug text-slate-400">
                  {profile.bio}
                </p>
              )
            ) : null}

            {locationLine ? (
              <p className="profile-header-rise-delay max-w-sm truncate text-[11px] text-slate-400">
                {locationLine}
              </p>
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
              <div
                className={
                  profile?.is_official === true
                    ? "profile-header-rise-delay-2 mt-5 flex flex-wrap items-center justify-center gap-4"
                    : "profile-header-rise-delay-2 flex flex-wrap items-center justify-center gap-1.5"
                }
              >
                <Link
                  href="/profile/edit"
                  className="inline-flex shrink-0 items-center justify-center rounded-full border border-white/15 px-3 py-1 text-[11px] font-medium text-slate-200 transition hover:border-white/25 hover:bg-white/5 hover:text-white"
                >
                  {t("profile.editProfile")}
                </Link>
                <button
                  type="button"
                  onClick={() => setShareProfileOpen(true)}
                  className="inline-flex shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary transition hover:border-primary/50 hover:bg-primary/15"
                >
                  {t("profile.shareProfile")}
                </button>
              </div>
            )}
          </div>
        </section>
      </div>

        {session?.user && activeProfileSection && activeProfileSection !== "posts" ? (
          <section className="mt-3 space-y-2 px-4">
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
                    href={`/user?id=${person.id}`}
                    className="flex items-center gap-4 rounded-3xl border border-white/10 bg-slate-900 p-5 transition hover:border-cyan-300/40 hover:bg-slate-900/80"
                  >
                    <ProfileAvatar
                      src={person.avatar_url}
                      sizeClassName="h-14 w-14"
                      iconClassName="h-6 w-6"
                      className="bg-slate-800"
                    />
                    <div className="min-w-0">
                      <UsernameWithVerification
                        username={publicProfileUsername(person.username)}
                        isVerified={person.is_verified}
                        className="text-base font-semibold text-white"
                        iconSize={15}
                      />
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
          <>
            {postsError ? (
              <div className="mb-2 mx-4 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-3 py-3 text-xs text-amber-100">
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
              stickyTabBar
              compact
              showPrivateTabs={!profile?.is_official}
              activeTab={activeContentTab}
              onTabChange={setActiveContentTab}
              personalPosts={personalPosts}
              spotPosts={spotPosts}
              loading={loadingPosts}
              emptySpotsMessage={profile?.is_official ? t("profile.officialNoPostsYet") : t("profile.noPostsYet")}
              emptySpotsSubtitle={profile?.is_official ? t("profile.officialNoPostsYetSubtitle") : undefined}
              emptyState={
                profile?.is_official === true ? (
                  <div className="mx-5">
                    <Link
                      href="/official-channel"
                      className="profile-header-enter mx-auto flex max-w-[420px] flex-col items-center justify-center gap-3 rounded-[28px] border border-primary/15 bg-slate-900/60 px-6 py-8 text-center transition active:scale-[0.99] active:bg-slate-900/80"
                    >
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                        <Megaphone className="h-7 w-7 text-primary" strokeWidth={1.75} aria-hidden />
                      </div>
                      <p className="text-[15px] font-semibold text-white">{t("profile.officialChannelCardTitle")}</p>
                      <p className="max-w-[16rem] text-[13px] leading-relaxed text-muted">
                        {t("profile.officialChannelCardDescription")}
                      </p>
                      <span className="mt-1 inline-flex items-center justify-center rounded-full bg-primary px-5 py-2 text-xs font-semibold text-background transition hover:brightness-110">
                        {t("profile.officialChannelCardButton")}
                      </span>
                    </Link>
                  </div>
                ) : undefined
              }
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
              mySpotsPanel={
                <ProfileMySpotsTab
                  userId={session.user.id}
                  viewerAuthor={
                    profile?.username
                      ? {
                          username: publicProfileUsername(profile.username),
                          avatar_url: profile.avatar_url,
                        }
                      : null
                  }
                />
              }
              savedPanel={
                <ProfileSavedTab
                  userId={session.user.id}
                  viewerAuthor={
                    profile?.username
                      ? {
                          username: publicProfileUsername(profile.username),
                          avatar_url: profile.avatar_url,
                        }
                      : null
                  }
                />
              }
            />
          </>
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
