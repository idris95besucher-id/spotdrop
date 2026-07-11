export const PROFILE_CONTENT_REFRESH_EVENT = "spotdrop:profile-content-refresh";
export const PROFILE_META_REFRESH_EVENT = "spotdrop:profile-meta-refresh";

export function dispatchProfileContentRefresh() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(PROFILE_CONTENT_REFRESH_EVENT));
}

export function dispatchProfileMetaRefresh() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(PROFILE_META_REFRESH_EVENT));
}
