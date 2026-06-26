"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import AuthStatus from "@/components/AuthStatus";
import { isChatThreadRoute } from "@/lib/chatThreadRoutes";
import {
  MOBILE_BOTTOM_NAV_PADDING,
  MOBILE_FIXED_TOP_CHROME_CLASS,
  MOBILE_FRAME_BODY_CLASS,
  MOBILE_FRAME_CLASS,
  MOBILE_MAIN_SCROLL_CLASS,
  MOBILE_WIDTH_SAFE_CLASS,
} from "@/lib/mobileLayout";
import { isAuthRoute, shouldShowMobileBottomNav } from "@/lib/mainNav";

export default function Shell({
  children,
  showHeader = true,
  chatThread = false,
  immersive = false,
  flushTop = false,
  topBar,
  fixedLayout = false,
}: {
  children: ReactNode;
  showHeader?: boolean;
  chatThread?: boolean;
  immersive?: boolean;
  /** Drop default top padding (e.g. profile with its own app header). */
  flushTop?: boolean;
  /** Fixed top chrome below the safe area — search bar, secondary headers, etc. */
  topBar?: ReactNode;
  /** Lock shell height; children manage internal scroll (own profile). */
  fixedLayout?: boolean;
}) {
  const pathname = usePathname();
  const isAuth = isAuthRoute(pathname);
  const isWelcome = pathname === "/" || pathname === "";
  const isFullScreenChat = chatThread || isChatThreadRoute(pathname);
  const showMobileNav = shouldShowMobileBottomNav(pathname);
  const showDesktopHeader = showHeader && !isAuth;

  const shellPadding =
    isAuth || isWelcome || showMobileNav || flushTop
      ? "px-0 py-0"
      : "px-4 py-6 sm:px-6 lg:px-8";

  const contentMaxWidth = isAuth ? "max-w-full" : "max-w-5xl";
  const scrollPadding = showMobileNav ? MOBILE_BOTTOM_NAV_PADDING : "";

  if (isFullScreenChat) {
    return (
      <div className={`${MOBILE_FRAME_CLASS} min-h-0 flex-1`}>
        <div
          className={`${MOBILE_FRAME_BODY_CLASS} ${MOBILE_WIDTH_SAFE_CLASS} relative min-h-0 flex-1`}
        >
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className={`${MOBILE_FRAME_CLASS} select-none touch-manipulation`}>
      <div className={`${MOBILE_FRAME_BODY_CLASS} ${contentMaxWidth} ${shellPadding} select-none touch-manipulation`}>
        {showDesktopHeader ? (
          <header className="mb-4 hidden shrink-0 select-none touch-manipulation items-center justify-end gap-4 md:mb-6 md:flex">
            <AuthStatus />
          </header>
        ) : null}

        {topBar ? <div className={MOBILE_FIXED_TOP_CHROME_CLASS}>{topBar}</div> : null}

        {immersive ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
        ) : fixedLayout ? (
          <main
            className={`flex min-h-0 flex-1 select-none touch-manipulation flex-col overflow-hidden ${scrollPadding} ${MOBILE_WIDTH_SAFE_CLASS}`}
          >
            {children}
          </main>
        ) : (
          <main
            data-mobile-main-scroll=""
            className={`${MOBILE_MAIN_SCROLL_CLASS} ${scrollPadding} ${MOBILE_WIDTH_SAFE_CLASS} select-none touch-manipulation`}
          >
            {children}
          </main>
        )}
      </div>
    </div>
  );
}
