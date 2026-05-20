import { CLIENT_DEMO_FEED_POSTS, FEED_POST_SELECT, FEED_POST_SELECT_LEGACY, type FeedPostRow } from "@/lib/demoFeed";
import { isGuidePlaceRelationMissing } from "@/lib/guidePlaces";
import { publicProfileUsername } from "@/lib/publicProfile";
import { logExactLoadError } from "@/lib/safeLoad";
import { supabase } from "@/lib/supabaseClient";

function sanitizeFeedPost(post: FeedPostRow): FeedPostRow {
  return {
    ...post,
    profiles: {
      ...post.profiles,
      username: publicProfileUsername(post.profiles.username),
    },
  };
}

function sanitizeFeedPosts(posts: FeedPostRow[]) {
  return posts.map(sanitizeFeedPost);
}

async function loadPublicPosts(isDemo: boolean, limit = 60, select = FEED_POST_SELECT) {
  return supabase
    .from("posts")
    .select(select)
    .eq("visibility", "public")
    .eq("profiles.is_private", false)
    .eq("profiles.is_demo", isDemo)
    .order("created_at", { ascending: false })
    .limit(limit);
}

async function loadPublicPostsWithGuideFallback(isDemo: boolean, limit = 60) {
  const result = await loadPublicPosts(isDemo, limit);

  if (result.error?.code !== "42703" && !isGuidePlaceRelationMissing(result.error)) {
    return result;
  }

  console.error("Feed guide fields missing:", JSON.stringify(result.error, null, 2));
  return loadPublicPosts(isDemo, limit, FEED_POST_SELECT_LEGACY);
}

export async function loadFeedPosts(): Promise<{
  posts: FeedPostRow[];
  error: string | null;
  showingDemoGuide: boolean;
}> {
  const { data: realPosts, error: realError } = await loadPublicPostsWithGuideFallback(false);

  if (realError) {
    logExactLoadError(realError);
    return {
      posts: CLIENT_DEMO_FEED_POSTS,
      error: null,
      showingDemoGuide: true,
    };
  }

  if ((realPosts ?? []).length > 0) {
    return {
      posts: sanitizeFeedPosts((realPosts ?? []) as unknown as FeedPostRow[]),
      error: null,
      showingDemoGuide: false,
    };
  }

  const { data: demoPosts, error: demoError } = await loadPublicPostsWithGuideFallback(true);

  if (demoError) {
    logExactLoadError(demoError);
    return {
      posts: CLIENT_DEMO_FEED_POSTS,
      error: null,
      showingDemoGuide: true,
    };
  }

  if ((demoPosts ?? []).length > 0) {
    return {
      posts: sanitizeFeedPosts((demoPosts ?? []) as unknown as FeedPostRow[]),
      error: null,
      showingDemoGuide: true,
    };
  }

  return {
    posts: CLIENT_DEMO_FEED_POSTS,
    error: null,
    showingDemoGuide: true,
  };
}
