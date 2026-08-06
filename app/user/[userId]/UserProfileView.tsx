"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Calendar, Megaphone, MessageCircle, MoreVertical, UserMinus, MapPin } from "lucide-react";
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
import ProfileAvatarProfileTrigger from "@/components/ProfileAvatarProfileTrigger";
import UsernameWithVerification from "@/components/UsernameWithVerification";
import ShareProfileSheet from "@/components/ShareProfileSheet";
import MobileSecondaryHeader from "@/components/MobileSecondaryHeader";
import NavigationStackScreen from "@/components/NavigationStackScreen";
import { loadPublicProfileContent, type ProfileContentPost } from "@/lib/profileContent";
import {
  normalizeProfileGalleryVisibility,
  type ProfileGalleryVisibility,
} from "@/lib/profileGalleryVisibility";
import {
  formatLocalizedAge,
  formatProfileLocationLineLocalized,
  resolveProfileLocation,
  type ResolvedProfileLocation,
} from "@/lib/profileLocation";
import { normalizeAvatarUrl } from "@/lib/avatarUrl";
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
import { fetchOfficialChannelUnreadState } from "@/lib/officialChannel";

type Profile = {
  id: string;
  name?: string | null;
  username: string;
  avatar_url?: string | null;
  cover_url?: string | null;
  bio?: string | null;
  country_slug?: string | null;
  city_slug?: string | null;
  city_id?: string | null;
  age_years?: number | null;
  gallery_visibility?: ProfileGalleryVisibility | null;
  is_official?: boolean | null;
  is_verified?: boolean | null;
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
    "id, name, username, avatar_url, cover_url, bio, country_slug, city_slug, city_id, age_years, gallery_visibility, is_official, is_verified"
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

  const fallbackResult = await loadWithSelect(
    "id, name, username, avatar_url, cover_url, bio, country_slug, city_slug, city_id, age_years, is_verified"
  );

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
  const [shareProfileOpen, setShareProfileOpen] = useState(false);
  const [removeFollowerConfirmOpen, setRemoveFollowerConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [relationshipError, setRelationshipError] = useState<string | null>(null);
  const [canMessageTarget, setCanMessageTarget] = useState(false);
  const [postsError, setPostsError] = useState<string | null>(null);
  const [officialChannelUnread, setOfficialChannelUnread] = useState(false);
  const [coverFailed, setCoverFailed] = useState(false);

  const isOwnProfile = Boolean(viewerId && profile?.id && viewerId === profile.id);
  const canSeeProfilePresence = useCanSeeOnlineStatus(viewerId, profile?.id ?? null);
  const { lastSeenAt: profileLastSeenAt } = useUserPresence(
    canSeeProfilePresence && profile?.id && !isOwnProfile ? profile.id : null
  );

  useEffect(() => {
    if (!viewerId || profile?.is_official !== true) {
      setOfficialChannelUnread(false);
      return;
    }

    let active = true;

    void fetchOfficialChannelUnreadState(viewerId).then((result) => {
      if (active) {
        setOfficialChannelUnread(result.unread);
      }
    });

    return () => {
      active = false;
    };
  }, [viewerId, profile?.is_official, profile?.id]);

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
      setCoverFailed(false);

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
  const ageLine = formatLocalizedAge(profile?.age_years, locale, t);
  const coverUrl = normalizeAvatarUrl(profile?.cover_url);

  return (
    <Shell showHeader={false} flushTop fixedLayout>
      <NavigationStackScreen fallbackHref="/search/people">
        <MobileSecondaryHeader
          title={t("collectionDetail.backToProfile")}
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
            <section className="profile-header-enter relative w-full sm:overflow-hidden sm:rounded-[2rem] sm:border sm:border-white/10 sm:shadow-xl sm:shadow-black/40">
              <div className="relative h-64 w-full overflow-hidden sm:h-72">
                {coverUrl && !coverFailed ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={coverUrl}
                    alt=""
                    className="h-full w-full object-cover object-center"
                    draggable={false}
                    onError={() => setCoverFailed(true)}
                  />
                ) : (
                  <div className="h-full w-full bg-gradient-to-br from-[#123047] via-[#0b1026] to-[#1b1240]" />
                )}
                <div
                  className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent"
                  aria-hidden
                />
                <div
                  className="pointer-events-none absolute inset-0 bg-gradient-to-l from-black/55 via-transparent to-transparent"
                  aria-hidden
                />

                <div className="profile-header-rise absolute right-4 top-4 max-w-[68%] text-right sm:right-6 sm:top-6">
                  <h1 className="ml-auto w-fit max-w-full">
                    <UsernameWithVerification
                      username={profile.username}
                      isVerified={profile.is_verified}
                      className="justify-end text-xl font-semibold tracking-tight text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.65)] sm:text-2xl"
                      iconSize={16}
                    />
                  </h1>
                  {!isOwnProfile && targetFollowsViewer ? (
                    <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-cyan-300">
                      {t("profile.followsYou")}
                    </p>
                  ) : null}
                  {locationLine ? (
                    <p className="mt-1.5 flex items-center justify-end gap-1.5 text-xs font-medium text-white/90 [text-shadow:0_1px_4px_rgba(0,0,0,0.6)] sm:text-sm">
                      <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span className="truncate">{locationLine}</span>
                    </p>
                  ) : null}
                  {ageLine ? (
                    <p className="mt-1 flex items-center justify-end gap-1.5 text-xs font-medium text-white/90 [text-shadow:0_1px_4px_rgba(0,0,0,0.6)] sm:text-sm">
                      <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span>{ageLine}</span>
                    </p>
                  ) : null}
                  {!isOwnProfile && canSeeProfilePresence === true ? (
                    <UserPresenceLabel
                      userId={profile.id}
                      lastSeenAt={profileLastSeenAt}
                      username={profile.username}
                      className="mt-1 justify-end"
                    />
                  ) : !isOwnProfile && canSeeProfilePresence === false ? (
                    <p className="mt-1 text-xs text-white/70">{t("presence.hidden")}</p>
                  ) : null}
                </div>
              </div>

              <div className="profile-header-avatar absolute left-4 top-[12.5rem] sm:left-6 sm:top-[14rem]">
                <ProfileAvatarProfileTrigger
                  userId={profile.id}
                  viewerUserId={viewerId}
                  avatarUrl={profile.avatar_url}
                  sizeClassName="h-24 w-24 sm:h-28 sm:w-28"
                  iconClassName="h-11 w-11 sm:h-12 sm:w-12"
                  className="border-[3px] border-[#050816] shadow-xl shadow-black/60"
                />
              </div>

              <div className="h-12 sm:h-14" aria-hidden />
            </section>

            {profile.is_official !== true ? (
              <section className="profile-header-rise-delay w-full rounded-2xl border border-white/10 bg-slate-900/70 px-2 py-3 sm:rounded-3xl">
                <div className="grid grid-cols-3 divide-x divide-white/10">
                  <div className="flex flex-col items-center justify-center gap-0.5 px-2 py-1">
                    <p className="text-[17px] font-bold leading-none tabular-nums text-white">{spotPosts.length}</p>
                    <p className="text-[12px] leading-none text-muted">{t("profile.posts")}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      router.push(`/user/followers?id=${encodeURIComponent(profile.id)}`)
                    }
                    className="flex flex-col items-center justify-center gap-0.5 px-2 py-1 transition active:opacity-70"
                  >
                    <p className="text-[17px] font-bold leading-none tabular-nums text-white">{followersCount}</p>
                    <p className="text-[12px] leading-none text-muted">{t("profile.followers")}</p>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      router.push(`/user/friends?id=${encodeURIComponent(profile.id)}`)
                    }
                    className="flex flex-col items-center justify-center gap-0.5 px-2 py-1 transition active:opacity-70"
                  >
                    <p className="text-[17px] font-bold leading-none tabular-nums text-white">{friendsCount}</p>
                    <p className="text-[12px] leading-none text-muted">{t("profile.friends")}</p>
                  </button>
                </div>
              </section>
            ) : null}

            <div
              className={
                profile.is_official === true
                  ? "profile-header-rise-delay-2 flex w-full justify-center"
                  : "profile-header-rise-delay-2 flex w-full gap-2"
              }
            >
              {!isOwnProfile && viewerId && profile.is_official !== true ? (
                <button
                  type="button"
                  onClick={handleFollowToggle}
                  disabled={loadingFollowAction}
                  className="inline-flex min-w-0 flex-1 items-center justify-center truncate rounded-full bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loadingFollowAction ? t("profile.updating") : viewerFollowsTarget ? t("profile.unfollow") : t("profile.follow")}
                </button>
              ) : null}

              {isOwnProfile ? (
                <Link
                  href="/profile"
                  className="inline-flex min-w-0 flex-1 items-center justify-center truncate rounded-full bg-white px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
                >
                  {t("profile.openMyProfile")}
                </Link>
              ) : null}

              {!isOwnProfile && viewerId && canMessageTarget && profile.is_official !== true ? (
                <Link
                  href={`/dm?id=${profile.id}`}
                  className="inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 truncate rounded-full border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  <MessageCircle className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="truncate">{t("profile.message")}</span>
                </Link>
              ) : null}

              {profile.is_official === true ? (
                <button
                  type="button"
                  onClick={() => setShareProfileOpen(true)}
                  className="inline-flex w-full min-w-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10 px-6 py-3 text-sm font-semibold text-primary transition hover:border-primary/50 hover:bg-primary/15 sm:w-auto sm:min-w-[8.5rem]"
                >
                  {t("profile.shareProfile")}
                </button>
              ) : null}
            </div>

            {relationshipError ? (
              <div className="w-full rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-200 sm:rounded-3xl">
                {localizeError(t, relationshipError) ?? relationshipError}
              </div>
            ) : null}

            {profile.bio ? (
              <section className="w-full space-y-1.5 rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-4 sm:rounded-3xl sm:px-6">
                <h2 className="text-sm font-semibold text-white">{t("profile.about")}</h2>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{profile.bio}</p>
              </section>
            ) : null}

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

            <div className="flex items-center justify-between px-1">
              <h2 className="text-base font-semibold text-white">{t("profile.posts")}</h2>
            </div>

            <section className="w-full min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/60 sm:rounded-3xl">
              <ProfileContentTabs
                activeTab={activeContentTab}
                onTabChange={setActiveContentTab}
                personalPosts={personalPosts}
                spotPosts={spotPosts}
                loading={loadingPosts}
                emptySpotsMessage={profile.is_official === true ? t("profile.officialNoPostsYet") : t("profile.noPostsYet")}
                emptySpotsSubtitle={profile.is_official === true ? t("profile.officialNoPostsYetSubtitle") : undefined}
                emptyState={
                  profile.is_official === true ? (
                    <div className="mx-5">
                      <Link
                        href="/official-channel"
                        className="profile-header-enter relative mx-auto flex max-w-[420px] flex-col items-center justify-center gap-3 rounded-[28px] border border-primary/15 bg-slate-900/60 px-6 py-8 text-center transition active:scale-[0.99] active:bg-slate-900/80"
                      >
                        {officialChannelUnread ? (
                          <span className="absolute right-4 top-4 inline-flex items-center rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-background">
                            {t("officialChannel.unread")}
                          </span>
                        ) : null}
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
                showPrivateTabs={isOwnProfile && profile.is_official !== true}
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

      {profile?.is_official === true ? (
        <ShareProfileSheet
          isOpen={shareProfileOpen}
          onClose={() => setShareProfileOpen(false)}
          username={profile.username}
        />
      ) : null}
    </Shell>
  );
}
