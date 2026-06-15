import { normalizePostId } from "@/lib/postIds";
import { dispatchProfileContentRefresh } from "@/lib/profileContentRefresh";

export const SPOT_DELETED_EVENT = "spotdrop:spot-deleted";

export type SpotDeletedDetail = {
  postId: string;
};

export function dispatchSpotDeleted(postId: string) {
  const normalized = normalizePostId(postId);

  if (!normalized || typeof window === "undefined") {
    return;
  }

  dispatchProfileContentRefresh();

  window.dispatchEvent(
    new CustomEvent<SpotDeletedDetail>(SPOT_DELETED_EVENT, {
      detail: { postId: normalized },
    })
  );
}
