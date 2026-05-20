"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { UserRound } from "lucide-react";
import { getSafeAuthSession } from "@/lib/authSession";
import { publicProfileUsername } from "@/lib/publicProfile";
import { ensureProfileRow } from "@/lib/profile";
import { followUser, loadFollowConnections, loadFollowRelationship, unfollowUser } from "@/lib/follows";
import { formatPostTime, getPostMedia } from "@/lib/posts";
import { resolveProfileLocation, type ResolvedProfileLocation } from "@/lib/profileLocation";
import OfficialAIGuideBadge from "@/components/OfficialAIGuideBadge";
import PostMediaLink from "@/components/PostMediaLink";
import Shell from "@/components/Shell";
import { supabase } from "@/lib/supabaseClient";

type Profile = {
  id: string;
  name?: string | null;
  username: string;
  avatar_url?: string | null;
  bio?: string | null;
  country_slug?: string | null;
  city_slug?: string | null;
  city_id?: string | null;
  is_ai_guide?: boolean | null;
  is_official?: boolean | null;
};

type PublicProfilePost = {
  id: string;
  user_id: string;
  content: string;
  image_url?: string | null;
  video_url?: string | null;
  media_url?: string | null;
  media_type?: string | null;
  visibility?: "public" | "private";
  created_at: string;
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
    "id, name, username, avatar_url, bio, country_slug, city_slug, city_id, is_ai_guide, is_official"
  );

  if (primaryResult.error?.code !== "42703") {
    return primaryResult;
  }

  console.error("Public profile guide fields missing:", JSON.stringify(primaryResult.error, null, 2));

  const fallbackResult = await loadWithSelect("id, name, username, avatar_url, bio, country_slug, city_slug, city_id");

  return {
    ...fallbackResult,
    data: fallbackResult.data ? { ...(fallbackResult.data as unknown as Profile), is_ai_guide: false, is_official: false } : null,
  };
}

export default function UserPage() {
  const params = useParams<{ userId: string }>();
  const profileParam = decodeURIComponent(String(params.userId ?? "")).trim();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [viewerFollowsTarget, setViewerFollowsTarget] = useState(false);
  const [posts, setPosts] = useState<PublicProfilePost[]>([]);
  const [location, setLocation] = useState<ResolvedProfileLocation>({ countryName: null, cityName: null });
  const [followersCount, setFollowersCount] = useState(0);
  const [friendsCount, setFriendsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [loadingFollowAction, setLoadingFollowAction] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [relationshipError, setRelationshipError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let profileSettled = false;

    const loadProfile = async () => {
      if (!profileParam) {
        setError("User not found.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setLoadingPosts(false);
      setError(null);
      setRelationshipError(null);
      setProfile(null);
      setPosts([]);
      setLocation({ countryName: null, cityName: null });
      setFollowersCount(0);
      setFriendsCount(0);
      setViewerFollowsTarget(false);

      const timeoutId = window.setTimeout(() => {
        if (!profileSettled && !cancelled) {
          console.error("Public profile load timeout:", JSON.stringify({ profileParam }, null, 2));
          setError("Profile is taking too long to load. Please try again.");
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
        setError(profileError.message || "Unable to load profile.");
        setLoading(false);
        return;
      }

      if (!profileData) {
        setError("User not found.");
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

      void resolveProfileLocation(profileRow)
        .then((nextLocation) => {
          if (!cancelled) {
            setLocation(nextLocation);
          }
        })
        .catch((locationError) => {
          console.error("Public profile location error:", JSON.stringify(locationError, null, 2));
        });

      setLoadingPosts(true);

      const [{ data: postRows, error: postsError }, followConnectionsResult] = await Promise.all([
        supabase
          .from("posts")
          .select("id, user_id, content, image_url, video_url, media_url, media_type, visibility, created_at")
          .eq("user_id", loadedProfile.id)
          .eq("visibility", "public")
          .order("created_at", { ascending: false }),
        loadFollowConnections(loadedProfile.id),
      ]);

      if (cancelled) {
        return;
      }

      if (postsError) {
        console.error("Public profile posts error:", JSON.stringify(postsError, null, 2));
        setPosts([]);
      } else {
        setPosts((postRows ?? []) as PublicProfilePost[]);
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
        }
      }
    };

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [profileParam]);

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
    }

    const followConnectionsResult = await loadFollowConnections(profile.id);

    if (!followConnectionsResult.error) {
      setFollowersCount(followConnectionsResult.data?.followersCount ?? 0);
      setFriendsCount(followConnectionsResult.data?.friendsCount ?? 0);
    } else {
      console.error("Public profile follow toggle stats error:", JSON.stringify(followConnectionsResult.error, null, 2));
    }

    setLoadingFollowAction(false);
  };

  const isOwnProfile = Boolean(viewerId && profile?.id && viewerId === profile.id);
  const isOfficialAIGuide = Boolean(profile?.is_ai_guide && profile.is_official);
  const locationLine = [location.countryName, location.cityName].filter(Boolean).join(", ");

  return (
    <Shell>
      <div className="mx-auto max-w-2xl space-y-6 px-4 pb-10 pt-2 sm:max-w-3xl">
        {loading ? (
          <div className="rounded-3xl border border-dashed border-slate-700 bg-slate-950 p-8 text-center text-slate-400">Loading user profile...</div>
        ) : error ? (
          <div className="space-y-4 rounded-3xl border border-red-500/20 bg-red-500/5 p-6 text-sm text-red-200">
            <p>{error}</p>
            <Link href="/search" className="inline-flex rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-950">
              Back to search
            </Link>
          </div>
        ) : profile ? (
          <>
            <section className="space-y-6 rounded-[2rem] border border-white/10 bg-slate-900/90 p-5 text-center shadow-xl shadow-black/40 sm:p-8">
              <div className="flex flex-col items-center gap-4">
                <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-slate-800 text-white shadow-xl shadow-black/40 sm:h-32 sm:w-32">
                  {profile.avatar_url ? (
                    <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <UserRound className="h-12 w-12 text-slate-400" strokeWidth={1.25} aria-hidden />
                  )}
                </div>

                <div className="min-w-0 space-y-2">
                  {isOfficialAIGuide ? <OfficialAIGuideBadge className="justify-center" /> : null}
                  <h1 className="truncate text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                    {profile.name?.trim() || profile.username}
                  </h1>
                  <p className="text-sm font-medium text-slate-500">@{profile.username}</p>
                  {locationLine ? <p className="text-sm font-medium text-slate-400">{locationLine}</p> : null}
                  {profile.bio ? <p className="mx-auto max-w-md text-sm leading-relaxed text-slate-300">{profile.bio}</p> : null}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <div className="rounded-2xl bg-white/5 px-2 py-3">
                  <p className="text-xl font-semibold text-white sm:text-2xl">{friendsCount}</p>
                  <p className="mt-1 text-xs text-slate-500">Friends</p>
                </div>
                <div className="rounded-2xl bg-white/5 px-2 py-3">
                  <p className="text-xl font-semibold text-white sm:text-2xl">{followersCount}</p>
                  <p className="mt-1 text-xs text-slate-500">Followers</p>
                </div>
                <div className="rounded-2xl bg-white/5 px-2 py-3">
                  <p className="text-xl font-semibold text-white sm:text-2xl">{posts.length}</p>
                  <p className="mt-1 text-xs text-slate-500">Posts</p>
                </div>
              </div>

              <div className="flex flex-col gap-2.5 sm:flex-row sm:justify-center">
                {!isOwnProfile && viewerId ? (
                  <button
                    type="button"
                    onClick={handleFollowToggle}
                    disabled={loadingFollowAction}
                    className="inline-flex flex-1 items-center justify-center rounded-full bg-cyan-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60 sm:max-w-44"
                  >
                    {loadingFollowAction ? "Updating..." : viewerFollowsTarget ? "Unfollow" : "Follow"}
                  </button>
                ) : null}

                {isOwnProfile ? (
                  <Link
                    href="/profile"
                    className="inline-flex flex-1 items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-200 sm:max-w-44"
                  >
                    Open my profile
                  </Link>
                ) : null}

                <Link
                  href={`/dm/${profile.id}`}
                  className="inline-flex flex-1 items-center justify-center rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10 sm:max-w-44"
                >
                  Message
                </Link>
              </div>

              {relationshipError ? (
                <div className="rounded-3xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-200">{relationshipError}</div>
              ) : null}
            </section>

            <section className="space-y-4">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300">Posts</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">Public posts</h2>
                </div>
              </div>

              {loadingPosts ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div key={`public-post-loading-${index}`} className="aspect-square animate-pulse rounded-2xl bg-slate-900" />
                  ))}
                </div>
              ) : posts.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {posts.map((post) => {
                    const { mediaUrl, mediaType } = getPostMedia(post);
                    const hasCaption = Boolean(post.content?.trim());

                    return (
                      <article key={post.id} className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/60">
                        {mediaUrl ? (
                          <PostMediaLink postId={post.id} className="block aspect-[4/5] w-full bg-black sm:aspect-square">
                            {mediaType === "video" ? (
                              <video src={mediaUrl} playsInline muted className="h-full w-full object-cover" />
                            ) : (
                              <img src={mediaUrl} alt="" className="h-full w-full object-cover" />
                            )}
                          </PostMediaLink>
                        ) : null}
                        {hasCaption || !mediaUrl ? (
                          <div className="space-y-2 px-4 py-3">
                            {hasCaption ? (
                              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">{post.content}</p>
                            ) : null}
                            <time className="block text-xs text-slate-500">{formatPostTime(post.created_at)}</time>
                          </div>
                        ) : (
                          <time className="block px-4 py-2 text-xs text-slate-600">{formatPostTime(post.created_at)}</time>
                        )}
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-3xl border border-dashed border-white/10 bg-slate-900/60 p-8 text-center text-sm text-slate-400">
                  No public posts yet.
                </div>
              )}
            </section>
          </>
        ) : (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-slate-300">User not found.</div>
        )}
      </div>
    </Shell>
  );
}
