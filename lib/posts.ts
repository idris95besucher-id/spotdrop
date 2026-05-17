export type PostMediaFields = {
  media_url?: string | null;
  media_type?: string | null;
  image_url?: string | null;
  video_url?: string | null;
};

export function getPostMedia(post: PostMediaFields) {
  if (post.media_url) {
    return {
      mediaUrl: post.media_url,
      mediaType: post.media_type ?? (post.video_url ? "video" : "image"),
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
