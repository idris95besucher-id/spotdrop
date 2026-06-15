const DEFAULT_ACTIVITY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function hasRecentProfileActivity(
  posts: Array<{ created_at: string }>,
  withinMs = DEFAULT_ACTIVITY_WINDOW_MS
) {
  if (posts.length === 0) {
    return false;
  }

  const cutoff = Date.now() - withinMs;

  return posts.some((post) => {
    const createdAt = new Date(post.created_at).getTime();

    return Number.isFinite(createdAt) && createdAt >= cutoff;
  });
}
