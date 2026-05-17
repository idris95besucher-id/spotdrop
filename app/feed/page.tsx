"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { UserRound } from "lucide-react";
import { type FeedPostRow } from "@/lib/demoFeed";
import { loadFeedPosts } from "@/lib/feed";
import { formatPostTime, getPostMedia } from "@/lib/posts";
import PostMediaLink from "@/components/PostMediaLink";
import Shell from "@/components/Shell";

function GuideBadge() {
  return (
    <span className="shrink-0 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300">
      Guide
    </span>
  );
}

export default function FeedPage() {
  const [posts, setPosts] = useState<FeedPostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadFeed = async () => {
      setLoading(true);
      setError(null);

      const result = await loadFeedPosts();
      setPosts(result.posts);
      setError(result.error);
      setLoading(false);
    };

    void loadFeed();
  }, []);

  return (
    <Shell>
      <div className="mx-auto w-full max-w-lg space-y-6">
        <section className="rounded-3xl border border-white/10 bg-slate-900/90 p-6 shadow-xl shadow-black/30">
          <p className="text-sm uppercase tracking-[0.35em] text-cyan-300">Feed</p>
          <h1 className="mt-3 text-3xl font-semibold text-white">Discover posts</h1>
        </section>

        {loading ? (
          <div className="space-y-5">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={`feed-skeleton-${index}`}
                className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80"
              >
                <div className="flex items-center gap-3 border-b border-white/10 p-4">
                  <div className="h-11 w-11 animate-pulse rounded-full bg-slate-800" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-28 animate-pulse rounded-full bg-slate-800" />
                    <div className="h-3 w-16 animate-pulse rounded-full bg-slate-800/70" />
                  </div>
                </div>
                <div className="aspect-[4/5] animate-pulse bg-slate-800/80" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="rounded-3xl border border-red-500/20 bg-red-500/5 p-6 text-sm text-red-200">{error}</div>
        ) : (
          <div className="space-y-5 pb-8">
            {posts.map((post) => {
              const { mediaUrl, mediaType } = getPostMedia(post);
              const username = post.profiles.username || "User";
              const isDemo = post.profiles.is_demo;

              return (
                <article
                  key={post.id}
                  className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900 shadow-xl shadow-black/30"
                >
                  <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3.5">
                    {isDemo ? (
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-cyan-400/20 bg-cyan-500/10 text-sm font-semibold text-cyan-100">
                          <UserRound className="h-5 w-5 text-cyan-200" strokeWidth={1.5} aria-hidden />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold text-white">@{username}</p>
                            <GuideBadge />
                          </div>
                          <time className="text-xs text-slate-500" dateTime={post.created_at}>
                            {formatPostTime(post.created_at)}
                          </time>
                        </div>
                      </div>
                    ) : (
                      <Link
                        href={`/user/${post.user_id}`}
                        className="flex min-w-0 flex-1 items-center gap-3 transition hover:opacity-90"
                      >
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-slate-800 text-sm font-semibold text-white">
                          {post.profiles.avatar_url ? (
                            <img
                              src={post.profiles.avatar_url}
                              alt={username}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <UserRound className="h-5 w-5 text-slate-400" strokeWidth={1.5} aria-hidden />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-white">{username}</p>
                          <time className="text-xs text-slate-500" dateTime={post.created_at}>
                            {formatPostTime(post.created_at)}
                          </time>
                        </div>
                      </Link>
                    )}
                  </header>

                  {mediaUrl ? (
                    <PostMediaLink postId={post.id} className="block bg-black">
                      {mediaType === "video" ? (
                        <video src={mediaUrl} playsInline muted className="max-h-[70vh] w-full object-cover" />
                      ) : (
                        <img src={mediaUrl} alt="" className="max-h-[70vh] w-full object-cover" />
                      )}
                    </PostMediaLink>
                  ) : null}

                  {post.content ? (
                    <div className="px-4 py-3.5">
                      <p className="whitespace-pre-wrap text-sm leading-7 text-slate-200">{post.content}</p>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </Shell>
  );
}
