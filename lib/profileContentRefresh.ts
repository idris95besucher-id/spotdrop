export const PROFILE_CONTENT_REFRESH_EVENT = "spotdrop:profile-content-refresh";

export function dispatchProfileContentRefresh() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(PROFILE_CONTENT_REFRESH_EVENT));
}
