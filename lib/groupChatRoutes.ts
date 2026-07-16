/** Query-param routes for group chats — no dynamic static params needed (static export). */

export function groupThreadHref(groupId: string) {
  return `/group?id=${encodeURIComponent(groupId)}`;
}

export function groupInfoHref(groupId: string) {
  return `/group/info?id=${encodeURIComponent(groupId)}`;
}

function normalizeGroupPathname(pathname: string) {
  return pathname.replace(/\/+$/, "") || "/";
}

/** The fullscreen group conversation screen — same treatment as a DM thread. */
export function isGroupChatThreadRoute(pathname: string | null) {
  if (!pathname) {
    return false;
  }

  return normalizeGroupPathname(pathname) === "/group";
}

/** Group info/manage-members screen — normal scrollable page, not a fullscreen thread. */
export function isGroupInfoRoute(pathname: string | null) {
  if (!pathname) {
    return false;
  }

  return normalizeGroupPathname(pathname) === "/group/info";
}

export function isGroupChatRoute(pathname: string | null) {
  return isGroupChatThreadRoute(pathname) || isGroupInfoRoute(pathname);
}

/** True when the user is currently looking at this exact group's thread (query-param route). */
export function isViewingGroupThread(pathname: string | null, groupId: string) {
  if (!isGroupChatThreadRoute(pathname) || !groupId || typeof window === "undefined") {
    return false;
  }

  return new URLSearchParams(window.location.search).get("id") === groupId;
}

