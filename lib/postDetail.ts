import { CLIENT_DEMO_FEED_POSTS } from "@/lib/demoFeed";
import type { PostMediaFields } from "@/lib/posts";
import { isDemoPostId, normalizePostId, postIdForQuery } from "@/lib/postIds";
import { logExactLoadError, userFacingSupabaseListError } from "@/lib/safeLoad";
import { supabase } from "@/lib/supabaseClient";

export type PostDetailRow = PostMediaFields & {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at?: string;
};

export function findDemoPost(postId: string): PostDetailRow | null {
  const demo = CLIENT_DEMO_FEED_POSTS.find((post) => post.id === postId);

  if (!demo) {
    return null;
  }

  return {
    id: demo.id,
    user_id: demo.user_id,
    content: demo.content,
    created_at: demo.created_at,
    image_url: demo.image_url ?? null,
    video_url: demo.video_url ?? null,
    media_url: demo.media_url ?? null,
    media_type: demo.media_type ?? null,
  };
}

export async function loadPostDetail(postId: string): Promise<{
  post: PostDetailRow | null;
  error: string | null;
  isDemo: boolean;
}> {
  const normalizedId = normalizePostId(postId);

  if (!normalizedId) {
    return { post: null, error: "Post not found.", isDemo: false };
  }

  if (isDemoPostId(normalizedId)) {
    const demoPost = findDemoPost(normalizedId);
    return {
      post: demoPost,
      error: demoPost ? null : "Post not found.",
      isDemo: true,
    };
  }

  try {
    const queryId = postIdForQuery(normalizedId);
    const { data, error } = await supabase.from("posts").select("*").eq("id", queryId).single();

    console.log("post detail query result:", { paramsPostId: normalizedId, queryId, data, error });

    if (error) {
      logExactLoadError(error);
      return { post: null, error: userFacingSupabaseListError(error) ?? "Unable to load this post.", isDemo: false };
    }

    if (!data) {
      return { post: null, error: "Post not found.", isDemo: false };
    }

    const row = data as PostDetailRow & { id: string | number };
    return {
      post: { ...row, id: normalizePostId(row.id) ?? normalizedId },
      error: null,
      isDemo: false,
    };
  } catch (error) {
    logExactLoadError(error);
    const message = error instanceof Error ? error.message : "Unable to load this post.";
    return { post: null, error: message, isDemo: false };
  }
}
