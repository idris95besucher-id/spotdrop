"use client";

import type { StoryRow } from "@/lib/stories";
import { publicProfileUsername } from "@/lib/publicProfile";

type ProfileStoriesBarProps = {
  stories: StoryRow[];
  username: string;
  showArchiveLink?: boolean;
};

export default function ProfileStoriesBar({ stories, username, showArchiveLink = true }: ProfileStoriesBarProps) {
  if (stories.length === 0 && !showArchiveLink) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Stories</p>
        {showArchiveLink ? (
          <span className="text-[11px] text-slate-500">Archive after 24h</span>
        ) : null}
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {stories.map((story) => (
          <a
            key={story.id}
            href={story.media_url}
            target="_blank"
            rel="noreferrer"
            className="flex shrink-0 flex-col items-center gap-1.5"
          >
            <span className="rounded-full bg-gradient-to-tr from-cyan-400 via-fuchsia-400 to-amber-300 p-[2px]">
              <span className="block h-16 w-16 overflow-hidden rounded-full border-2 border-slate-950 bg-slate-900">
                {story.media_type === "video" ? (
                  <video src={story.media_url} className="h-full w-full object-cover" muted playsInline />
                ) : (
                  <img src={story.media_url} alt="" className="h-full w-full object-cover" />
                )}
              </span>
            </span>
            <span className="max-w-[72px] truncate text-[10px] font-medium text-slate-300">
              {publicProfileUsername(username)}
            </span>
          </a>
        ))}
        {stories.length === 0 ? (
          <p className="py-4 text-sm text-slate-500">No active stories. Add one — it lasts 24 hours.</p>
        ) : null}
      </div>
    </div>
  );
}
