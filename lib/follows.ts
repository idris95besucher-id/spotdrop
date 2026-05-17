import { sanitizePublicProfiles } from "@/lib/publicProfile";
import { supabase } from "@/lib/supabaseClient";

export type FollowProfile = {
  id: string;
  username: string;
  avatar_url?: string | null;
};

export type FollowConnections = {
  followers: FollowProfile[];
  friends: FollowProfile[];
  followersCount: number;
  friendsCount: number;
};

export type FollowRelationship = {
  viewerFollowsTarget: boolean;
  targetFollowsViewer: boolean;
  areFriends: boolean;
};

function getUniqueIds(ids: string[]) {
  return Array.from(new Set(ids.filter(Boolean)));
}

async function loadProfilesByIds(ids: string[]) {
  const uniqueIds = getUniqueIds(ids);

  if (uniqueIds.length === 0) {
    return {
      data: [] as FollowProfile[],
      error: null as string | null,
    };
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, avatar_url")
    .in("id", uniqueIds)
    .order("username", { ascending: true });

  if (error) {
    console.error("Failed to load follow profiles:", error);
    return {
      data: [] as FollowProfile[],
      error: error.message || "Unable to load users.",
    };
  }

  return {
    data: sanitizePublicProfiles((data ?? []) as FollowProfile[]),
    error: null as string | null,
  };
}

export async function loadFollowConnections(userId: string) {
  const [{ data: followerRows, error: followersError }, { data: followingRows, error: followingError }] = await Promise.all([
    supabase.from("follows").select("follower_id").eq("following_id", userId),
    supabase.from("follows").select("following_id").eq("follower_id", userId),
  ]);

  if (followersError) {
    console.error("Failed to load followers:", followersError);
    return {
      data: null as FollowConnections | null,
      error: followersError.message || "Unable to load followers.",
    };
  }

  if (followingError) {
    console.error("Failed to load following relationships:", followingError);
    return {
      data: null as FollowConnections | null,
      error: followingError.message || "Unable to load friends.",
    };
  }

  const followerIds = getUniqueIds((followerRows ?? []).map((row) => row.follower_id as string));
  const followingIds = getUniqueIds((followingRows ?? []).map((row) => row.following_id as string));
  const followingSet = new Set(followingIds);
  const friendIds = followerIds.filter((id) => followingSet.has(id));

  const [{ data: followers, error: followerProfilesError }, { data: friends, error: friendProfilesError }] = await Promise.all([
    loadProfilesByIds(followerIds),
    loadProfilesByIds(friendIds),
  ]);

  if (followerProfilesError) {
    return {
      data: null as FollowConnections | null,
      error: followerProfilesError,
    };
  }

  if (friendProfilesError) {
    return {
      data: null as FollowConnections | null,
      error: friendProfilesError,
    };
  }

  return {
    data: {
      followers,
      friends,
      followersCount: followerIds.length,
      friendsCount: friendIds.length,
    },
    error: null as string | null,
  };
}

export async function loadFollowRelationship(viewerId: string, targetUserId: string) {
  if (!viewerId || !targetUserId || viewerId === targetUserId) {
    return {
      data: {
        viewerFollowsTarget: false,
        targetFollowsViewer: false,
        areFriends: false,
      } satisfies FollowRelationship,
      error: null as string | null,
    };
  }

  const [{ data: viewerFollow, error: viewerFollowError }, { data: targetFollow, error: targetFollowError }] = await Promise.all([
    supabase
      .from("follows")
      .select("id")
      .eq("follower_id", viewerId)
      .eq("following_id", targetUserId)
      .maybeSingle(),
    supabase
      .from("follows")
      .select("id")
      .eq("follower_id", targetUserId)
      .eq("following_id", viewerId)
      .maybeSingle(),
  ]);

  if (viewerFollowError) {
    console.error("Failed to load viewer follow relationship:", viewerFollowError);
    return {
      data: null as FollowRelationship | null,
      error: viewerFollowError.message || "Unable to load follow status.",
    };
  }

  if (targetFollowError) {
    console.error("Failed to load target follow relationship:", targetFollowError);
    return {
      data: null as FollowRelationship | null,
      error: targetFollowError.message || "Unable to load follow status.",
    };
  }

  const viewerFollowsTarget = Boolean(viewerFollow);
  const targetFollowsViewer = Boolean(targetFollow);

  return {
    data: {
      viewerFollowsTarget,
      targetFollowsViewer,
      areFriends: viewerFollowsTarget && targetFollowsViewer,
    } satisfies FollowRelationship,
    error: null as string | null,
  };
}

export async function followUser(followerId: string, followingId: string) {
  if (!followerId || !followingId) {
    return "Unable to follow this user.";
  }

  if (followerId === followingId) {
    return "You cannot follow yourself.";
  }

  const { error } = await supabase
    .from("follows")
    .upsert(
      {
        follower_id: followerId,
        following_id: followingId,
      },
      {
        onConflict: "follower_id,following_id",
        ignoreDuplicates: true,
      }
    );

  if (error) {
    console.error("Failed to follow user:", error);
    return error.message || "Unable to follow this user.";
  }

  return null;
}

export async function unfollowUser(followerId: string, followingId: string) {
  if (!followerId || !followingId) {
    return "Unable to update follow status.";
  }

  const { error } = await supabase
    .from("follows")
    .delete()
    .eq("follower_id", followerId)
    .eq("following_id", followingId);

  if (error) {
    console.error("Failed to unfollow user:", error);
    return error.message || "Unable to unfollow this user.";
  }

  return null;
}
