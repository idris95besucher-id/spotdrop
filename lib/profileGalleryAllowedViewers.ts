import { sanitizePublicProfiles, isGuideAccountProfile } from "@/lib/publicProfile";
import {
  describeSupabaseError,
  formatSupabaseErrorMessage,
  isMissingSchemaError,
} from "@/lib/supabaseErrors";
import { supabase } from "@/lib/supabaseClient";

export type GalleryAllowedViewer = {
  id: string;
  username: string;
  avatar_url: string | null;
  is_verified: boolean | null;
};

function isBenignAllowlistSchemaError(error: { code?: string; message?: string } | null) {
  return isMissingSchemaError(error);
}

export async function loadProfileGalleryAllowedViewers(ownerId: string): Promise<{
  viewers: GalleryAllowedViewer[];
  error: string | null;
}> {
  const { data: rows, error } = await supabase
    .from("profile_gallery_allowed_viewers")
    .select("viewer_id")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: true });

  if (error) {
    if (isBenignAllowlistSchemaError(error)) {
      return { viewers: [], error: null };
    }

    console.error("Failed to load gallery allowed viewers:", describeSupabaseError(error));
    return { viewers: [], error: formatSupabaseErrorMessage(error) };
  }

  const viewerIds = (rows ?? []).map((row) => String(row.viewer_id)).filter(Boolean);

  if (viewerIds.length === 0) {
    return { viewers: [], error: null };
  }

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, username, avatar_url, is_verified")
    .in("id", viewerIds);

  if (profilesError) {
    console.error("Failed to load gallery allowed viewer profiles:", profilesError);
    return { viewers: [], error: profilesError.message || "Unable to load selected people." };
  }

  const profileById = new Map(
    (profiles ?? [])
      .filter((profile) => !isGuideAccountProfile(profile))
      .map((profile) => [String(profile.id), profile])
  );

  const viewers = viewerIds
    .map((viewerId) => profileById.get(viewerId))
    .filter((profile): profile is NonNullable<typeof profile> => Boolean(profile))
    .map((profile) => ({
      id: String(profile.id),
      username: String(profile.username ?? ""),
      avatar_url: (profile.avatar_url as string | null) ?? null,
      is_verified: (profile.is_verified as boolean | null) ?? null,
    }));

  return {
    viewers: sanitizePublicProfiles(viewers),
    error: null,
  };
}

export async function isProfileGalleryAllowedViewer(ownerId: string, viewerId: string) {
  if (!ownerId || !viewerId || ownerId === viewerId) {
    return false;
  }

  const { data, error } = await supabase
    .from("profile_gallery_allowed_viewers")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("viewer_id", viewerId)
    .maybeSingle();

  if (error) {
    if (isBenignAllowlistSchemaError(error)) {
      return false;
    }

    console.error("Failed to check gallery allowed viewer:", describeSupabaseError(error));
    return false;
  }

  return Boolean(data);
}

export async function saveProfileGalleryAllowedViewers(ownerId: string, viewerIds: string[]) {
  const uniqueViewerIds = Array.from(
    new Set(viewerIds.filter((viewerId) => viewerId && viewerId !== ownerId))
  );

  const { error: deleteError } = await supabase
    .from("profile_gallery_allowed_viewers")
    .delete()
    .eq("owner_id", ownerId);

  if (deleteError) {
    if (isBenignAllowlistSchemaError(deleteError)) {
      return { error: null as string | null };
    }

    console.error(
      "[Gallery privacy] clear allowlist failed",
      describeSupabaseError(deleteError)
    );
    return { error: formatSupabaseErrorMessage(deleteError) };
  }

  if (uniqueViewerIds.length === 0) {
    return { error: null as string | null };
  }

  const { error: insertError } = await supabase.from("profile_gallery_allowed_viewers").insert(
    uniqueViewerIds.map((viewerId) => ({
      owner_id: ownerId,
      viewer_id: viewerId,
    }))
  );

  if (insertError) {
    if (isBenignAllowlistSchemaError(insertError)) {
      return {
        error:
          "profile_gallery_allowed_viewers table is missing. Run database/update-profile-gallery-visibility.sql in Supabase.",
      };
    }

    console.error("[Gallery privacy] save allowlist failed", describeSupabaseError(insertError));
    return { error: formatSupabaseErrorMessage(insertError) };
  }

  return { error: null as string | null };
}
