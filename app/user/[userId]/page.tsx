"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { UserRound } from "lucide-react";
import { getSafeAuthSession } from "@/lib/authSession";
import { publicProfileUsername } from "@/lib/publicProfile";
import { ensureProfileRow } from "@/lib/profile";
import { followUser, loadFollowRelationship, unfollowUser } from "@/lib/follows";
import { formatPostTime, getPostMedia } from "@/lib/posts";
import PostMediaLink from "@/components/PostMediaLink";
import Shell from "@/components/Shell";
import { supabase } from "@/lib/supabaseClient";

type Profile = {
  username: string;
  avatar_url?: string | null;
  bio?: string | null;
  country_slug?: string | null;
  city_id?: string | null;
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

export default function UserPage() {
  const params = useParams<{ userId: string }>();
  const userId = String(params.userId ?? "");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [viewerFollowsTarget, setViewerFollowsTarget] = useState(false);
  const [targetFollowsViewer, setTargetFollowsViewer] = useState(false);
  const [posts, setPosts] = useState<PublicProfilePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingFollowAction, setLoadingFollowAction] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [relationshipError, setRelationshipError] = useState<string | null>(null);

  useEffect(() => {
    const loadProfile = async () => {
      if (!userId) {
        setError("User not found.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      setRelationshipError(null);

      const [{ data: profileData, error: profileError }, sessionResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("username, avatar_url, bio, country_slug, city_id")
          .eq("id", userId)
          .single(),
        getSafeAuthSession(),
      ]);

      const session = sessionResult.session;
      setViewerId(session?.user?.id ?? null);

      if (sessionResult.error) {
        setRelationshipError(sessionResult.error);
      }

      if (profileError) {
        setError(profileError.message);
        setLoading(false);
        return;
      }

      setProfile(
        profileData
          ? {
              ...profileData,
              username: publicProfileUsername(profileData.username),
            }
          : null
      );

      const { data: postRows, error: postsError } = await supabase
        .from("posts")
        .select("id, user_id, content, image_url, video_url, media_url, media_type, visibility, created_at")
        .eq("user_id", userId)
        .eq("visibility", "public")
        .order("created_at", { ascending: false });

      if (postsError) {
        console.error("Failed to load public profile posts:", JSON.stringify(postsError, null, 2));
        setPosts([]);
      } else {
        setPosts((postRows ?? []) as PublicProfilePost[]);
      }

      if (session?.user && session.user.id !== userId) {
        const ensuredProfile = await ensureProfileRow({ user: session.user });

        if (ensuredProfile.error && !ensuredProfile.needsOnboarding) {
          setRelationshipError(ensuredProfile.error);
        }

        const relationshipResult = await loadFollowRelationship(session.user.id, userId);

        if (relationshipResult.error) {
          setRelationshipError(relationshipResult.error);
        } else {
          setViewerFollowsTarget(relationshipResult.data?.viewerFollowsTarget ?? false);
          setTargetFollowsViewer(relationshipResult.data?.targetFollowsViewer ?? false);
        }
      } else {
        setViewerFollowsTarget(false);
        setTargetFollowsViewer(false);
      }

      setLoading(false);
    };

    void loadProfile();
  }, [userId]);

  const handleFollowToggle = async () => {
    if (!viewerId || !userId || viewerId === userId) {
      return;
    }

    setLoadingFollowAction(true);
    setRelationshipError(null);

    const actionError = viewerFollowsTarget ? await unfollowUser(viewerId, userId) : await followUser(viewerId, userId);

    if (actionError) {
      setRelationshipError(actionError);
      setLoadingFollowAction(false);
      return;
    }

    const relationshipResult = await loadFollowRelationship(viewerId, userId);

    if (relationshipResult.error) {
      setRelationshipError(relationshipResult.error);
    } else {
      setViewerFollowsTarget(relationshipResult.data?.viewerFollowsTarget ?? false);
      setTargetFollowsViewer(relationshipResult.data?.targetFollowsViewer ?? false);
    }

    setLoadingFollowAction(false);
  };

  const isOwnProfile = Boolean(viewerId && userId && viewerId === userId);
  const areFriends = viewerFollowsTarget && targetFollowsViewer;

  return (
    <Shell>
      <div className="mx-auto max-w-4xl space-y-8 rounded-3xl border border-white/10 bg-slate-900/90 p-8 shadow-xl shadow-black/40">
        {loading ? (
          <div className="rounded-3xl border border-dashed border-slate-700 bg-slate-950 p-8 text-center text-slate-400">Loading user profile…</div>
        ) : error ? (
          <div className="rounded-3xl border border-red-500/20 bg-red-500/5 p-6 text-sm text-red-200">{error}</div>
        ) : profile ? (
          <>
            <section className="rounded-3xl border border-white/10 bg-slate-950 p-8">
              <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-5">
                  <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-slate-800 text-white">
                    {profile.avatar_url ? (
                      <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <UserRound className="h-10 w-10 text-slate-400" strokeWidth={1.25} aria-hidden />
                    )}
                  </div>
                  <div>
                    <p className="text-sm uppercase tracking-[0.35em] text-cyan-300">User profile</p>
                    <h1 className="mt-3 text-3xl font-semibold text-white">{profile.username}</h1>
                    <p className="mt-3 max-w-2xl text-slate-300">{profile.bio ?? "No bio yet."}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {areFriends ? (
                    <span className="inline-flex rounded-full bg-emerald-500/15 px-4 py-2 text-sm font-medium text-emerald-300">
                      Friends
                    </span>
                  ) : null}

                  {!isOwnProfile && viewerId ? (
                    <button
                      type="button"
                      onClick={handleFollowToggle}
                      disabled={loadingFollowAction}
                      className="inline-flex rounded-3xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {loadingFollowAction ? "Updating..." : viewerFollowsTarget ? "Unfollow" : "Follow"}
                    </button>
                  ) : null}

                  {isOwnProfile ? (
                    <Link
                      href="/profile"
                      className="inline-flex rounded-3xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                    >
                      Open my profile
                    </Link>
                  ) : null}

                  <Link
                    href={`/dm/${userId}`}
                    className="inline-flex rounded-3xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                  >
                    Send direct message
                  </Link>
                </div>
              </div>

              {relationshipError ? (
                <div className="mt-6 rounded-3xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-200">{relationshipError}</div>
              ) : null}
            </section>

            <section className="grid gap-6 sm:grid-cols-2">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
                <p className="text-sm uppercase tracking-[0.35em] text-slate-400">Relationship</p>
                <div className="mt-4 space-y-3 text-slate-200">
                  <p>
                    Status:{" "}
                    <span className="font-semibold text-white">
                      {isOwnProfile ? "This is you" : areFriends ? "Friends" : viewerFollowsTarget ? "Following" : "Not following"}
                    </span>
                  </p>
                  {!isOwnProfile ? (
                    <p>
                      Follows you:{" "}
                      <span className="font-semibold text-white">{targetFollowsViewer ? "Yes" : "No"}</span>
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
                <p className="text-sm uppercase tracking-[0.35em] text-slate-400">Location</p>
                <div className="mt-4 space-y-3 text-slate-200">
                  <p>Country: <span className="font-semibold text-white">{profile.country_slug?.replace(/-/g, " ") ?? "Not set"}</span></p>
                  <p>City: <span className="font-semibold text-white">{profile.city_id ?? "Not set"}</span></p>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <div>
                <p className="text-sm uppercase tracking-[0.35em] text-cyan-300">Posts</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">Public posts</h2>
              </div>

              {posts.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2">
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
                <div className="rounded-3xl border border-dashed border-white/10 bg-white/5 p-8 text-center text-sm text-slate-400">
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
