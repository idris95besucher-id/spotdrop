import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { dispatchProfileContentRefresh } from "@/lib/profileContentRefresh";

export const PROFILE_TAB_STORAGE_KEY = "spotdrop:profile-tab";
export const PROFILE_REFRESH_AFTER_PUBLISH_KEY = "spotdrop:profile-refresh-after-publish";

/**
 * After a successful Spot publish: land on My profile → Posts/Spots (or My Spots, if that
 * was the publish destination), refresh the grid, and replace the current history entry so
 * Back never reopens camera / share / post-viewer overlays.
 */
export function finishSpotPublishToProfile(
  router: AppRouterInstance,
  destinationTab: "spots" | "my-spots" = "spots"
) {
  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(PROFILE_TAB_STORAGE_KEY, destinationTab);
    window.sessionStorage.setItem(PROFILE_REFRESH_AFTER_PUBLISH_KEY, "1");
  }

  dispatchProfileContentRefresh({ tab: destinationTab });
  router.replace("/profile");
}
