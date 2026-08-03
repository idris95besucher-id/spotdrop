import { loadDistinctMessagePartnerIds } from "@/lib/directConversations";
import { loadFollowConnections } from "@/lib/follows";
import { filterRecipientsAllowedToMessage } from "@/lib/messagePrivacy";
import { excludeGuideProfiles, publicProfileUsername, sanitizePublicProfiles } from "@/lib/publicProfile";
import { supabase } from "@/lib/supabaseClient";

export type SendSpotRecipient = {
  id: string;
  username: string;
  avatar_url?: string | null;
  is_verified?: boolean | null;
};

const PROFILE_SELECT = "id, username, avatar_url, is_verified";

function mapProfiles(
  rows: { id: string; username: string; avatar_url?: string | null; is_verified?: boolean | null }[]
): SendSpotRecipient[] {
  return sanitizePublicProfiles(excludeGuideProfiles(rows)).map((profile) => ({
    id: profile.id,
    username: publicProfileUsername(profile.username),
    avatar_url: profile.avatar_url,
    is_verified: profile.is_verified,
  }));
}

function orderProfilesByIds(profiles: SendSpotRecipient[], orderedIds: string[]) {
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));

  return orderedIds.map((id) => byId.get(id)).filter((profile): profile is SendSpotRecipient => Boolean(profile));
}

export async function loadSendSpotFriends(userId: string) {
  const { data, error } = await loadFollowConnections(userId);

  if (error || !data) {
    return { recipients: [] as SendSpotRecipient[], error: error ?? "Unable to load friends." };
  }

  return {
    recipients: await filterRecipientsAllowedToMessage(
      userId,
      data.friends.map((friend) => ({
        id: friend.id,
        username: publicProfileUsername(friend.username),
        avatar_url: friend.avatar_url,
        is_verified: friend.is_verified,
      }))
    ),
    error: null as string | null,
  };
}

export async function loadSendSpotRecentChats(userId: string) {
  const partnerIds = await loadDistinctMessagePartnerIds(userId);

  if (partnerIds.length === 0) {
    return { recipients: [] as SendSpotRecipient[], error: null as string | null };
  }

  const { data, error } = await supabase.from("profiles").select(PROFILE_SELECT).in("id", partnerIds);

  if (error) {
    return { recipients: [] as SendSpotRecipient[], error: error.message };
  }

  return {
    recipients: await filterRecipientsAllowedToMessage(
      userId,
      orderProfilesByIds(mapProfiles(data ?? []), partnerIds)
    ),
    error: null as string | null,
  };
}

export async function searchSendSpotRecipients(query: string, userId: string) {
  const trimmed = query.trim();

  if (!trimmed) {
    return { recipients: [] as SendSpotRecipient[], error: null as string | null };
  }

  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT)
    .ilike("username", `%${trimmed}%`)
    .neq("id", userId)
    .order("username", { ascending: true })
    .limit(24);

  if (error) {
    return { recipients: [] as SendSpotRecipient[], error: error.message };
  }

  return {
    recipients: await filterRecipientsAllowedToMessage(userId, mapProfiles(data ?? [])),
    error: null as string | null,
  };
}
