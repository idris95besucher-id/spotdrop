"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import AuthStatus from "@/components/AuthStatus";
import { MobileBottomNav } from "@/components/MainNavigation";
import { isChatThreadRoute } from "@/lib/chatThreadRoutes";
import {
  isAuthRoute,
  MOBILE_BOTTOM_NAV_PADDING,
  shouldShowMobileBottomNav,
} from "@/lib/mainNav";

export default function Shell({
  children,
  showHeader = true,
  chatThread = false,
  immersive = false,
  flushTop = false,
}: {
  children: ReactNode;
  showHeader?: boolean;
  chatThread?: boolean;
  immersive?: boolean;
  /** Drop default top padding (e.g. profile with its own app header). */
  flushTop?: boolean;
}) {
  const pathname = usePathname();
  const isAuth = isAuthRoute(pathname);
  const isWelcome = pathname === "/" || pathname === "";
  const isFullScreenChat = chatThread || isChatThreadRoute(pathname);
  const showMobileNav = shouldShowMobileBottomNav(pathname);
  const isMobileSecondary = !showMobileNav && !isFullScreenChat && !isAuth;
  const showDesktopHeader = showHeader && !isAuth;

  if (immersive) {
    return (
      <div className="min-h-[100dvh] bg-[#050816] text-white">
        <main className="h-[calc(100dvh-4.5rem-env(safe-area-inset-bottom,0px))] min-h-0 md:h-[100dvh]">
          {children}
        </main>
        {showMobileNav ? <MobileBottomNav /> : null}
      </div>
    );
  }

  if (isFullScreenChat) {
    return (
      <div className="min-h-[100dvh] bg-[#050816] text-white">
        <main className="h-[100dvh] min-h-0">{children}</main>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] w-full max-w-full overflow-x-hidden bg-[#050816] text-white md:min-h-screen">
      <div
        className={`mx-auto flex min-h-[100dvh] w-full max-w-full min-w-0 flex-col overflow-x-hidden md:min-h-screen ${
          isAuth ? "max-w-full" : "max-w-5xl"
        } ${showMobileNav ? MOBILE_BOTTOM_NAV_PADDING : ""} md:pb-0 ${
          isAuth || isWelcome
            ? "px-0 py-0"
            : isMobileSecondary
              ? "px-0 py-0 sm:px-6 sm:py-6 lg:px-8"
              : flushTop
                ? "px-4 pb-6 pt-0 sm:px-6 lg:px-8"
                : "px-4 py-6 sm:px-6 lg:px-8"
        }`}
      >
        {showDesktopHeader ? (
          <header className="mb-4 hidden items-center justify-end gap-4 md:mb-6 md:flex">
            <AuthStatus />
          </header>
        ) : null}
        <main
          className={`min-w-0 w-full max-w-full flex-1 overflow-x-hidden ${
            isMobileSecondary ? "flex min-h-0 flex-col" : ""
          }`}
        >
          {children}
        </main>
      </div>
      {showMobileNav ? <MobileBottomNav /> : null}
    </div>
  );
}
