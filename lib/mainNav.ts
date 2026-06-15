import { isChatThreadRoute } from "@/lib/chatThreadRoutes";

import type { TranslationKey } from "@/lib/i18n/messages";

export type MainNavItem = {
  href: string;
  labelKey: TranslationKey;
  shortLabelKey?: TranslationKey;
};

/** Left side of bottom nav: Visit | Search | [+] | Messages | Profile */
export const MAIN_NAV_LEFT: MainNavItem[] = [
  { href: "/visit", labelKey: "nav.visit" },
  { href: "/search", labelKey: "nav.search" },
];

export const MAIN_NAV_RIGHT: MainNavItem[] = [
  { href: "/chats", labelKey: "nav.myChats", shortLabelKey: "nav.messages" },
  { href: "/profile", labelKey: "nav.myProfile", shortLabelKey: "nav.myProfile" },
];

export const MAIN_NAV_ITEMS: MainNavItem[] = [...MAIN_NAV_LEFT, ...MAIN_NAV_RIGHT];

export function isMainNavActive(pathname: string | null, href: string) {
  if (!pathname) {
    return false;
  }

  if (href === "/chats") {
    return pathname === "/chats";
  }

  if (href === "/profile") {
    return pathname === "/profile" || pathname.startsWith("/profile/");
  }

  if (href === "/visit") {
    return (
      pathname === "/visit" ||
      pathname.startsWith("/visit/") ||
      pathname === "/rooms" ||
      pathname.startsWith("/rooms/")
    );
  }

  if (href === "/search") {
    return pathname === "/search" || pathname.startsWith("/search/");
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Routes that always hide the fixed mobile bottom nav. */
export function shouldHideMobileBottomNav(pathname: string | null) {
  if (!pathname) {
    return false;
  }

  if (pathname.startsWith("/posts/")) {
    return true;
  }

  return isChatThreadRoute(pathname);
}

/** Fixed mobile bottom nav — primary tabs + room pickers (Create is the center nav action). */
export function shouldShowMobileBottomNav(pathname: string | null) {
  if (!pathname || isAuthRoute(pathname)) {
    return false;
  }

  if (shouldHideMobileBottomNav(pathname)) {
    return false;
  }

  if (
    pathname === "/visit" ||
    pathname === "/search" ||
    pathname.startsWith("/search/") ||
    pathname === "/profile" ||
    pathname.startsWith("/profile/") ||
    pathname === "/chats" ||
    pathname === "/notifications"
  ) {
    return true;
  }

  // Public profile pages (/user/:id or /user/:username)
  if (pathname.startsWith("/user/")) {
    return true;
  }

  const segments = pathname.split("/").filter(Boolean);

  // Country picker (/rooms) and city picker (/rooms/[country])
  if (segments[0] === "rooms" && (segments.length === 1 || segments.length === 2)) {
    return true;
  }

  return false;
}

export function isAuthRoute(pathname: string | null) {
  return pathname?.startsWith("/auth") ?? false;
}

/** Space reserved for fixed mobile bottom nav + iPhone safe area */
export const MOBILE_BOTTOM_NAV_PADDING =
  "pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] md:pb-0";

/** Visit hub — explore, nearby users, live map */
export const EXPLORE_NEARBY_HREF = "/visit";
