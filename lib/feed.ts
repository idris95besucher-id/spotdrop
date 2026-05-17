import { CLIENT_DEMO_FEED_POSTS, FEED_POST_SELECT, type FeedPostRow } from "@/lib/demoFeed";
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

async function loadPublicPosts(isDemo: boolean, limit = 60) {
  return supabase
    .from("posts")
    .select(FEED_POST_SELECT)
    .eq("visibility", "public")
    .eq("profiles.is_private", false)
    .eq("profiles.is_demo", isDemo)
    .order("created_at", { ascending: false })
    .limit(limit);
}

export async function loadFeedPosts(): Promise<{
  posts: FeedPostRow[];
  error: string | null;
  showingDemoGuide: boolean;
}> {
  const { data: realPosts, error: realError } = await loadPublicPosts(false);

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
      posts: sanitizeFeedPosts((realPosts ?? []) as FeedPostRow[]),
      error: null,
      showingDemoGuide: false,
    };
  }

  const { data: demoPosts, error: demoError } = await loadPublicPosts(true);

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
      posts: sanitizeFeedPosts((demoPosts ?? []) as FeedPostRow[]),
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
