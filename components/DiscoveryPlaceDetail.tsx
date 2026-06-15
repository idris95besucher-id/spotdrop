"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Bookmark, BookmarkCheck, Loader2, X } from "lucide-react";
import type { DiscoveryPlace } from "@/lib/discoveryMap";
import { loadPlaceSaved, togglePlaceSaved } from "@/lib/discoveryPlaces";
import { loadPlaceFeed, type PlaceFeedItem, type StoryRow } from "@/lib/stories";
import { formatPostTime } from "@/lib/posts";
import { publicProfileUsername } from "@/lib/publicProfile";

type DiscoveryPlaceDetailProps = {
  place: DiscoveryPlace;
  userId: string | null;
  onClose: () => void;
};

export default function DiscoveryPlaceDetail({ place, userId, onClose }: DiscoveryPlaceDetailProps) {
  const [items, setItems] = useState<PlaceFeedItem[]>([]);
  const [placeStories, setPlaceStories] = useState<StoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [savingPlace, setSavingPlace] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [feedResult, savedResult] = await Promise.all([
      loadPlaceFeed(place.id),
      loadPlaceSaved(userId, place.id),
    ]);

    setItems(feedResult.items);
    setPlaceStories(feedResult.stories);
    setSaved(savedResult.saved);
    setError(feedResult.error ?? savedResult.error);
    setLoading(false);
  }, [place.id, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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

  const title = `Posts in ${place.name}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close"
      />

      <div className="relative z-10 flex max-h-[min(92vh,820px)] w-full max-w-lg flex-col overflow-hidden rounded-t-[2rem] border border-white/10 bg-slate-900 shadow-2xl shadow-black/50 sm:rounded-[2rem]">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 px-4 py-4">
          <div className="min-w-0">
            <h3 className="text-xl font-semibold text-white">{title}</h3>
            {place.short_description ? (
              <p className="mt-1 text-sm text-slate-400">{place.short_description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full border border-white/15 bg-slate-950/70 p-2 text-slate-200"
            aria-label="Close"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-4 py-3">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!userId || savingPlace}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-50 ${
              saved
                ? "bg-cyan-400/20 text-cyan-200 ring-1 ring-cyan-300/40"
                : "border border-white/10 bg-white/5 text-white"
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
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {error ? <p className="mb-3 text-xs text-amber-200">{error}</p> : null}

          {placeStories.length > 0 ? (
            <div className="mb-4">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Stories</p>
              <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {placeStories.map((story) => (
                  <a
                    key={story.id}
                    href={story.media_url ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 overflow-hidden rounded-2xl border border-cyan-400/25 bg-slate-950"
                  >
                    {story.media_type === "video" ? (
                      <video src={story.media_url!} className="h-20 w-20 object-cover" muted playsInline />
                    ) : (
                      <img src={story.media_url!} alt="" className="h-20 w-20 object-cover" />
                    )}
                  </a>
                ))}
              </div>
            </div>
          ) : null}

          {loading ? (
            <p className="py-12 text-center text-sm text-slate-400">Loading posts…</p>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 py-12 text-center">
              <p className="text-sm text-slate-400">No posts in {place.name} yet.</p>
              <p className="mt-2 text-xs text-slate-500">
                Share a story from your profile with &quot;Share in Room City&quot; to appear here.
              </p>
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-2">
              {items.map((item) => {
                const href = item.kind === "post" && item.post_id ? `/posts/${item.post_id}` : item.media_url ?? "#";
                const isExternal = item.kind === "story";

                return (
                  <li key={item.id}>
                    <Link
                      href={href}
                      target={isExternal ? "_blank" : undefined}
                      rel={isExternal ? "noreferrer" : undefined}
                      className="block overflow-hidden rounded-2xl border border-white/10 bg-slate-950/60 transition hover:border-cyan-300/30"
                    >
                      {item.media_url ? (
                        item.media_type === "video" ? (
                          <video src={item.media_url} className="aspect-square w-full object-cover" muted playsInline />
                        ) : (
                          <img src={item.media_url} alt="" className="aspect-square w-full object-cover" />
                        )
                      ) : (
                        <div className="flex aspect-square items-center justify-center p-3 text-center text-xs text-slate-300">
                          {item.content.slice(0, 100)}
                        </div>
                      )}
                      <div className="space-y-1 border-t border-white/10 p-2.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate text-xs font-semibold text-cyan-200">
                            {publicProfileUsername(item.profiles?.username)}
                          </span>
                          {item.kind === "story" ? (
                            <span className="rounded-full bg-fuchsia-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-fuchsia-200">
                              Story
                            </span>
                          ) : null}
                        </div>
                        {item.content ? (
                          <p className="line-clamp-2 text-[11px] text-slate-400">{item.content}</p>
                        ) : null}
                        <p className="text-[10px] text-slate-600">{formatPostTime(item.created_at)}</p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
