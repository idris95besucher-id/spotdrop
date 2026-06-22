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
