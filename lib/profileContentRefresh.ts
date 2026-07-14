export const PROFILE_CONTENT_REFRESH_EVENT = "spotdrop:profile-content-refresh";
export const PROFILE_META_REFRESH_EVENT = "spotdrop:profile-meta-refresh";

export type ProfileContentRefreshDetail = {
  /** When set, profile should switch to this content tab. */
  tab?: "spots" | "saved";
};

export function dispatchProfileContentRefresh(detail?: ProfileContentRefreshDetail) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(PROFILE_CONTENT_REFRESH_EVENT, {
      detail: detail ?? {},
    })
  );
}

export function dispatchProfileMetaRefresh() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(PROFILE_META_REFRESH_EVENT));
}
