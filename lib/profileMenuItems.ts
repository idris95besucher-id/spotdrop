import {
  Bookmark,
  Bell,
  CircleHelp,
  LogOut,
  Settings,
} from "lucide-react";
import type { ProfileMenuItem } from "@/components/ProfileMenuSheet";
import type { TranslationKey } from "@/lib/i18n/messages";

type TranslateFn = (key: TranslationKey, values?: Record<string, string | number>) => string;

type BuildProfileMenuItemsInput = {
  onOpenCollections: () => void;
  onSignOut: () => void;
};

/** Central list for profile overflow menu — extend here as new tools are added. */
export function buildProfileMenuItems(input: BuildProfileMenuItemsInput, t: TranslateFn): ProfileMenuItem[] {
  return [
    {
      id: "notifications",
      label: t("menu.notifications"),
      description: t("menu.notificationsDesc"),
      icon: Bell,
      href: "/notifications",
    },
    {
      id: "settings",
      label: t("menu.settings"),
      description: t("menu.settingsDesc"),
      icon: Settings,
      href: "/settings",
    },
    {
      id: "collections",
      label: t("menu.collections"),
      description: t("menu.collectionsDesc"),
      icon: Bookmark,
      onClick: input.onOpenCollections,
    },
    {
      id: "help",
      label: t("menu.help"),
      description: t("menu.helpDesc"),
      icon: CircleHelp,
      href: "mailto:support@spotdrop.app",
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
