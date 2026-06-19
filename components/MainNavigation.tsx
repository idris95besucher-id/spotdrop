"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  Globe2,
  MessageCircle,
  Plus,
  Search as SearchIcon,
  UserRound,
} from "lucide-react";
import { useAuthSession } from "@/components/AuthSessionProvider";
import { useI18n } from "@/components/I18nProvider";
import { useChatNotifications } from "@/components/ChatNotificationsProvider";
import { useNotifications } from "@/components/NotificationsProvider";
import { CreateNavButton, useCreateMenu } from "@/components/CreateMenuProvider";
import { formatUnreadBadge } from "@/lib/chatNotifications";
import { isMainNavActive, MAIN_NAV_ITEMS, MAIN_NAV_LEFT, MAIN_NAV_RIGHT, shouldShowMobileBottomNav } from "@/lib/mainNav";
import { MOBILE_FIXED_BOTTOM_NAV_CLASS } from "@/lib/mobileLayout";

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

function useNavSession() {
  const { session, loading } = useAuthSession();
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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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

  const nav = (
    <nav data-mobile-bottom-nav className={MOBILE_FIXED_BOTTOM_NAV_CLASS} aria-label="Main">
      <div className="mx-auto flex h-[54px] w-full min-w-0 max-w-lg items-stretch justify-around px-1">
        {MAIN_NAV_LEFT.map(renderItem)}
        <CreateNavButton className="min-w-0 flex-1" />
        {MAIN_NAV_RIGHT.map(renderItem)}
      </div>
    </nav>
  );

  if (!mounted) {
    return null;
  }

  return createPortal(nav, document.body);
}
