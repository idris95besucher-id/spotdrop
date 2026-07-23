import {
  Bell,
  CircleHelp,
  LogOut,
  Settings,
} from "lucide-react";
import type { ProfileMenuItem } from "@/components/ProfileMenuSheet";
import type { TranslationKey } from "@/lib/i18n/messages";

type TranslateFn = (key: TranslationKey, values?: Record<string, string | number>) => string;

type BuildProfileMenuItemsInput = {
  onSignOut: () => void;
  notificationsUnreadCount?: number;
};

/** Central list for profile overflow menu — extend here as new tools are added. */
export function buildProfileMenuItems(input: BuildProfileMenuItemsInput, t: TranslateFn): ProfileMenuItem[] {
  const unread = input.notificationsUnreadCount ?? 0;

  return [
    {
      id: "notifications",
      label: t("menu.notifications"),
      description: t("menu.notificationsDesc"),
      icon: Bell,
      href: "/notifications",
      badge: unread > 0 ? (unread > 99 ? "99+" : unread) : undefined,
    },
    {
      id: "settings",
      label: t("menu.settings"),
      description: t("menu.settingsDesc"),
      icon: Settings,
      href: "/settings",
    },
    {
      id: "help",
      label: t("menu.help"),
      description: t("menu.helpDesc"),
      icon: CircleHelp,
      href: "/support",
    },
    {
      id: "sign-out",
      label: t("auth.signOut"),
      description: t("menu.signOutDesc"),
      icon: LogOut,
      destructive: true,
      onClick: input.onSignOut,
    },
  ];
}
