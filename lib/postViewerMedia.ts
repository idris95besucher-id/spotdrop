import { getPostMedia, getPostThumbnailUrl, type PostMediaFields } from "@/lib/posts";

export type ReelMediaSources = {
  mediaUrl: string | null;
  mediaType: "image" | "video" | null;
  posterUrl: string | null;
};

function inferMediaType(
  post: PostMediaFields,
  mediaUrl: string | null,
  mediaType: string | null | undefined
): "image" | "video" | null {
  const normalized = mediaType?.trim().toLowerCase() ?? "";

  if (normalized === "video" || normalized.includes("video")) {
    return "video";
  }

  if (
    normalized === "image" ||
    normalized === "photo" ||
    normalized.includes("image") ||
    normalized.includes("photo")
  ) {
    return "image";
  }

  if (!mediaUrl) {
    return post.video_url?.trim() ? "video" : post.image_url?.trim() ? "image" : null;
  }

  if (post.video_cover_url?.trim()) {
    return "video";
  }

  try {
    const parsed = new URL(mediaUrl, typeof window !== "undefined" ? window.location.origin : "http://localhost");
    const pathname = parsed.pathname.toLowerCase();

    if (/\.(mp4|webm|mov|m4v)$/.test(pathname)) {
      return "video";
    }
  } catch {
    // ignore, fallback to regex below
  }

  if (/\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(mediaUrl) || post.video_url?.trim() === mediaUrl) {
    return "video";
  }

  return "image";
}

export function getReelMediaSources(post: PostMediaFields): ReelMediaSources {
  const { mediaUrl, mediaType } = getPostMedia(post);
  const resolvedType = inferMediaType(post, mediaUrl, mediaType);
  let posterUrl = getPostThumbnailUrl(post);

  if (!posterUrl && resolvedType === "video" && post.image_url?.trim()) {
    posterUrl = post.image_url.trim();
  }

  return {
    mediaUrl,
    mediaType: resolvedType,
    posterUrl,
  };
}

/** Preload poster / image for upcoming slides (browser cache). */
export function preloadReelMediaSources(sources: ReelMediaSources) {
  if (typeof window === "undefined") {
    return;
  }

  const urls = new Set<string>();

  if (sources.posterUrl) {
    urls.add(sources.posterUrl);
  }

  if (sources.mediaType === "image" && sources.mediaUrl) {
    urls.add(sources.mediaUrl);
  }

  if (
    typeof document !== "undefined" &&
    sources.mediaType === "video" &&
    sources.mediaUrl &&
    !sources.posterUrl
  ) {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = sources.mediaUrl;
  }

  for (const url of urls) {
    const img = new window.Image();
    img.decoding = "async";
    img.src = url;
  }
}
