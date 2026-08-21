import { normalizePostId, postIdForQuery } from "@/lib/postIds";
import { getSpotCaption, normalizeSpotCaption, SPOT_CAPTION_MAX_LENGTH } from "@/lib/spotCaption";
import { isSpotLocationCardPost } from "@/lib/spotLocationCard";
import { toUserFacingError } from "@/lib/userFacingError";
import { supabase } from "@/lib/supabaseClient";

export { SPOT_CAPTION_MAX_LENGTH };

export type EditablePublicationFields = {
  caption: string;
};

export function getEditablePublicationCaption(post: {
  content?: string | null;
  spot_name?: string | null;
  content_kind?: string | null;
  media_type?: string | null;
  media_url?: string | null;
  image_url?: string | null;
  video_url?: string | null;
}): string {
  if (isSpotLocationCardPost(post)) {
    return post.spot_name?.trim() ?? "";
  }

  return getSpotCaption(post.content) ?? "";
}

/** Update caption/text for the authenticated owner's publication. Media is never replaced. */
export async function updateOwnedPublication(
  userId: string,
  postId: string,
  input: EditablePublicationFields
) {
  const id = normalizePostId(postId);

  if (!userId || !id) {
    return { ok: false as const, error: "Unable to update this publication.", post: null };
  }

  const { data: authData, error: authError } = await supabase.auth.getSession();

  if (authError || !authData.session?.user?.id) {
    return { ok: false as const, error: "Sign in required.", post: null };
  }

  if (authData.session.user.id !== userId) {
    return { ok: false as const, error: "You can only edit your own publications.", post: null };
  }

  const queryId = postIdForQuery(id);

  const { data: existing, error: loadError } = await supabase
    .from("posts")
    .select(
      "id, user_id, content, content_kind, spot_name, media_type, media_url, image_url, video_url"
    )
    .eq("id", queryId)
    .eq("user_id", userId)
    .maybeSingle();

  if (loadError) {
    return {
      ok: false as const,
      error: toUserFacingError(loadError, "Unable to load this publication."),
      post: null,
    };
  }

  if (!existing) {
    return { ok: false as const, error: "Publication not found.", post: null };
  }

  const nextCaption = normalizeSpotCaption(input.caption.trim());
  const isLocationCard = isSpotLocationCardPost(existing);

  const updatePayload = isLocationCard
    ? {
        spot_name: nextCaption || null,
        updated_at: new Date().toISOString(),
      }
    : {
        content: nextCaption,
        // Always mark manual on a saved edit — the source of truth an AI
        // caption job (database/add-ai-post-captions.sql) checks against
        // before ever writing content, so a late AI result can never
        // clobber this edit, no matter when it lands.
        caption_source: "manual",
        updated_at: new Date().toISOString(),
      };

  const { data: updated, error: updateError } = await supabase
    .from("posts")
    .update(updatePayload)
    .eq("id", queryId)
    .eq("user_id", userId)
    .select(
      "id, user_id, content, content_kind, spot_name, media_type, media_url, image_url, video_url, updated_at"
    )
    .maybeSingle();

  if (updateError) {
    return {
      ok: false as const,
      error: toUserFacingError(updateError, "Unable to save changes."),
      post: null,
    };
  }

  if (!updated) {
    return { ok: false as const, error: "Unable to save changes.", post: null };
  }

  return { ok: true as const, error: null as string | null, post: updated };
}
