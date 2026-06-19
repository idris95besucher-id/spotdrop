/** Instagram-style iOS mobile layout — single source of truth. */

export const MOBILE_BOTTOM_NAV_HEIGHT_PX = 54;

/**
 * Safe-area inset + 12 px breathing room — tab bars and secondary nav headers.
 *
 * Uses --sd-safe-top (a CSS variable defined in globals.css) so that:
 *   • Safari / PWA: --sd-safe-top = env(safe-area-inset-top) — component handles its own inset.
 *   • Capacitor iOS: --sd-safe-top = 0px — the .sd-app-root root wrapper handles the inset.
 */
export const MOBILE_SAFE_AREA_INSET_TOP = "pt-[calc(var(--sd-safe-top,0px)+12px)]";

/**
 * Safe-area inset + 8 px breathing room — main app header (logo, bell, menu).
 * Same CSS-variable approach as MOBILE_SAFE_AREA_INSET_TOP.
 */
export const MOBILE_SAFE_AREA_TOP = "pt-[calc(var(--sd-safe-top,0px)+8px)]";

/**
 * Reserve space so scroll content clears the fixed bottom nav + home indicator.
 * Uses --sd-safe-bottom for the same Capacitor/Safari split as above.
 */
export const MOBILE_BOTTOM_NAV_PADDING =
  "pb-[calc(54px+var(--sd-safe-bottom,0px))]";

/** Single app viewport — one h-dvh column; pages fill with flex-1. */
export const MOBILE_APP_ROOT_CLASS =
  "sd-app-root flex h-[100dvh] min-h-0 w-full max-w-full flex-col overflow-hidden overscroll-none";

/** Page shell — fills app root, does NOT re-declare h-[100dvh]. */
export const MOBILE_FRAME_CLASS =
  "relative flex min-h-0 flex-1 w-full max-w-full flex-col overflow-hidden bg-[#050816] text-white md:min-h-screen";

/** Inner column between optional top chrome and scroll main. */
export const MOBILE_FRAME_BODY_CLASS =
  "mx-auto flex min-h-0 flex-1 w-full max-w-full flex-col overflow-hidden";

/** Fixed top chrome slot in Shell — never scrolls with page content. */
export const MOBILE_FIXED_TOP_CHROME_CLASS =
  "relative z-20 shrink-0 w-full min-w-0 max-w-full overflow-x-hidden bg-[#050816]/95 backdrop-blur-md";

export const MOBILE_TAB_TOP_BAR_CLASS =
  `shrink-0 w-full min-w-0 max-w-full overflow-x-hidden border-b border-white/[0.08] bg-[#050816]/95 backdrop-blur-md ${MOBILE_SAFE_AREA_INSET_TOP} px-4 pb-3`;

/** Only vertical scroll region inside the shell (middle content). */
export const MOBILE_MAIN_SCROLL_CLASS =
  "min-h-0 flex-1 w-full min-w-0 max-w-full overflow-x-hidden overflow-y-auto overscroll-x-none overscroll-y-auto touch-pan-y [-webkit-overflow-scrolling:touch]";

/** Inner panel scroll (Visit tabs, map panels) with bottom-nav clearance. */
export const MOBILE_PANEL_SCROLL_CLASS =
  `h-full min-h-0 w-full min-w-0 max-w-full overflow-x-hidden overflow-y-auto overscroll-none touch-pan-y ${MOBILE_BOTTOM_NAV_PADDING}`;

export const MOBILE_MAIN_SCROLL_SELECTOR = "[data-mobile-main-scroll]";

export const MOBILE_PAGE_INNER_CLASS =
  "mx-auto w-full min-w-0 max-w-full px-4 sm:max-w-xl md:max-w-lg";

export const MOBILE_WIDTH_SAFE_CLASS =
  "w-full min-w-0 max-w-full overflow-x-hidden";

/**
 * Fixed bottom nav — uses env() directly (NOT the CSS variable) because this element
 * is position:fixed at the viewport bottom, outside the .sd-app-root padding box.
 * It must always handle its own home-indicator clearance regardless of platform.
 */
export const MOBILE_FIXED_BOTTOM_NAV_CLASS =
  "fixed bottom-0 left-0 right-0 z-[100] box-border w-full max-w-full min-w-0 overflow-x-hidden border-t border-primary/15 bg-[#0B1026]/95 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur-xl md:hidden";

/** @deprecated Use MOBILE_FRAME_CLASS */
export const MOBILE_SHELL_OUTER_CLASS = MOBILE_FRAME_CLASS;

/** @deprecated Use MOBILE_FRAME_BODY_CLASS */
export const MOBILE_SHELL_INNER_CLASS = MOBILE_FRAME_BODY_CLASS;

/** @deprecated Use MOBILE_FRAME_CLASS height locking */
export const MOBILE_SHELL_FIXED_HEIGHT_CLASS = "h-full min-h-0";

/** @deprecated Use MOBILE_APP_ROOT_CLASS */
export const MOBILE_VIEWPORT_CLASS = MOBILE_APP_ROOT_CLASS;
