import { isChatThreadRoute } from "@/lib/chatThreadRoutes";
import { isAuthRoute as isAuthRoutePath } from "@/lib/authRoutes";
import { MOBILE_BOTTOM_NAV_PADDING, MOBILE_SAFE_AREA_TOP } from "@/lib/mobileLayout";

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

  if (href === "/settings") {
    return pathname === "/settings" || pathname.startsWith("/settings/");
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

/** Fixed mobile bottom nav — visible on all main pages except welcome, auth, and chat threads. */
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
