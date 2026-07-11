"use client";

import SpotLocationSummary from "@/components/SpotLocationSummary";
import { getSpotCaption } from "@/lib/spotCaption";
import { shouldShowSpotLocation, type SpotLocationDisplayFields } from "@/lib/spotLocationDisplay";
import { formatPostTime } from "@/lib/posts";

type SpotPostMetaProps = {
  content?: string | null;
  location: SpotLocationDisplayFields;
  createdAt?: string | null;
  currentVisitedCount?: number;
  className?: string;
};

/** Caption, location, and time — Instagram / Threads style spot metadata. */
export default function SpotPostMeta({
  content,
  location,
  createdAt,
  currentVisitedCount,
  className = "",
}: SpotPostMetaProps) {
  const caption = getSpotCaption(content);
  const showLocation = shouldShowSpotLocation(location);

  if (!caption && !showLocation && !createdAt) {
    return null;
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {caption ? (
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-white">{caption}</p>
      ) : null}

      {showLocation ? (
        <SpotLocationSummary location={location} currentVisitedCount={currentVisitedCount} />
      ) : null}

      {createdAt ? (
        <time className="block text-xs text-slate-500" dateTime={createdAt}>
          {formatPostTime(createdAt)}
        </time>
      ) : null}
    </div>
  );
}
