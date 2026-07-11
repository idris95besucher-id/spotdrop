import { isChatThreadRoute } from "@/lib/chatThreadRoutes";
import { isAuthRoute as isAuthRoutePath } from "@/lib/authRoutes";
import { MOBILE_BOTTOM_NAV_PADDING, MOBILE_SAFE_AREA_TOP } from "@/lib/mobileLayout";
import { parseVisitTab } from "@/lib/visitTabs";

import type { TranslationKey } from "@/lib/i18n/messages";

export type MainNavItem = {
  href: string;
  labelKey: TranslationKey;
  shortLabelKey?: TranslationKey;
};

/** Left side: Search | Following | Visit */
export const MAIN_NAV_LEFT: MainNavItem[] = [
  { href: "/search", labelKey: "nav.search" },
  { href: "/friends", labelKey: "nav.friends" },
  { href: "/visit", labelKey: "nav.visit" },
];

/** Right side: Messages | Map | Profile */
export const MAIN_NAV_RIGHT: MainNavItem[] = [
  { href: "/chats", labelKey: "nav.myChats", shortLabelKey: "nav.messages" },
  { href: "/visit?tab=map", labelKey: "nav.map" },
  { href: "/profile", labelKey: "nav.myProfile", shortLabelKey: "nav.myProfile" },
];

export const MAIN_NAV_ITEMS: MainNavItem[] = [...MAIN_NAV_LEFT, ...MAIN_NAV_RIGHT];

function normalizeNavPathname(pathname: string) {
  return pathname.replace(/\/+$/, "") || "/";
}

function visitTabFromSearchParams(searchParams?: URLSearchParams | null) {
  return parseVisitTab(searchParams?.get("tab") ?? null);
}

/** Visit hub — explore, nearby, and room routes (not the map tab). */
export function isVisitNavRoute(pathname: string | null, searchParams?: URLSearchParams | null) {
  if (!pathname) {
    return false;
  }

  const normalized = normalizeNavPathname(pathname);

  if (normalized === "/rooms" || normalized.startsWith("/rooms/")) {
    return true;
  }

  if (normalized === "/map" || normalized === "/bern") {
    return false;
  }

  if (normalized !== "/visit" && !normalized.startsWith("/visit/")) {
    return false;
  }

  return visitTabFromSearchParams(searchParams) !== "map";
}

/** Live map tab within Visit. */
export function isMapNavRoute(pathname: string | null, searchParams?: URLSearchParams | null) {
  if (!pathname) {
    return false;
  }

  const normalized = normalizeNavPathname(pathname);

  if (normalized === "/map" || normalized === "/bern") {
    return true;
  }

  if (normalized !== "/visit" && !normalized.startsWith("/visit/")) {
    return false;
  }

  return visitTabFromSearchParams(searchParams) === "map";
}

/** Inbox + DM thread routes that should highlight the Messages tab. */
export function isMessagesNavRoute(pathname: string | null) {
  if (!pathname) {
    return false;
  }

  const normalized = normalizeNavPathname(pathname);

  return (
    normalized === "/chats" ||
    normalized.startsWith("/chats/") ||
    normalized === "/chat" ||
    normalized.startsWith("/chat/") ||
    normalized === "/dm" ||
    normalized.startsWith("/dm/") ||
    normalized === "/messages" ||
    normalized.startsWith("/messages/")
  );
}

export function isMainNavActive(
  pathname: string | null,
  href: string,
  searchParams?: URLSearchParams | null
) {
  if (!pathname) {
    return false;
  }

  if (href === "/chats") {
    return isMessagesNavRoute(pathname);
  }

  if (href === "/visit") {
    return isVisitNavRoute(pathname, searchParams);
  }

  if (href === "/visit?tab=map") {
    return isMapNavRoute(pathname, searchParams);
  }

  if (href === "/profile") {
    return pathname === "/profile" || pathname.startsWith("/profile/");
  }

  if (href === "/settings") {
    return pathname === "/settings" || pathname.startsWith("/settings/");
  }

  if (href === "/search") {
    return pathname === "/search" || pathname.startsWith("/search/");
  }

  if (href === "/friends") {
    return pathname === "/friends" || pathname.startsWith("/friends/");
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Room hub and city/group/channel chat routes — hide global create button. */
export function isRoomsNavRoute(pathname: string | null) {
  if (!pathname) {
    return false;
  }

  const normalized = normalizeNavPathname(pathname);

  return normalized === "/rooms" || normalized.startsWith("/rooms/");
}

export function shouldShowMobileCreateButton(pathname: string | null) {
  return !isRoomsNavRoute(pathname);
}

/** Spot/post detail and reel viewer — fullscreen, no bottom tab bar. */
export function isPostReelRoute(pathname: string | null) {
  if (!pathname) {
    return false;
  }

  const normalized = pathname.replace(/\/+$/, "") || "/";

  return normalized === "/posts" || normalized.startsWith("/posts/");
}

/** Fixed mobile bottom nav — visible on all main pages except welcome, auth, chat threads, and post reels. */
export function shouldShowMobileBottomNav(pathname: string | null) {
  if (!pathname || isAuthRoute(pathname)) {
    return false;
  }

  if (pathname === "/" || pathname === "") {
    return false;
  }

  if (isChatThreadRoute(pathname)) {
    return false;
  }

  if (isPostReelRoute(pathname)) {
    return false;
  }

  return true;
}

/** @deprecated Use shouldShowMobileBottomNav — kept for call sites that invert the check. */
export function shouldHideMobileBottomNav(pathname: string | null) {
  return !shouldShowMobileBottomNav(pathname);
}

export function isAuthRoute(pathname: string | null) {
  return isAuthRoutePath(pathname);
}

export function isProfileRoute(pathname: string | null) {
  if (!pathname) {
    return false;
  }

  return pathname === "/profile" || pathname.startsWith("/profile/") || pathname.startsWith("/user/");
}

/** Top inset for mobile headers under iPhone notch / Dynamic Island. */
export const PROFILE_SAFE_AREA_TOP = MOBILE_SAFE_AREA_TOP;

export { MOBILE_BOTTOM_NAV_PADDING, MOBILE_SAFE_AREA_TOP };

/** Visit hub — explore, nearby users, live map */
export const EXPLORE_NEARBY_HREF = "/visit";
