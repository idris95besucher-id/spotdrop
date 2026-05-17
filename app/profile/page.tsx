"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { Camera, Loader2, UserRound } from "lucide-react";
import { getSafeAuthSession } from "@/lib/authSession";
import type { FollowProfile } from "@/lib/follows";
import { loadFollowConnections } from "@/lib/follows";
import { publicProfileUsername } from "@/lib/publicProfile";
import { ensureProfileRow } from "@/lib/profile";
import { uploadAvatarImage } from "@/lib/profileMedia";
import { logExactLoadError } from "@/lib/safeLoad";
import { supabase } from "@/lib/supabaseClient";
import CreatePostForm, { type CreatedProfilePost } from "@/components/CreatePostForm";
import PostMediaLink from "@/components/PostMediaLink";
import Shell from "@/components/Shell";

type ProfileData = {
  username?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  country_slug?: string | null;
  city_id?: string | null;
};

type ProfilePost = {
  id: string;
  user_id: string;
  content: string;
  visibility?: "public" | "private";
  image_url?: string | null;
  video_url?: string | null;
  media_url?: string | null;
  media_type?: string | null;
  created_at: string;
  updated_at?: string;
};

function getPostMedia(post: ProfilePost) {
  if (post.media_url) {
    return {
      mediaUrl: post.media_url,
      mediaType: post.media_type ?? (post.video_url ? "video" : "image"),
    };
  }

  if (post.video_url) {
    return { mediaUrl: post.video_url, mediaType: "video" };
  }

  if (post.image_url) {
    return { mediaUrl: post.image_url, mediaType: "image" };
  }

  return { mediaUrl: null, mediaType: null };
}

function formatPostTime(createdAt: string) {
  const date = new Date(createdAt);

  if (Number.isNaN(date.getTime())) {
    return "Just now";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [followers, setFollowers] = useState<FollowProfile[]>([]);
  const [friends, setFriends] = useState<FollowProfile[]>([]);
  const [publicPosts, setPublicPosts] = useState<ProfilePost[]>([]);
  const [privatePosts, setPrivatePosts] = useState<ProfilePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingConnections, setLoadingConnections] = useState(true);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [activeConnectionsTab, setActiveConnectionsTab] = useState<"followers" | "friends" | null>(null);
  const [activeContentTab, setActiveContentTab] = useState<"posts" | "private">("posts");
  const [connectionsError, setConnectionsError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    const timeoutId = setTimeout(() => showSuccessMessage("Profile updated successfully."), 0);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [showSuccessMessage]);

  useEffect(() => {
    return () => {
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const loadProfile = async () => {
      const { session, error: sessionError } = await getSafeAuthSession();

      setSession(session);

      if (sessionError) {
        setError(sessionError);
        setLoading(false);
        setLoadingConnections(false);
        setLoadingPosts(false);
        return;
      }

      if (!session?.user) {
        setLoading(false);
        setLoadingConnections(false);
        setLoadingPosts(false);
        return;
      }

      const ensuredProfile = await ensureProfileRow({ user: session.user });

      if (ensuredProfile.error && !ensuredProfile.needsOnboarding) {
        setError(ensuredProfile.error);
      }

      if (!ensuredProfile.profile?.username) {
        router.push("/onboarding");
        return;
      }

      setProfile(ensuredProfile.profile);

      const followConnectionsResult = await loadFollowConnections(session.user.id);

      const [
        { data: publicPostRows, error: publicPostsError },
        { data: privatePostRows, error: privatePostsError },
      ] = await Promise.all([
        supabase
          .from("posts")
          .select("*")
          .eq("user_id", session.user.id)
          .eq("visibility", "public")
          .order("created_at", { ascending: false }),
        supabase
          .from("posts")
          .select("*")
          .eq("user_id", session.user.id)
          .eq("visibility", "private")
          .order("created_at", { ascending: false }),
      ]);

      if (publicPostsError || privatePostsError) {
        logExactLoadError(publicPostsError ?? privatePostsError);
        setPublicPosts([]);
        setPrivatePosts([]);
      } else {
        setPublicPosts((publicPostRows ?? []) as ProfilePost[]);
        setPrivatePosts((privatePostRows ?? []) as ProfilePost[]);
      }

      if (followConnectionsResult.error) {
        setConnectionsError(followConnectionsResult.error);
        setFollowers([]);
        setFriends([]);
      } else {
        setConnectionsError(null);
        setFollowers(followConnectionsResult.data?.followers ?? []);
        setFriends(followConnectionsResult.data?.friends ?? []);
      }

      setLoadingConnections(false);
      setLoadingPosts(false);
      setLoading(false);
    };

    void loadProfile();
  }, [router]);

  const followersCount = followers.length;
  const friendsCount = friends.length;
  const postsCount = publicPosts.length;
  const activePosts = activeContentTab === "posts" ? publicPosts : privatePosts;
  const activeConnections = activeConnectionsTab === "friends" ? friends : followers;

  const toggleConnectionsTab = (tab: "followers" | "friends") => {
    setActiveConnectionsTab((current) => (current === tab ? null : tab));
  };

  const handlePostCreated = (post: CreatedProfilePost) => {
    console.log("profile post created with id:", post.id);
    if (post.visibility === "private") {
      setPrivatePosts((currentPosts) => [post, ...currentPosts]);
      setActiveContentTab("private");
    } else {
      setPublicPosts((currentPosts) => [post, ...currentPosts]);
      setActiveContentTab("posts");
    }
    showSuccessMessage("Post published.");
  };

  const handleAvatarUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!session?.user?.id) {
      setError("Please sign in to upload files.");
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
        throw new Error(updateError.message || "Unable to save your profile photo.");
      }

      setProfile((currentProfile) =>
        currentProfile ? { ...currentProfile, avatar_url: publicUrl } : { avatar_url: publicUrl }
      );
      showSuccessMessage("Profile photo updated.");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Unable to upload profile photo.");
    } finally {
      setUploadingAvatar(false);
      event.target.value = "";
    }
  };

  return (
    <Shell>
      {successMessage ? (
        <div className="fixed inset-x-4 top-4 z-50 mx-auto max-w-sm rounded-3xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-center text-sm font-medium text-emerald-200 shadow-lg shadow-black/30">
          {successMessage}
        </div>
      ) : null}

      <div className="mx-auto max-w-lg space-y-8 px-4 pb-10 pt-2 sm:max-w-xl">
        <section className="flex flex-col items-center gap-5 text-center">
          <div className="relative shrink-0">
            <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-slate-900 shadow-xl shadow-black/50 sm:h-36 sm:w-36">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <UserRound className="h-14 w-14 text-slate-500 sm:h-16 sm:w-16" strokeWidth={1.25} aria-hidden />
              )}
            </div>
            {session?.user && !loading ? (
              <label
                className="absolute bottom-0 right-0 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border-2 border-slate-950 bg-cyan-400 text-slate-950 shadow-md transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Upload profile photo"
              >
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploadingAvatar}
                  onChange={handleAvatarUpload}
                />
                {uploadingAvatar ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Camera className="h-4 w-4" strokeWidth={2} aria-hidden />
                )}
              </label>
            ) : null}
          </div>

          {!loading && profile?.username ? (
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold text-white">{publicProfileUsername(profile.username)}</h1>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">My Profile</p>
            </div>
          ) : null}

          {profile?.bio ? (
            <p className="max-w-sm text-sm leading-relaxed text-slate-400">{profile.bio}</p>
          ) : null}

          {loading ? (
            <p className="text-sm text-slate-500">Loading profile...</p>
          ) : error ? (
            <p className="text-sm text-red-300">{error}</p>
          ) : !session?.user ? (
            <div className="w-full space-y-4 rounded-2xl border border-dashed border-white/10 bg-white/5 p-6">
              <p className="font-medium text-white">You are not signed in.</p>
              <p className="text-sm text-slate-400">Sign in to access your profile and join city chat rooms.</p>
              <Link
                href="/auth/login"
                className="inline-flex rounded-full bg-cyan-500 px-6 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
              >
                Login now
              </Link>
            </div>
          ) : (
            <>
              <div className="grid w-full max-w-sm grid-cols-3 gap-2 sm:gap-3">
                <div className="rounded-2xl bg-white/5 px-2 py-3">
                  <p className="text-xl font-semibold text-white sm:text-2xl">{postsCount}</p>
                  <p className="mt-1 text-xs text-slate-500">Posts</p>
                </div>
                <button
                  type="button"
                  onClick={() => toggleConnectionsTab("followers")}
                  className={`rounded-2xl px-2 py-3 transition ${
                    activeConnectionsTab === "followers" ? "bg-cyan-400 text-slate-950" : "bg-white/5 hover:bg-white/10"
                  }`}
                >
                  <p
                    className={`text-xl font-semibold sm:text-2xl ${
                      activeConnectionsTab === "followers" ? "text-slate-950" : "text-white"
                    }`}
                  >
                    {followersCount}
                  </p>
                  <p
                    className={`mt-1 text-xs ${
                      activeConnectionsTab === "followers" ? "text-slate-700" : "text-slate-500"
                    }`}
                  >
                    Followers
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => toggleConnectionsTab("friends")}
                  className={`rounded-2xl px-2 py-3 transition ${
                    activeConnectionsTab === "friends" ? "bg-cyan-400 text-slate-950" : "bg-white/5 hover:bg-white/10"
                  }`}
                >
                  <p
                    className={`text-xl font-semibold sm:text-2xl ${
                      activeConnectionsTab === "friends" ? "text-slate-950" : "text-white"
                    }`}
                  >
                    {friendsCount}
                  </p>
                  <p
                    className={`mt-1 text-xs ${
                      activeConnectionsTab === "friends" ? "text-slate-700" : "text-slate-500"
                    }`}
                  >
                    Friends
                  </p>
                </button>
              </div>

              <div className="flex w-full max-w-sm flex-col gap-2.5 sm:flex-row sm:justify-center">
                <Link
                  href="/profile/edit"
                  className="inline-flex flex-1 items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
                >
                  Edit Profile
                </Link>
                <CreatePostForm userId={session.user.id} onCreated={handlePostCreated} />
              </div>
            </>
          )}
        </section>

        {session?.user && activeConnectionsTab ? (
          <section className="space-y-3">
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
              <div className="rounded-3xl border border-red-500/20 bg-red-500/5 p-6 text-sm text-red-200">{connectionsError}</div>
            ) : activeConnections.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-700 bg-slate-900/60 p-8 text-center text-slate-400">
                {activeConnectionsTab === "followers" ? "No followers yet." : "No friends yet."}
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
                        {activeConnectionsTab === "followers" ? "Follows you" : "Mutual follow"}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {session?.user ? (
          <section className="space-y-4">
            <div className="grid grid-cols-2 gap-2 rounded-3xl border border-white/10 bg-slate-950/70 p-1">
              <button
                type="button"
                onClick={() => setActiveContentTab("posts")}
                className={`rounded-3xl px-4 py-3 text-sm font-semibold transition ${
                  activeContentTab === "posts" ? "bg-white text-slate-950" : "text-slate-400 hover:bg-white/10 hover:text-white"
                }`}
              >
                Posts
              </button>
              <button
                type="button"
                onClick={() => setActiveContentTab("private")}
                className={`rounded-3xl px-4 py-3 text-sm font-semibold transition ${
                  activeContentTab === "private" ? "bg-white text-slate-950" : "text-slate-400 hover:bg-white/10 hover:text-white"
                }`}
              >
                Private
              </button>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">
                {activeContentTab === "posts" ? "Public posts" : "Private media"}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                {activeContentTab === "posts"
                  ? "Public posts and status updates appear in feed and on your public profile."
                  : "Private photos and videos are visible only to you."}
              </p>
            </div>

            {loadingPosts ? (
              <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={`post-loading-${index}`} className="aspect-square animate-pulse rounded-2xl bg-slate-900" />
                ))}
              </div>
            ) : activePosts.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {activePosts.map((post) => {
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
                {activeContentTab === "posts" ? "No public posts yet." : "No private media yet."}
              </div>
            )}
          </section>
        ) : null}
      </div>
    </Shell>
  );
}
