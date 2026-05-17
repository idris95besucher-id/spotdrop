/** Normalize Supabase post id (uuid string or bigint number) for links and queries. */
export function normalizePostId(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const id = String(value).trim();

  if (!id || id === "undefined" || id === "null") {
    return null;
  }

  return id;
}

/** Client-side demo feed cards only — not numeric database ids. */
export function isDemoPostId(postId: string) {
  return postId.startsWith("demo-post-");
}

/** Use string or number for .eq("id", …) when posts.id is bigint in Supabase. */
export function postIdForQuery(postId: string): string | number {
  if (/^\d+$/.test(postId)) {
    return Number(postId);
  }

  return postId;
}
