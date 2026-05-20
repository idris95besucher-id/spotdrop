"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  Bookmark,
  BookmarkCheck,
  ExternalLink,
  Loader2,
  MessageCircle,
  Send,
  X,
} from "lucide-react";
import OfficialAIGuideBadge from "@/components/OfficialAIGuideBadge";
import DiscoveryPlaceUpload from "@/components/DiscoveryPlaceUpload";
import {
  DISCOVERY_CATEGORY_LABELS,
  type DiscoveryPlace,
} from "@/lib/discoveryMap";
import {
  addPlaceComment,
  getPostDisplayMedia,
  loadPlaceComments,
  loadPlaceContent,
  loadPlaceSaved,
  togglePlaceSaved,
  type DiscoveryPlaceComment,
  type DiscoveryPlacePost,
} from "@/lib/discoveryPlaces";
import { formatPostTime } from "@/lib/posts";
import { publicProfileUsername } from "@/lib/publicProfile";

type DiscoveryPlaceDetailProps = {
  place: DiscoveryPlace;
  userId: string | null;
  onClose: () => void;
};

type DetailTab = "photos" | "stories" | "videos" | "posts" | "comments";

const TABS: { id: DetailTab; label: string }[] = [
  { id: "photos", label: "Photos" },
  { id: "stories", label: "Stories" },
  { id: "videos", label: "Videos" },
  { id: "posts", label: "Guide" },
  { id: "comments", label: "Comments" },
];

function isGuidePost(post: DiscoveryPlacePost) {
  return Boolean(post.profiles?.is_ai_guide || post.profiles?.is_official);
}

export default function DiscoveryPlaceDetail({ place, userId, onClose }: DiscoveryPlaceDetailProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>("photos");
  const [posts, setPosts] = useState<DiscoveryPlacePost[]>([]);
  const [comments, setComments] = useState<DiscoveryPlaceComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [savingPlace, setSavingPlace] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [contentResult, commentsResult, savedResult] = await Promise.all([
      loadPlaceContent(place.id),
      loadPlaceComments(place.id),
      loadPlaceSaved(userId, place.id),
    ]);

    setPosts(contentResult.posts);
    setComments(commentsResult.comments);
    setSaved(savedResult.saved);
    setError(contentResult.error ?? commentsResult.error ?? savedResult.error);
    setLoading(false);
  }, [place.id, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const photos = useMemo(
    () =>
      posts.filter((post) => {
        const media = getPostDisplayMedia(post);
        return media?.type === "image";
      }),
    [posts]
  );

  const stories = useMemo(() => posts.filter((post) => post.content_kind === "story"), [posts]);
  const videos = useMemo(
    () =>
      posts.filter((post) => {
        const media = getPostDisplayMedia(post);
        return post.content_kind === "video" || media?.type === "video";
      }),
    [posts]
  );

  const guidePosts = useMemo(
    () => posts.filter((post) => post.content_kind === "post" && (isGuidePost(post) || !getPostDisplayMedia(post))),
    [posts]
  );

  const userPosts = useMemo(
    () => posts.filter((post) => post.content_kind === "post" && !isGuidePost(post)),
    [posts]
  );

  const handleSave = async () => {
    if (!userId) {
      return;
    }

    setSavingPlace(true);
    const result = await togglePlaceSaved(userId, place.id, saved);
    if (!result.error) {
      setSaved(result.saved);
    } else {
      setError(result.error);
    }
    setSavingPlace(false);
  };

  const handleComment = async (event: FormEvent) => {
    event.preventDefault();

    if (!userId || !commentDraft.trim()) {
      return;
    }

    setPostingComment(true);
    const result = await addPlaceComment(place.id, userId, commentDraft.trim());

    if (result.comment) {
      setComments((current) => [...current, result.comment!]);
      setCommentDraft("");
    } else if (result.error) {
      setError(result.error);
    }

    setPostingComment(false);
  };

  const renderMediaGrid = (items: DiscoveryPlacePost[]) => {
    if (loading) {
      return <p className="py-8 text-center text-sm text-slate-400">Loading…</p>;
    }

    if (items.length === 0) {
      return (
        <p className="rounded-2xl border border-dashed border-white/10 py-8 text-center text-sm text-slate-400">
          Nothing here yet. Be the first to share.
        </p>
      );
    }

    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {items.map((post) => {
          const media = getPostDisplayMedia(post);

          return (
            <Link
              key={post.id}
              href={`/posts/${post.id}`}
              className="group overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60"
            >
              {media ? (
                media.type === "video" ? (
                  <video src={media.url} className="aspect-square w-full object-cover" muted playsInline />
                ) : (
                  <img src={media.url} alt="" className="aspect-square w-full object-cover transition group-hover:scale-105" />
                )
              ) : (
                <div className="flex aspect-square items-center justify-center p-3 text-center text-xs text-slate-300">
                  {post.content.slice(0, 80)}
                </div>
              )}
              {isGuidePost(post) ? (
                <div className="border-t border-white/10 px-2 py-1.5">
                  <OfficialAIGuideBadge className="scale-90 origin-left" />
                </div>
              ) : null}
            </Link>
          );
        })}
      </div>
    );
  };

  const renderPostList = (items: DiscoveryPlacePost[]) => {
    if (loading) {
      return <p className="py-8 text-center text-sm text-slate-400">Loading…</p>;
    }

    if (items.length === 0) {
      return (
        <p className="rounded-2xl border border-dashed border-white/10 py-8 text-center text-sm text-slate-400">
          No guide posts yet.
        </p>
      );
    }

    return (
      <ul className="space-y-3">
        {items.map((post) => (
          <li key={post.id}>
            <Link
              href={`/posts/${post.id}`}
              className="block rounded-2xl border border-white/10 bg-slate-900/50 p-4 transition hover:border-cyan-300/25"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-cyan-200">
                  {publicProfileUsername(post.profiles?.username)}
                </span>
                {isGuidePost(post) ? <OfficialAIGuideBadge /> : null}
                <span className="text-[11px] text-slate-500">{formatPostTime(post.created_at)}</span>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-200">{post.content}</p>
            </Link>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close place"
      />

      <div className="relative z-10 flex max-h-[min(92vh,820px)] w-full max-w-lg flex-col overflow-hidden rounded-t-[2rem] border border-white/10 bg-slate-900 shadow-2xl shadow-black/50 sm:rounded-[2rem]">
        <div className="relative shrink-0">
          {place.hero_image_url ? (
            <img src={place.hero_image_url} alt="" className="h-44 w-full object-cover sm:h-52" />
          ) : (
            <div className="h-44 w-full bg-gradient-to-br from-cyan-500/25 via-slate-900 to-indigo-600/20 sm:h-52" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/20 to-transparent" />
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 rounded-full border border-white/15 bg-slate-950/70 p-2 text-slate-200 transition hover:bg-slate-900"
            aria-label="Close"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
          <div className="absolute bottom-0 left-0 right-0 p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200">
              {DISCOVERY_CATEGORY_LABELS[place.category]}
            </p>
            <h3 className="mt-1 text-2xl font-semibold text-white">{place.name}</h3>
            {place.short_description ? (
              <p className="mt-1 text-sm text-slate-300">{place.short_description}</p>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/10 px-4 py-3">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!userId || savingPlace}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition disabled:opacity-50 ${
              saved
                ? "bg-cyan-400/20 text-cyan-200 ring-1 ring-cyan-300/40"
                : "border border-white/10 bg-white/5 text-white hover:bg-white/10"
            }`}
          >
            {savingPlace ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : saved ? (
              <BookmarkCheck className="h-4 w-4" aria-hidden />
            ) : (
              <Bookmark className="h-4 w-4" aria-hidden />
            )}
            {saved ? "Saved" : "Save place"}
          </button>
          {place.official_url ? (
            <a
              href={place.official_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
            >
              Official
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          ) : null}
        </div>

        {place.official_summary ? (
          <div className="shrink-0 border-b border-white/10 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <OfficialAIGuideBadge />
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Swiss Guide</span>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-200">{place.official_summary}</p>
          </div>
        ) : null}

        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-white/10 px-3 py-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                activeTab === tab.id
                  ? "bg-cyan-400 text-slate-950"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {error ? <p className="mb-3 text-xs text-amber-200">{error}</p> : null}

          {activeTab === "photos" ? renderMediaGrid(photos) : null}
          {activeTab === "stories" ? renderMediaGrid(stories) : null}
          {activeTab === "videos" ? renderMediaGrid(videos) : null}
          {activeTab === "posts" ? (
            <div className="space-y-4">
              {renderPostList(guidePosts)}
              {userPosts.length > 0 ? (
                <div>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Community</p>
                  {renderPostList(userPosts)}
                </div>
              ) : null}
            </div>
          ) : null}
          {activeTab === "comments" ? (
            <div className="space-y-4">
              <ul className="space-y-3">
                {comments.map((comment) => (
                  <li key={comment.id} className="flex gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-white">
                      {publicProfileUsername(comment.profiles?.username).charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-cyan-200">
                        {publicProfileUsername(comment.profiles?.username)}
                      </p>
                      <p className="mt-1 text-sm text-slate-200">{comment.content}</p>
                      <p className="mt-1 text-[11px] text-slate-500">{formatPostTime(comment.created_at)}</p>
                    </div>
                  </li>
                ))}
                {!loading && comments.length === 0 ? (
                  <p className="text-center text-sm text-slate-400">No comments yet.</p>
                ) : null}
              </ul>
              <form onSubmit={(event) => void handleComment(event)} className="flex gap-2">
                <textarea
                  value={commentDraft}
                  onChange={(event) => setCommentDraft(event.target.value)}
                  rows={2}
                  placeholder={userId ? "Add a comment…" : "Sign in to comment"}
                  disabled={!userId || postingComment}
                  className="min-h-[44px] flex-1 resize-none rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/50 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={!userId || postingComment || !commentDraft.trim()}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cyan-400 text-slate-950 disabled:opacity-50"
                  aria-label="Send comment"
                >
                  {postingComment ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Send className="h-4 w-4" aria-hidden />
                  )}
                </button>
              </form>
            </div>
          ) : null}

          <div className="mt-6">
            <p className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              <MessageCircle className="h-3.5 w-3.5" aria-hidden />
              Add to this place
            </p>
            <DiscoveryPlaceUpload
              placeId={place.id}
              userId={userId}
              defaultKind={activeTab === "stories" ? "story" : activeTab === "videos" ? "video" : "post"}
              onCreated={() => void refresh()}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
