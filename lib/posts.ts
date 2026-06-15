export type PostMediaFields = {
  media_url?: string | null;
  media_type?: string | null;
  image_url?: string | null;
  video_url?: string | null;
  video_cover_url?: string | null;
  thumbnail_url?: string | null;
};

/** Explicit FK for post author embed (posts.user_id → profiles.id). */
export const POST_AUTHOR_PROFILES_FKEY = "profiles!posts_user_id_fkey";
export const POST_AUTHOR_PROFILES_INNER = "profiles!posts_user_id_fkey!inner";

export function inferMediaTypeFromUrl(url: string | null | undefined): "image" | "video" | null {
  const raw = url?.trim();

  if (!raw) {
    return null;
  }

  try {
    const parsed = new URL(raw, typeof window !== "undefined" ? window.location.origin : "http://localhost");
    const pathname = parsed.pathname.toLowerCase();

    if (/\.(mp4|webm|mov|m4v)$/.test(pathname)) {
      return "video";
    }

    if (/\.(jpg|jpeg|png|gif|webp|heic|heif|avif)$/.test(pathname)) {
      return "image";
    }
  } catch {
    if (/\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(raw)) {
      return "video";
    }

    if (/\.(jpg|jpeg|png|gif|webp|heic|heif|avif)(\?|#|$)/i.test(raw)) {
      return "image";
    }
  }

  // URL might not include an extension (older uploads / signed URLs).
  return null;
}

/** Poster image for video posts (feed/profile/map grids). */
export function getPostThumbnailUrl(post: PostMediaFields) {
  const cover =
    post.video_cover_url?.trim() ||
    post.thumbnail_url?.trim() ||
    (post.media_type === "video" || post.video_url ? post.image_url?.trim() : null) ||
    null;

  if (cover) {
    return cover;
  }

  const { mediaUrl, mediaType } = getPostMedia(post);

  if (mediaType === "image" && mediaUrl) {
    return mediaUrl;
  }

  return null;
}

export function getPostMedia(post: PostMediaFields) {
  if (post.media_url) {
    const normalized = post.media_type?.trim().toLowerCase() ?? "";
    const inferred = inferMediaTypeFromUrl(post.media_url);
    const fallback =
      post.video_url?.trim()
        ? ("video" as const)
        : post.image_url?.trim()
          ? ("image" as const)
          : inferred ?? ("image" as const);

    return {
      mediaUrl: post.media_url,
      mediaType:
        normalized === "video" || normalized.includes("video")
          ? ("video" as const)
          : normalized === "image" || normalized === "photo" || normalized.includes("image") || normalized.includes("photo")
            ? ("image" as const)
            : fallback,
    };
  }

  if (post.video_url) {
    return { mediaUrl: post.video_url, mediaType: "video" as const };
  }

  if (post.image_url) {
    return { mediaUrl: post.image_url, mediaType: "image" as const };
  }

  return { mediaUrl: null, mediaType: null };
}

export function formatPostTime(createdAt: string) {
  const date = new Date(createdAt);

  if (Number.isNaN(date.getTime())) {
    return "Just now";
  }

  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60_000);

  if (diffMinutes < 1) {
    return "Just now";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);

  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
}
