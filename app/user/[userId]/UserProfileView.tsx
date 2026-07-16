"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { MoreVertical, UserMinus } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { localizeError } from "@/lib/i18n/localizeError";
import { getSafeAuthSession } from "@/lib/authSession";
import { isGuideAccountProfile, publicProfileUsername } from "@/lib/publicProfile";
import { ensureProfileRow } from "@/lib/profile";
import { followUser, loadFollowConnections, loadFollowRelationship, removeFollower, unfollowUser } from "@/lib/follows";
import { checkCanMessageUser } from "@/lib/messagePrivacy";
import ProfileContentTabs, {
  type ProfileMainTab,
} from "@/components/ProfileContentTabs";
import ProfileSavedTab from "@/components/ProfileSavedTab";
import ProfileMySpotsTab from "@/components/ProfileMySpotsTab";
import ProfileGalleryAvatarLink from "@/components/profile/ProfileGalleryAvatarLink";
import MobileSecondaryHeader from "@/components/MobileSecondaryHeader";
import NavigationStackScreen from "@/components/NavigationStackScreen";
import { loadPublicProfileContent, type ProfileContentPost } from "@/lib/profileContent";
import {
  normalizeProfileGalleryVisibility,
  type ProfileGalleryVisibility,
} from "@/lib/profileGalleryVisibility";
import {
  formatProfileLocationLineLocalized,
  resolveProfileLocation,
  type ResolvedProfileLocation,
} from "@/lib/profileLocation";
import ProfileScreenLayout from "@/components/profile/ProfileScreenLayout";
import ProfileMenuSheet, { type ProfileMenuItem } from "@/components/ProfileMenuSheet";
import RemoveFollowerConfirmSheet from "@/components/RemoveFollowerConfirmSheet";
import UserPresenceLabel from "@/components/UserPresenceLabel";
import Shell from "@/components/Shell";
import { useUserPresence } from "@/lib/useUserPresence";
import { useCanSeeOnlineStatus } from "@/lib/useCanSeeOnlineStatus";
import { supabase } from "@/lib/supabaseClient";
import { dispatchProfileFollowersRefresh } from "@/lib/profileContentRefresh";
import { MOBILE_BOTTOM_NAV_PADDING, MOBILE_MAIN_SCROLL_CLASS } from "@/lib/mobileLayout";
import { navigateBack } from "@/lib/navigateBack";

type Profile = {
  id: string;
  name?: string | null;
  username: string;
  avatar_url?: string | null;
  bio?: string | null;
  country_slug?: string | null;
  city_slug?: string | null;
  city_id?: string | null;
  gallery_visibility?: ProfileGalleryVisibility | null;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function loadPublicProfile(profileParam: string) {
  const loadWithSelect = (select: string) => {
    const query = supabase.from("profiles").select(select).limit(1);
    return isUuid(profileParam) ? query.eq("id", profileParam).maybeSingle() : query.eq("username", profileParam).maybeSingle();
  };

  const primaryResult = await loadWithSelect(
    "id, name, username, avatar_url, bio, country_slug, city_slug, city_id, gallery_visibility"
  );

    if (primaryResult.error?.code !== "42703") {
    if (primaryResult.data) {
      const row = primaryResult.data as unknown as Profile;

      return {
        ...primaryResult,
        data: {
          ...row,
          gallery_visibility: normalizeProfileGalleryVisibility(row.gallery_visibility),
        },
      };
    }

    return primaryResult;
  }

  console.error("Public profile guide fields missing:", JSON.stringify(primaryResult.error, null, 2));

  const fallbackResult = await loadWithSelect("id, name, username, avatar_url, bio, country_slug, city_slug, city_id");

  return {
    ...fallbackResult,
    data: fallbackResult.data
      ? ({
          ...(fallbackResult.data as unknown as Profile),
          gallery_visibility: "everyone" as ProfileGalleryVisibility,
        } satisfies Profile)
      : null,
  };
}

export default function UserPage({ userIdOverride }: { userIdOverride?: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const params = useParams<{ userId: string }>();
  const profileParam = userIdOverride?.trim() || decodeURIComponent(String(params.userId ?? "")).trim();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [viewerFollowsTarget, setViewerFollowsTarget] = useState(false);
  const [targetFollowsViewer, setTargetFollowsViewer] = useState(false);
  const [personalPosts, setPersonalPosts] = useState<ProfileContentPost[]>([]);
  const [spotPosts, setSpotPosts] = useState<ProfileContentPost[]>([]);
  const [activeContentTab, setActiveContentTab] = useState<ProfileMainTab>("spots");
  const [location, setLocation] = useState<ResolvedProfileLocation>({ countryName: null, cityName: null });
  const [followersCount, setFollowersCount] = useState(0);
  const [friendsCount, setFriendsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [loadingFollowAction, setLoadingFollowAction] = useState(false);
  const [removingFollower, setRemovingFollower] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [removeFollowerConfirmOpen, setRemoveFollowerConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [relationshipError, setRelationshipError] = useState<string | null>(null);
  const [canMessageTarget, setCanMessageTarget] = useState(false);
  const [postsError, setPostsError] = useState<string | null>(null);

  const isOwnProfile = Boolean(viewerId && profile?.id && viewerId === profile.id);
  const canSeeProfilePresence = useCanSeeOnlineStatus(viewerId, profile?.id ?? null);
  const { lastSeenAt: profileLastSeenAt } = useUserPresence(
    canSeeProfilePresence && profile?.id && !isOwnProfile ? profile.id : null
  );

  const handlePostDeleted = (postId: string) => {
    setPersonalPosts((current) => current.filter((post) => post.id !== postId));
    setSpotPosts((current) => current.filter((post) => post.id !== postId));
  };

  useEffect(() => {
    let cancelled = false;
    let profileSettled = false;

    const loadProfile = async () => {
      if (!profileParam) {
        setError(t("profile.userNotFound"));
        setLoading(false);
        return;
      }

      setLoading(true);
      setLoadingPosts(false);
      setError(null);
      setRelationshipError(null);
      setPostsError(null);
      setProfile(null);
      setPersonalPosts([]);
      setSpotPosts([]);
      setLocation({ countryName: null, cityName: null });
      setFollowersCount(0);
      setFriendsCount(0);
      setViewerFollowsTarget(false);
      setTargetFollowsViewer(false);
      setCanMessageTarget(false);

      const timeoutId = window.setTimeout(() => {
        if (!profileSettled && !cancelled) {
          console.error("Public profile load timeout:", JSON.stringify({ profileParam }, null, 2));
          setError(t("profile.loadTimeout"));
          setLoading(false);
        }
      }, 10000);

      const [{ data: profileData, error: profileError }, sessionResult] = await Promise.all([
        loadPublicProfile(profileParam),
        getSafeAuthSession(),
      ]);

      profileSettled = true;
      window.clearTimeout(timeoutId);

      if (cancelled) {
        return;
      }

      const session = sessionResult.session;
      setViewerId(session?.user?.id ?? null);

      if (sessionResult.error) {
        setRelationshipError(sessionResult.error);
      }

      if (profileError) {
        console.error("Public profile load error:", JSON.stringify(profileError, null, 2));
        setError(localizeError(t, profileError.message) ?? t("profile.unableToLoad"));
        setLoading(false);
        return;
      }

      if (!profileData || isGuideAccountProfile(profileData as Profile)) {
        setError(t("profile.userNotFound"));
        setLoading(false);
        return;
      }

      const profileRow = profileData as unknown as Profile;
      const loadedProfile = {
        ...profileRow,
        username: publicProfileUsername(profileRow.username),
      };

      setProfile(loadedProfile);
      setLoading(false);

      void resolveProfileLocation(profileRow).then((nextLocation) => {
        if (!cancelled) {
          setLocation(nextLocation);
        }
      });

      setLoadingPosts(true);

      const [profileContentResult, followConnectionsResult] = await Promise.all([
        loadPublicProfileContent(loadedProfile.id),
        loadFollowConnections(loadedProfile.id),
      ]);

      if (cancelled) {
        return;
      }

      if (profileContentResult.error) {
        console.error("Public profile posts error:", profileContentResult.error);
        setPostsError(profileContentResult.error);
        setPersonalPosts([]);
        setSpotPosts([]);
      } else {
        setPostsError(null);
        setPersonalPosts(profileContentResult.personal);
        setSpotPosts(profileContentResult.spotPosts);
      }

      setLoadingPosts(false);

      if (followConnectionsResult.error) {
        console.error("Public profile follow stats error:", JSON.stringify(followConnectionsResult.error, null, 2));
        setRelationshipError(followConnectionsResult.error);
        setFollowersCount(0);
        setFriendsCount(0);
      } else {
        setFollowersCount(followConnectionsResult.data?.followersCount ?? 0);
        setFriendsCount(followConnectionsResult.data?.friendsCount ?? 0);
      }

      if (session?.user && session.user.id !== loadedProfile.id) {
        const ensuredProfile = await ensureProfileRow({ user: session.user });

        if (cancelled) {
          return;
        }

        if (ensuredProfile.error && !ensuredProfile.needsOnboarding) {
          setRelationshipError(ensuredProfile.error);
        }

        const relationshipResult = await loadFollowRelationship(session.user.id, loadedProfile.id);

        if (cancelled) {
          return;
        }

        if (relationshipResult.error) {
          console.error("Public profile relationship error:", JSON.stringify(relationshipResult.error, null, 2));
          setRelationshipError(relationshipResult.error);
        } else {
          setViewerFollowsTarget(relationshipResult.data?.viewerFollowsTarget ?? false);
          setTargetFollowsViewer(relationshipResult.data?.targetFollowsViewer ?? false);
        }

        const messagePermission = await checkCanMessageUser(session.user.id, loadedProfile.id);

        if (cancelled) {
          return;
        }

        setCanMessageTarget(messagePermission.allowed);
      } else {
        setCanMessageTarget(false);
      }
    };

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [profileParam, t]);

  const handleFollowToggle = async () => {
    if (!viewerId || !profile?.id || viewerId === profile.id) {
      return;
    }

    setLoadingFollowAction(true);
    setRelationshipError(null);

    const actionError = viewerFollowsTarget ? await unfollowUser(viewerId, profile.id) : await followUser(viewerId, profile.id);

    if (actionError) {
      setRelationshipError(actionError);
      setLoadingFollowAction(false);
      return;
    }

    const relationshipResult = await loadFollowRelationship(viewerId, profile.id);

    if (relationshipResult.error) {
      console.error("Public profile follow toggle relationship error:", JSON.stringify(relationshipResult.error, null, 2));
      setRelationshipError(relationshipResult.error);
    } else {
      setViewerFollowsTarget(relationshipResult.data?.viewerFollowsTarget ?? false);
      setTargetFollowsViewer(relationshipResult.data?.targetFollowsViewer ?? false);
    }

    const followConnectionsResult = await loadFollowConnections(profile.id);

    if (!followConnectionsResult.error) {
      setFollowersCount(followConnectionsResult.data?.followersCount ?? 0);
      setFriendsCount(followConnectionsResult.data?.friendsCount ?? 0);
    } else {
      console.error("Public profile follow toggle stats error:", JSON.stringify(followConnectionsResult.error, null, 2));
    }

    const messagePermission = await checkCanMessageUser(viewerId, profile.id);
    setCanMessageTarget(messagePermission.allowed);

    setLoadingFollowAction(false);
  };

  const handleRemoveFollower = async () => {
    if (!viewerId || !profile?.id || !targetFollowsViewer) {
      return;
    }

    setRemovingFollower(true);
    setRelationshipError(null);

    const wasFriend = viewerFollowsTarget && targetFollowsViewer;
    const actionError = await removeFollower(viewerId, profile.id);

    if (actionError) {
      setRelationshipError(actionError);
      setRemovingFollower(false);
      return;
    }

    setTargetFollowsViewer(false);
    if (wasFriend) {
      setFriendsCount((current) => Math.max(0, current - 1));
    }

    dispatchProfileFollowersRefresh();
    setRemoveFollowerConfirmOpen(false);
    setProfileMenuOpen(false);

    const messagePermission = await checkCanMessageUser(viewerId, profile.id);
    setCanMessageTarget(messagePermission.allowed);

    setRemovingFollower(false);
  };

  const profileMenuItems = useMemo<ProfileMenuItem[]>(() => {
    if (!targetFollowsViewer || isOwnProfile || !viewerId) {
      return [];
    }

    return [
      {
        id: "remove-follower",
        label: t("profile.removeFollower"),
        icon: UserMinus,
        destructive: true,
        onClick: () => setRemoveFollowerConfirmOpen(true),
      },
    ];
  }, [isOwnProfile, t, targetFollowsViewer, viewerId]);

  const locationLine = formatProfileLocationLineLocalized(location, locale);
  const headerTitle = profile
    ? profile.name?.trim() || `@${profile.username}`
    : t("profile.viewProfile");

  return (
    <Shell showHeader={false} flushTop fixedLayout>
      <NavigationStackScreen fallbackHref="/search/people">
        <MobileSecondaryHeader
          title={headerTitle}
          backHref="/search/people"
          trailing={
            profileMenuItems.length > 0 ? (
              <button
                type="button"
                onClick={() => setProfileMenuOpen(true)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full text-white transition hover:bg-white/10"
                aria-label={t("profile.removeFollower")}
              >
                <MoreVertical className="h-5 w-5" aria-hidden />
              </button>
            ) : undefined
          }
        />

        <div
          data-mobile-main-scroll=""
          className={`${MOBILE_MAIN_SCROLL_CLASS} ${MOBILE_BOTTOM_NAV_PADDING}`}
        >
          <ProfileScreenLayout>
        {loading ? (
          <div className="w-full rounded-2xl border border-dashed border-slate-700 bg-slate-950 p-8 text-center text-slate-400 sm:rounded-3xl">
            {t("profile.loading")}
          </div>
        ) : error ? (
          <div className="w-full space-y-4 rounded-2xl border border-red-500/20 bg-red-500/5 p-6 text-sm text-red-200 sm:rounded-3xl">
            <p>{localizeError(t, error) ?? error}</p>
            <button
              type="button"
              onClick={() => navigateBack(router, "/search/people")}
              className="inline-flex w-full items-center justify-center rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-950 sm:w-auto"
            >
              {t("common.back")}
            </button>
          </div>
        ) : profile ? (
          <>
            <section className="profile-header-enter w-full space-y-5 bg-slate-900/90 px-1 py-5 sm:space-y-6 sm:rounded-[2rem] sm:border sm:border-white/10 sm:px-6 sm:py-8 sm:shadow-xl sm:shadow-black/40">
              <div className="flex w-full flex-col items-stretch gap-4 sm:items-center sm:text-center">
                <div className="profile-header-avatar">
                  <ProfileGalleryAvatarLink
                    avatarUrl={profile.avatar_url}
                    ownerUserId={profile.id}
                    viewerUserId={viewerId}
                    visibility={profile.gallery_visibility ?? "everyone"}
                    variant="large"
                    showLabel={false}
                  />
                </div>

                <div className="profile-header-rise min-w-0 w-full space-y-1.5 sm:space-y-2">
                  <h1 className="truncate text-2xl font-semibold tracking-tight text-white sm:text-center sm:text-4xl">
                    {profile.name?.trim() || profile.username}
                  </h1>
                  <p className="text-sm font-medium text-slate-500 sm:text-center">@{profile.username}</p>
                  {!isOwnProfile && targetFollowsViewer ? (
                    <p className="text-xs font-semibold uppercase tracking-wide text-cyan-300/90 sm:text-center">
                      {t("profile.followsYou")}
                    </p>
                  ) : null}
                  {!isOwnProfile && canSeeProfilePresence === true ? (
                    <UserPresenceLabel
                      userId={profile.id}
                      lastSeenAt={profileLastSeenAt}
                      username={profile.username}
                      className="justify-center text-slate-400 sm:mx-auto"
                    />
                  ) : !isOwnProfile && canSeeProfilePresence === false ? (
                    <p className="text-sm text-slate-500 sm:text-center">{t("presence.hidden")}</p>
                  ) : null}
                  {locationLine ? (
                    <p className="text-sm font-medium text-slate-400 sm:text-center">{locationLine}</p>
                  ) : null}
                  {profile.bio ? (
                    <p className="text-sm leading-relaxed text-slate-300 sm:mx-auto sm:max-w-md sm:text-center">{profile.bio}</p>
                  ) : null}
                </div>
              </div>

              <div className="profile-header-rise-delay grid w-full grid-cols-3 items-center">
                <div className="flex flex-col items-center justify-center gap-0.5 py-1">
                  <p className="text-[17px] font-bold leading-none tabular-nums text-white">{spotPosts.length}</p>
                  <p className="text-[12px] leading-none text-muted">{t("profile.posts")}</p>
                </div>
                <div className="flex flex-col items-center justify-center gap-0.5 py-1">
                  <p className="text-[17px] font-bold leading-none tabular-nums text-white">{followersCount}</p>
                  <p className="text-[12px] leading-none text-muted">{t("profile.followers")}</p>
                </div>
                <div className="flex flex-col items-center justify-center gap-0.5 py-1">
                  <p className="text-[17px] font-bold leading-none tabular-nums text-white">{friendsCount}</p>
                  <p className="text-[12px] leading-none text-muted">{t("profile.friends")}</p>
                </div>
              </div>

              <div className="profile-header-rise-delay-2 flex w-full flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:justify-center">
                {!isOwnProfile && viewerId ? (
                  <button
                    type="button"
                    onClick={handleFollowToggle}
                    disabled={loadingFollowAction}
                    className="inline-flex w-full min-w-0 items-center justify-center rounded-full bg-cyan-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60 sm:min-w-[8.5rem] sm:flex-1 sm:max-w-[11rem]"
                  >
                    {loadingFollowAction ? t("profile.updating") : viewerFollowsTarget ? t("profile.unfollow") : t("profile.follow")}
                  </button>
                ) : null}

                {isOwnProfile ? (
                  <Link
                    href="/profile"
                    className="inline-flex w-full min-w-0 items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-200 sm:min-w-[8.5rem] sm:flex-1 sm:max-w-[11rem]"
                  >
                    {t("profile.openMyProfile")}
                  </Link>
                ) : null}

                {!isOwnProfile && viewerId && canMessageTarget ? (
                  <Link
                    href={`/dm?id=${profile.id}`}
                    className="inline-flex w-full min-w-0 items-center justify-center rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10 sm:min-w-[8.5rem] sm:flex-1 sm:max-w-[11rem]"
                  >
                    {t("profile.message")}
                  </Link>
                ) : null}
              </div>

              {relationshipError ? (
                <div className="w-full rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-200 sm:rounded-3xl">
                  {localizeError(t, relationshipError) ?? relationshipError}
                </div>
              ) : null}
            </section>

            {postsError ? (
              <div className="w-full rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-4 text-sm text-amber-100 sm:rounded-3xl">
                <p>{localizeError(t, postsError) ?? postsError}</p>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="mt-3 inline-flex w-full items-center justify-center rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-slate-200 sm:w-auto"
                >
                  {t("common.tryAgain")}
                </button>
              </div>
            ) : null}

            <section className="w-full min-w-0 overflow-hidden border-y border-white/10 bg-slate-950/60 sm:rounded-3xl sm:border sm:border-white/10">
              <ProfileContentTabs
                activeTab={activeContentTab}
                onTabChange={setActiveContentTab}
                personalPosts={personalPosts}
                spotPosts={spotPosts}
                loading={loadingPosts}
                emptySpotsMessage={t("profile.noPostsYet")}
                viewerUserId={isOwnProfile ? viewerId : null}
                onPostDeleted={isOwnProfile ? handlePostDeleted : undefined}
                viewerAuthor={
                  profile
                    ? {
                        username: profile.username,
                        avatar_url: profile.avatar_url,
                      }
                    : null
                }
                showPrivateTabs={isOwnProfile}
                mySpotsPanel={
                  isOwnProfile && profile && viewerId ? (
                    <ProfileMySpotsTab
                      userId={viewerId}
                      viewerAuthor={{
                        username: profile.username,
                        avatar_url: profile.avatar_url,
                      }}
                    />
                  ) : null
                }
                savedPanel={
                  isOwnProfile && profile && viewerId ? (
                    <ProfileSavedTab
                      userId={viewerId}
                      viewerAuthor={{
                        username: profile.username,
                        avatar_url: profile.avatar_url,
                      }}
                    />
                  ) : null
                }
              />
            </section>
          </>
        ) : (
          <div className="w-full rounded-2xl border border-white/10 bg-white/5 p-6 text-slate-300 sm:rounded-3xl">
            {t("profile.userNotFound")}
          </div>
        )}
          </ProfileScreenLayout>
        </div>
      </NavigationStackScreen>

      <ProfileMenuSheet
        isOpen={profileMenuOpen}
        onClose={() => setProfileMenuOpen(false)}
        items={profileMenuItems}
        title={t("profile.viewProfile")}
      />

      <RemoveFollowerConfirmSheet
        isOpen={removeFollowerConfirmOpen}
        username={profile?.username ?? ""}
        removing={removingFollower}
        onClose={() => setRemoveFollowerConfirmOpen(false)}
        onConfirm={() => void handleRemoveFollower()}
      />
    </Shell>
  );
}
