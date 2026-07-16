import { loadFollowRelationship } from "@/lib/follows";
import { isProfileGalleryAllowedViewer } from "@/lib/profileGalleryAllowedViewers";
import {
  describeSupabaseError,
  formatSupabaseErrorMessage,
  isMissingColumnError,
} from "@/lib/supabaseErrors";
import { supabase } from "@/lib/supabaseClient";

export type ProfileGalleryVisibility = "everyone" | "followers" | "friends" | "selected";

export type ProfileGalleryAccess = "allowed" | "private";

export const PROFILE_GALLERY_VISIBILITY_VALUES: ProfileGalleryVisibility[] = [
  "everyone",
  "followers",
  "friends",
  "selected",
];

const LEGACY_VISIBILITY_MAP: Record<string, ProfileGalleryVisibility> = {
  only_me: "selected",
};

export function isProfileGalleryVisibility(value: string): value is ProfileGalleryVisibility {
  return PROFILE_GALLERY_VISIBILITY_VALUES.includes(value as ProfileGalleryVisibility);
}

export function normalizeProfileGalleryVisibility(value: unknown): ProfileGalleryVisibility {
  const normalized = typeof value === "string" ? value : "";

  if (isProfileGalleryVisibility(normalized)) {
    return normalized;
  }

  return LEGACY_VISIBILITY_MAP[normalized] ?? "everyone";
}

export function evaluateProfileGalleryAccess(input: {
  viewerId: string | null;
  ownerId: string;
  visibility: ProfileGalleryVisibility;
  viewerFollowsOwner: boolean;
  areFriends: boolean;
  isSelectedViewer: boolean;
}): ProfileGalleryAccess {
  const { viewerId, ownerId, visibility, viewerFollowsOwner, areFriends, isSelectedViewer } = input;

  if (!ownerId) {
    return "private";
  }

  if (viewerId && viewerId === ownerId) {
    return "allowed";
  }

  if (visibility === "everyone") {
    return "allowed";
  }

  if (!viewerId) {
    return "private";
  }

  if (visibility === "followers") {
    return viewerFollowsOwner ? "allowed" : "private";
  }

  if (visibility === "friends") {
    return areFriends ? "allowed" : "private";
  }

  if (visibility === "selected") {
    return isSelectedViewer ? "allowed" : "private";
  }

  return "private";
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
  if (!userId) {
    return { error: "Missing profile id for gallery privacy save." };
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({ gallery_visibility: visibility })
    .eq("id", userId)
    .select("id, gallery_visibility")
    .maybeSingle();

  if (error) {
    const described = describeSupabaseError(error);
    console.error("[Gallery privacy] save visibility failed", described);

    if (isMissingColumnError(error)) {
      return {
        error:
          "gallery_visibility column is missing. Run database/update-profile-gallery-visibility.sql in Supabase.",
      };
    }

    if (error.code === "23514") {
      return {
        error: `Gallery visibility "${visibility}" is not allowed by the database check constraint. Run database/update-profile-gallery-visibility.sql in Supabase. | ${formatSupabaseErrorMessage(error)}`,
      };
    }

    return { error: formatSupabaseErrorMessage(error) };
  }

  if (!data) {
    console.error("[Gallery privacy] save visibility updated zero rows", { userId, visibility });
    return {
      error: `No profile row updated for user ${userId}. Check that auth.uid() matches the profile id and RLS allows self-update.`,
    };
  }

  return { error: null as string | null };
}

export async function resolveProfileGalleryAccess(
  viewerId: string | null,
  ownerId: string
): Promise<{ access: ProfileGalleryAccess; visibility: ProfileGalleryVisibility }> {
  const visibility = await loadProfileGalleryVisibility(ownerId);

  if (viewerId && viewerId === ownerId) {
    return { access: "allowed", visibility };
  }

  if (visibility === "everyone") {
    return { access: "allowed", visibility };
  }

  if (!viewerId) {
    return { access: "private", visibility };
  }

  const relationship = await loadFollowRelationship(viewerId, ownerId);
  const viewerFollowsOwner = relationship.data?.viewerFollowsTarget ?? false;
  const areFriends = relationship.data?.areFriends ?? false;
  const isSelectedViewer =
    visibility === "selected"
      ? await isProfileGalleryAllowedViewer(ownerId, viewerId)
      : false;

  return {
    access: evaluateProfileGalleryAccess({
      viewerId,
      ownerId,
      visibility,
      viewerFollowsOwner,
      areFriends,
      isSelectedViewer,
    }),
    visibility,
  };
}

export function profileGalleryHref(ownerUserId: string, viewerUserId: string | null) {
  if (viewerUserId && viewerUserId === ownerUserId) {
    return "/profile/gallery";
  }

  return `/user/gallery?id=${encodeURIComponent(ownerUserId)}`;
}
