import { loadFollowRelationship } from "@/lib/follows";
import { supabase } from "@/lib/supabaseClient";

export type ProfileGalleryVisibility = "everyone" | "friends" | "only_me";

export type ProfileGalleryAccess = "allowed" | "friends_only" | "private";

export const PROFILE_GALLERY_VISIBILITY_VALUES: ProfileGalleryVisibility[] = [
  "everyone",
  "friends",
  "only_me",
];

export function isProfileGalleryVisibility(value: string): value is ProfileGalleryVisibility {
  return PROFILE_GALLERY_VISIBILITY_VALUES.includes(value as ProfileGalleryVisibility);
}

export function normalizeProfileGalleryVisibility(value: unknown): ProfileGalleryVisibility {
  const normalized = typeof value === "string" ? value : "";

  return isProfileGalleryVisibility(normalized) ? normalized : "everyone";
}

export function evaluateProfileGalleryAccess(
  viewerId: string | null,
  ownerId: string,
  visibility: ProfileGalleryVisibility,
  areFriends: boolean
): ProfileGalleryAccess {
  if (!ownerId) {
    return "private";
  }

  if (viewerId && viewerId === ownerId) {
    return "allowed";
  }

  if (visibility === "everyone") {
    return "allowed";
  }

  if (visibility === "only_me") {
    return "private";
  }

  if (areFriends) {
    return "allowed";
  }

  return "friends_only";
}

export async function loadProfileGalleryVisibility(userId: string): Promise<ProfileGalleryVisibility> {
  const { data, error } = await supabase
    .from("profiles")
    .select("gallery_visibility")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    if (error.code === "42703" || error.code === "PGRST204") {
      return "everyone";
    }

    console.error("Failed to load profile gallery visibility:", error);
    return "everyone";
  }

  return normalizeProfileGalleryVisibility(data?.gallery_visibility);
}

export async function saveProfileGalleryVisibility(userId: string, visibility: ProfileGalleryVisibility) {
  const { error } = await supabase
    .from("profiles")
    .update({ gallery_visibility: visibility })
    .eq("id", userId);

  if (error) {
    if (error.code === "42703" || error.code === "PGRST204") {
      return { error: null as string | null };
    }

    return { error: error.message || "Unable to update gallery visibility." };
  }

  return { error: null as string | null };
}

export async function resolveProfileGalleryAccess(
  viewerId: string | null,
  ownerId: string
): Promise<{ access: ProfileGalleryAccess; visibility: ProfileGalleryVisibility }> {
  const visibility = await loadProfileGalleryVisibility(ownerId);

  if (!viewerId || viewerId === ownerId) {
    return {
      access: viewerId === ownerId ? "allowed" : evaluateProfileGalleryAccess(viewerId, ownerId, visibility, false),
      visibility,
    };
  }

  const relationship = await loadFollowRelationship(viewerId, ownerId);

  return {
    access: evaluateProfileGalleryAccess(
      viewerId,
      ownerId,
      visibility,
      relationship.data?.areFriends ?? false
    ),
    visibility,
  };
}

export function profileGalleryHref(ownerUserId: string, viewerUserId: string | null) {
  if (viewerUserId && viewerUserId === ownerUserId) {
    return "/profile/gallery";
  }

  return `/user/gallery?id=${encodeURIComponent(ownerUserId)}`;
}
