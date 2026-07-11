import type { PostDetailRow } from "@/lib/postDetail";

const CACHE_TTL_MS = 5 * 60 * 1000;

type CachedPostDetail = {
  post: PostDetailRow;
  isDemo: boolean;
  cachedAt: number;
};

type PostDetailResult = {
  post: PostDetailRow | null;
  error: string | null;
  isDemo: boolean;
};

const cache = new Map<string, CachedPostDetail>();
const inFlight = new Map<string, Promise<PostDetailResult>>();

export function getCachedPostDetail(postId: string): PostDetailResult | null {
  const entry = cache.get(postId);

  if (!entry) {
    return null;
  }

  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    cache.delete(postId);
    return null;
  }

  return {
    post: entry.post,
    error: null,
    isDemo: entry.isDemo,
  };
}

export function setCachedPostDetail(postId: string, post: PostDetailRow, isDemo: boolean) {
  cache.set(postId, { post, isDemo, cachedAt: Date.now() });
}

export function getPostDetailInFlight(postId: string) {
  return inFlight.get(postId) ?? null;
}

export function setPostDetailInFlight(postId: string, promise: Promise<PostDetailResult>) {
  inFlight.set(postId, promise);

  void promise.finally(() => {
    if (inFlight.get(postId) === promise) {
      inFlight.delete(postId);
    }
  });
}

export function warmPostDetailCache(postId: string) {
  if (!postId || getCachedPostDetail(postId) || getPostDetailInFlight(postId)) {
    return;
  }

  void import("@/lib/postDetail").then(({ loadPostDetail }) => loadPostDetail(postId));
}
