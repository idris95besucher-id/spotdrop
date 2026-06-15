import type { PostMediaFields } from "@/lib/posts";
import type { GuidePlace } from "@/lib/guidePlaces";

export const DEMO_PROFILE_IDS = {
  food_finder: "a1000001-0001-4000-8000-000000000002",
  city_tips: "a1000001-0001-4000-8000-000000000003",
  travel_local: "a1000001-0001-4000-8000-000000000004",
} as const;

export type FeedPostProfile = {
  username: string;
  avatar_url?: string | null;
  is_private: boolean;
  is_demo: boolean;
};

export type FeedPostRow = PostMediaFields & {
  id: string;
  user_id: string;
  content: string;
  visibility?: "public" | "private";
  created_at: string;
  profiles: FeedPostProfile;
  guide_places?: GuidePlace | GuidePlace[] | null;
};

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

/** Client fallback when demo rows are not seeded in Supabase yet. */
export const CLIENT_DEMO_FEED_POSTS: FeedPostRow[] = [
  {
    id: "demo-post-0001",
    user_id: DEMO_PROFILE_IDS.food_finder,
    content:
      "Tonight’s pick: a small trattoria side street with no sign out front. Ask for the daily special — the pasta is worth the wait.",
    media_url: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=900&q=80",
    media_type: "image",
    created_at: hoursAgo(2),
    profiles: {
      username: "food_finder",
      avatar_url: null,
      is_private: false,
      is_demo: true,
    },
  },
  {
    id: "demo-post-0003",
    user_id: DEMO_PROFILE_IDS.city_tips,
    content:
      "Hidden courtyard behind the market — follow the blue gate, cut left at the fountain. Best light after 4pm for photos.",
    media_url: "https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=900&q=80",
    media_type: "image",
    created_at: hoursAgo(8),
    profiles: {
      username: "city_tips",
      avatar_url: null,
      is_private: false,
      is_demo: true,
    },
  },
  {
    id: "demo-post-0004",
    user_id: DEMO_PROFILE_IDS.travel_local,
    content: "Sunset viewpoint locals use: short hike, wide panorama, bring a jacket — wind picks up fast.",
    media_url: "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=900&q=80",
    media_type: "image",
    created_at: hoursAgo(12),
    profiles: {
      username: "travel_local",
      avatar_url: null,
      is_private: false,
      is_demo: true,
    },
  },
  {
    id: "demo-post-0005",
    user_id: DEMO_PROFILE_IDS.food_finder,
    content: "Street food lane opens at 6pm. Try the grilled skewers first, save room for the cinnamon dessert cart at the end.",
    created_at: hoursAgo(18),
    profiles: {
      username: "food_finder",
      avatar_url: null,
      is_private: false,
      is_demo: true,
    },
  },
  {
    id: "demo-post-0006",
    user_id: DEMO_PROFILE_IDS.city_tips,
    content: "Free museum hour on Thursdays — queue early, head straight to the rooftop terrace for city views.",
    created_at: hoursAgo(26),
    profiles: {
      username: "city_tips",
      avatar_url: null,
      is_private: false,
      is_demo: true,
    },
  },
];

export const FEED_POST_SELECT = `
  id,
  user_id,
  content,
  image_url,
  video_url,
  media_url,
  media_type,
  visibility,
  created_at,
  guide_places (
    title,
    location_name,
    canton,
    city,
    description,
    opening_hours,
    price_info,
    official_url,
    read_more_text,
    media_url,
    media_type,
    source_url
  ),
  profiles!posts_user_id_fkey!inner (
    username,
    avatar_url,
    is_private,
    is_demo
  )
`;

export const FEED_POST_SELECT_LEGACY = `
  id,
  user_id,
  content,
  image_url,
  video_url,
  media_url,
  media_type,
  visibility,
  created_at,
  profiles!posts_user_id_fkey!inner (
    username,
    avatar_url,
    is_private,
    is_demo
  )
`;
