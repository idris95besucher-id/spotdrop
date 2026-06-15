"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  Globe2,
  MessageCircle,
  Plus,
  Search as SearchIcon,
  UserRound,
} from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import {
  getSafeAuthSession,
  SESSION_EXPIRED_MESSAGE,
  setAuthNotice,
  shouldHandleSessionExpiry,
} from "@/lib/authSession";
import { useChatNotifications } from "@/components/ChatNotificationsProvider";
import { useNotifications } from "@/components/NotificationsProvider";
import { CreateNavButton, useCreateMenu } from "@/components/CreateMenuProvider";
import { formatUnreadBadge } from "@/lib/chatNotifications";
import { isMainNavActive, MAIN_NAV_ITEMS, MAIN_NAV_LEFT, MAIN_NAV_RIGHT, shouldShowMobileBottomNav } from "@/lib/mainNav";
import { supabase } from "@/lib/supabaseClient";

const desktopIconClass =
  "h-[18px] w-[18px] shrink-0 text-muted transition-colors group-hover:text-white";

const desktopLinkClass =
  "group inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-card/80 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:px-2.5";

const signInClass =
  "inline-flex items-center rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-background transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background";

function NavBadge({ count }: { count: number }) {
  const label = formatUnreadBadge(count);

  if (!label) {
    return null;
  }

  return (
    <span className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-[#0B1026]">
      {label}
    </span>
  );
}

function navIcon(href: string, active: boolean, badgeCount = 0) {
  const className = `h-6 w-6 shrink-0 transition-colors ${
    active ? "text-primary [filter:drop-shadow(0_0_8px_var(--sd-primary-glow))]" : "text-muted group-hover:text-slate-300"
  }`;

  let icon: ReactNode = null;

  switch (href) {
    case "/visit":
      icon = <Globe2 className={className} strokeWidth={1.75} aria-hidden />;
      break;
    case "/chats":
      icon = <MessageCircle className={className} strokeWidth={1.75} aria-hidden />;
      break;
    case "/search":
      icon = <SearchIcon className={className} strokeWidth={1.75} aria-hidden />;
      break;
    case "/profile":
      icon = <UserRound className={className} strokeWidth={1.75} aria-hidden />;
      break;
    default:
      break;
  }

  if (!icon) {
    return null;
  }

  if (href === "/chats" || href === "/profile") {
    return (
      <span className="relative inline-flex">
        {icon}
        <NavBadge count={badgeCount} />
      </span>
    );
  }

  return icon;
}

function DesktopNavLink({
  href,
  label,
  icon,
  active,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`${desktopLinkClass} ${active ? "bg-card text-white" : ""}`}
      aria-current={active ? "page" : undefined}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}

function isAuthRoute(pathname: string | null) {
  return pathname?.startsWith("/auth") ?? false;
}

function useNavSession() {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const loadSession = async () => {
      const result = await getSafeAuthSession();

      if (!active) {
        return;
      }

      if (result.expired) {
        setSession(null);
        setLoading(false);

        if (!isAuthRoute(pathname) && shouldHandleSessionExpiry()) {
          setAuthNotice(SESSION_EXPIRED_MESSAGE);
          router.replace("/auth/login");
        }

        return;
      }

      setSession(result.session);
      setLoading(false);
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) {
        return;
      }

      setSession(nextSession);
      setLoading(false);
    });

    void loadSession();

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [pathname, router]);

  return { session, loading };
}

function DesktopCreateButton() {
  const { openCreateMenu } = useCreateMenu();

  return (
    <button
      type="button"
      onClick={openCreateMenu}
      className="group inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-card/80 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:px-2.5"
    >
      <Plus className={desktopIconClass} strokeWidth={1.75} aria-hidden />
      <span>Create</span>
    </button>
  );
}

function MobileNavLink({
  href,
  label,
  active,
  badgeCount,
}: {
  href: string;
  label: string;
  active: boolean;
  badgeCount: number;
}) {
  return (
    <Link
      href={href}
      className="group flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-2"
      aria-current={active ? "page" : undefined}
    >
      {navIcon(href, active, badgeCount)}
      <span
        className={`max-w-full truncate text-[10px] font-medium leading-none ${
          active ? "text-primary" : "text-muted group-hover:text-slate-300"
        }`}
      >
        {label}
      </span>
    </Link>
  );
}

export function DesktopMainNav() {
  const pathname = usePathname();
  const { session, loading } = useNavSession();
  const { unreadCount: chatUnreadCount } = useChatNotifications();
  const { unreadCount: notificationUnreadCount } = useNotifications();
  const { t } = useI18n();

  if (loading) {
    return <span className="text-sm text-muted">{t("common.loading")}</span>;
  }

  const badgeForHref = (href: string) => {
    if (href === "/chats") {
      return chatUnreadCount;
    }

    if (href === "/profile") {
      return notificationUnreadCount;
    }

    return 0;
  };

  const renderNavLink = (item: (typeof MAIN_NAV_ITEMS)[number]) => (
    <DesktopNavLink
      key={item.href}
      href={item.href}
      label={t(item.labelKey)}
      active={isMainNavActive(pathname, item.href)}
      icon={navIcon(item.href, isMainNavActive(pathname, item.href), badgeForHref(item.href))}
    />
  );

  return (
    <nav className="flex flex-wrap items-center justify-end gap-2 sm:gap-3" aria-label="Main">
      {MAIN_NAV_LEFT.map(renderNavLink)}
      {session?.user ? <DesktopCreateButton /> : null}
      {MAIN_NAV_RIGHT.map(renderNavLink)}
      {!session?.user ? (
        <Link href="/auth/login" className={signInClass}>
          {t("auth.signIn")}
        </Link>
      ) : null}
    </nav>
  );
}

export function MobileBottomNav() {
  const pathname = usePathname();
  const { unreadCount: chatUnreadCount } = useChatNotifications();
  const { unreadCount: notificationUnreadCount } = useNotifications();
  const { t } = useI18n();

  if (!shouldShowMobileBottomNav(pathname)) {
    return null;
  }

  const badgeForHref = (href: string) => {
    if (href === "/chats") {
      return chatUnreadCount;
    }

    if (href === "/profile") {
      return notificationUnreadCount;
    }

    return 0;
  };

  const renderItem = (item: (typeof MAIN_NAV_ITEMS)[number]) => {
    const active = isMainNavActive(pathname, item.href);
    const label = t(item.shortLabelKey ?? item.labelKey);

    return (
      <MobileNavLink
        key={item.href}
        href={item.href}
        label={label}
        active={active}
        badgeCount={badgeForHref(item.href)}
      />
    );
  };

  return (
    <nav
      data-mobile-bottom-nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-primary/15 bg-[#0B1026]/95 backdrop-blur-xl md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Main"
    >
      <div className="mx-auto flex h-[4.5rem] max-w-lg items-stretch justify-around px-1">
        {MAIN_NAV_LEFT.map(renderItem)}
        <CreateNavButton className="min-w-0 flex-1" />
        {MAIN_NAV_RIGHT.map(renderItem)}
      </div>
    </nav>
  );
}
