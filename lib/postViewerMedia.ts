import { getPostMedia, getPostThumbnailUrl, type PostMediaFields } from "@/lib/posts";
import { logVideoPlaybackDebug } from "@/lib/videoPlaybackDebug";

export type ReelMediaSources = {
  mediaUrl: string | null;
  mediaType: "image" | "video" | null;
  posterUrl: string | null;
};

export type ReelVideoPreloadMode = "metadata" | "auto";

const preloadedVideos = new Map<string, HTMLVideoElement>();

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

function applyPreloadVideoAttributes(video: HTMLVideoElement) {
  video.muted = true;
  video.playsInline = true;
  video.setAttribute("playsinline", "true");
  video.setAttribute("webkit-playsinline", "true");
  video.controls = false;
  video.disablePictureInPicture = true;
  video.setAttribute("disablepictureinpicture", "");
  video.setAttribute("disableremoteplayback", "");
  video.setAttribute("controlsList", "nodownload nofullscreen noremoteplayback");
  video.setAttribute("x-webkit-airplay", "deny");
  video.style.position = "absolute";
  video.style.width = "0";
  video.style.height = "0";
  video.style.opacity = "0";
  video.style.pointerEvents = "none";
  video.setAttribute("aria-hidden", "true");
  video.tabIndex = -1;
  video.setAttribute("data-reel-preload", "true");
}

/** Hidden off-screen video preload for adjacent reel slides only — never the active slide. */
export function preloadReelVideo(url: string, mode: ReelVideoPreloadMode = "metadata") {
  if (typeof document === "undefined" || !url.trim()) {
    return;
  }

  const normalized = url.trim();
  const existing = preloadedVideos.get(normalized);

  if (existing) {
    existing.preload = mode;
    existing.pause();
    return;
  }

  const video = document.createElement("video");
  applyPreloadVideoAttributes(video);
  video.preload = mode;
  video.src = normalized;
  document.body.appendChild(video);
  video.load();
  preloadedVideos.set(normalized, video);
}

/** Fully remove hidden preload so the fullscreen element owns the decoder. */
export function releasePreloadedReelVideo(url: string) {
  const normalized = url.trim();
  const existing = preloadedVideos.get(normalized);

  if (!existing) {
    return;
  }

  logVideoPlaybackDebug("releasePreloadedReelVideo", { url: normalized });
  existing.pause();
  existing.removeAttribute("src");
  existing.load();
  existing.remove();
  preloadedVideos.delete(normalized);
}

export function pausePreloadedReelVideo(url: string) {
  releasePreloadedReelVideo(url);
}

export function pauseAllPreloadedReelVideos() {
  for (const url of [...preloadedVideos.keys()]) {
    releasePreloadedReelVideo(url);
  }
}

/** Drop hidden preload elements that are no longer needed. */
export function cleanupReelVideoPreloads(keepUrls: ReadonlySet<string>) {
  for (const url of [...preloadedVideos.keys()]) {
    if (keepUrls.has(url)) {
      continue;
    }

    releasePreloadedReelVideo(url);
  }
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

  for (const url of urls) {
    const img = new window.Image();
    img.decoding = "async";
    img.src = url;
  }
}
