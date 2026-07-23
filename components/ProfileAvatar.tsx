"use client";

import { useEffect, useState } from "react";
import { UserRound } from "lucide-react";
import { normalizeAvatarUrl } from "@/lib/avatarUrl";

type ProfileAvatarProps = {
  src?: string | null;
  alt?: string;
  /** Outer circle size classes, e.g. "h-10 w-10". */
  sizeClassName?: string;
  /** Fallback UserRound size classes, e.g. "h-5 w-5". */
  iconClassName?: string;
  iconStrokeWidth?: number;
  /** Extra classes on the outer circle (border, bg overrides, etc.). */
  className?: string;
};

/**
 * Shared profile avatar used across SpotDrop.
 *
 * Never mounts an <img> until the URL has successfully loaded.
 * Missing / invalid / deleted / failed URLs show the Story-screen UserRound placeholder.
 */
export default function ProfileAvatar({
  src,
  alt = "",
  sizeClassName = "h-10 w-10",
  iconClassName = "h-5 w-5",
  iconStrokeWidth = 1.25,
  className = "",
}: ProfileAvatarProps) {
  const url = normalizeAvatarUrl(src);
  /** Only set after a successful Image() probe — guarantees no broken <img>. */
  const [readyUrl, setReadyUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    setReadyUrl(null);

    if (!url) {
      return;
    }

    const probe = new Image();
    probe.onload = () => {
      if (!cancelled) {
        setReadyUrl(url);
      }
    };
    probe.onerror = () => {
      if (!cancelled) {
        setReadyUrl(null);
      }
    };
    probe.src = url;

    return () => {
      cancelled = true;
      probe.onload = null;
      probe.onerror = null;
    };
  }, [url]);

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-900 ${sizeClassName} ${className}`}
    >
      {readyUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={readyUrl}
          alt={alt}
          className="h-full w-full object-cover object-center"
          draggable={false}
        />
      ) : (
        <UserRound
          className={`text-slate-500 ${iconClassName}`}
          strokeWidth={iconStrokeWidth}
          aria-hidden
        />
      )}
    </span>
  );
}
