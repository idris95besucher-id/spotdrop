export function isAuthRoute(pathname: string | null) {
  return pathname?.startsWith("/auth") ?? false;
}

/** Routes that stay reachable without forcing login when session checks fail transiently. */
export function isPublicBrowseRoute(pathname: string | null) {
  if (!pathname) {
    return false;
  }

  if (pathname === "/" || pathname === "/visit" || pathname.startsWith("/visit/")) {
    return true;
  }

  if (pathname === "/rooms" || pathname.startsWith("/rooms/")) {
    return true;
  }

  if (pathname === "/search" || pathname.startsWith("/search/")) {
    return true;
  }

  return false;
}

export function shouldRedirectExpiredSession(pathname: string | null) {
  if (isAuthRoute(pathname) || isPublicBrowseRoute(pathname)) {
    return false;
  }

  return true;
}
