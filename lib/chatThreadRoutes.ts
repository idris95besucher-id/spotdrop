const DM_ROUTE_PLACEHOLDER = "_";

/** Partner id from DM route — query param, path segment, or static-export placeholder fallback. */
export function resolveDmRoutePartnerId(options: {
  partnerIdOverride?: string;
  paramsUserId?: string;
}) {
  const fromOverride = options.partnerIdOverride?.trim() ?? "";

  if (fromOverride && fromOverride !== DM_ROUTE_PLACEHOLDER) {
    return fromOverride;
  }

  const fromParams = options.paramsUserId?.trim() ?? "";

  if (fromParams && fromParams !== DM_ROUTE_PLACEHOLDER) {
    return fromParams;
  }

  if (typeof window === "undefined") {
    return fromOverride || fromParams;
  }

  const searchId = new URLSearchParams(window.location.search).get("id")?.trim() ?? "";

  if (searchId && searchId !== DM_ROUTE_PLACEHOLDER) {
    return searchId;
  }

  const segments = window.location.pathname.split("/").filter(Boolean);
  const pathId = segments[0] === "dm" ? (segments[1] ?? "").trim() : "";

  if (pathId && pathId !== DM_ROUTE_PLACEHOLDER) {
    return pathId;
  }

  return fromOverride || fromParams;
}

export function dmThreadHref(partnerId: string) {
  return `/dm?id=${encodeURIComponent(partnerId)}`;
}

export function isDirectMessageThread(pathname: string | null) {
  if (!pathname) return false;
  // Matches both /dm?id=… (new query-param style) and /dm/<userId> (old path style)
  return pathname === "/dm" || pathname === "/dm/" || pathname.startsWith("/dm/");
}

/** Private DMs, CheckSpot threads, and other 1:1 message threads. */
export function isPrivateChatThreadRoute(pathname: string | null) {
  return isDirectMessageThread(pathname);
}

export function isCityRoomChatThread(pathname: string | null) {
  if (!pathname) {
    return false;
  }

  const segments = pathname.split("/").filter(Boolean);

  return segments[0] === "rooms" && segments.length === 3;
}

export function isCityChannelChatThread(pathname: string | null) {
  if (!pathname) {
    return false;
  }

  const segments = pathname.split("/").filter(Boolean);

  return segments[0] === "rooms" && segments.length === 5 && segments[3] === "channels";
}

export function isChatThreadRoute(pathname: string | null) {
  return (
    isPrivateChatThreadRoute(pathname) ||
    isCityRoomChatThread(pathname) ||
    isCityChannelChatThread(pathname)
  );
}

export function isViewingDirectMessageThread(pathname: string | null, partnerId: string) {
  if (!pathname || !partnerId) {
    return false;
  }

  if (pathname === "/dm" || pathname === "/dm/") {
    if (typeof window === "undefined") {
      return false;
    }

    return new URLSearchParams(window.location.search).get("id") === partnerId;
  }

  if (pathname.startsWith("/dm/")) {
    const segment = pathname.split("/").filter(Boolean)[1];
    return segment === partnerId;
  }

  return false;
}

export function isViewingCityRoomThread(pathname: string | null, roomPath: string) {
  if (!pathname || !roomPath) {
    return false;
  }

  return pathname === roomPath || pathname.startsWith(`${roomPath}/`);
}
