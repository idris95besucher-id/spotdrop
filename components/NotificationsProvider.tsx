"use client";

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { useI18n } from "@/components/I18nProvider";
import { getSafeAuthSession } from "@/lib/authSession";
import {
  buildNotificationCopy,
  countUnreadNotifications,
  dispatchNotificationsRefresh,
  NOTIFICATIONS_REFRESH_EVENT,
  type NotificationRow,
  type NotificationType,
} from "@/lib/notifications";
import { enableWebPush, isPushSupported, showLocalPushNotification } from "@/lib/pushNotifications";
import { loadUserSettingsPreferences, type NotificationPreferences } from "@/lib/settingsPreferences";
import { supabase } from "@/lib/supabaseClient";

type NotificationsContextValue = {
  unreadCount: number;
  refreshUnreadCount: () => Promise<void>;
  requestPushPermission: () => Promise<string | null>;
  pushSupported: boolean;
};

const NotificationsContext = createContext<NotificationsContextValue>({
  unreadCount: 0,
  refreshUnreadCount: async () => {},
  requestPushPermission: async () => null,
  pushSupported: false,
});

export function useNotifications() {
  return useContext(NotificationsContext);
}

function shouldDeliverNotification(type: NotificationType, prefs: NotificationPreferences) {
  switch (type) {
    case "direct_message":
      return prefs.messages;
    case "room_message":
      return prefs.messages;
    case "new_follower":
      return prefs.newFollowers;
    case "post_comment":
      return prefs.comments;
    default:
      return true;
  }
}

export default function NotificationsProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [session, setSession] = useState<Session | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const pushAttemptedRef = useRef(false);

  const userId = session?.user?.id ?? null;

  const refreshUnreadCount = useCallback(async () => {
    if (!userId) {
      setUnreadCount(0);
      return;
    }

    const { count } = await countUnreadNotifications(userId);
    setUnreadCount(count);
  }, [userId]);

  const requestPushPermission = useCallback(async () => {
    if (!userId) {
      return "not_authenticated";
    }

    const result = await enableWebPush(userId);

    if (result.error === "unsupported") {
      return "unsupported";
    }

    if (result.error === "denied") {
      return "denied";
    }

    if (result.error === "missing_vapid") {
      return "missing_vapid";
    }

    if (typeof result.error === "string") {
      return result.error;
    }

    return null;
  }, [userId]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    void getSafeAuthSession().then((result) => {
      setSession(result.session);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    void refreshUnreadCount();
  }, [refreshUnreadCount]);

  useEffect(() => {
    const handleRefresh = () => {
      void refreshUnreadCount();
    };

    window.addEventListener(NOTIFICATIONS_REFRESH_EVENT, handleRefresh);

    return () => {
      window.removeEventListener(NOTIFICATIONS_REFRESH_EVENT, handleRefresh);
    };
  }, [refreshUnreadCount]);

  useEffect(() => {
    if (!userId || pushAttemptedRef.current || !isPushSupported()) {
      return;
    }

    const prefs = loadUserSettingsPreferences();

    if (!prefs.notifications.messages) {
      return;
    }

    if (Notification.permission !== "default") {
      return;
    }

    pushAttemptedRef.current = true;
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      return;
    }

    const channel = supabase
      .channel(`notifications_${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as NotificationRow;

          if (!shouldDeliverNotification(row.type, loadUserSettingsPreferences().notifications)) {
            void refreshUnreadCount();
            dispatchNotificationsRefresh();
            return;
          }

          const copy = buildNotificationCopy(
            {
              type: row.type,
              metadata: (row.metadata as Record<string, unknown> | null) ?? {},
            },
            t
          );

          void refreshUnreadCount();
          dispatchNotificationsRefresh();

          void showLocalPushNotification({
            title: copy.title,
            body: copy.body,
            href: row.href,
          });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refreshUnreadCount, t, userId]);

  const value = useMemo(
    () => ({
      unreadCount,
      refreshUnreadCount,
      requestPushPermission,
      pushSupported: isPushSupported(),
    }),
    [refreshUnreadCount, requestPushPermission, unreadCount]
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function NotificationsBellLink({ className }: { className?: string }) {
  const { t } = useI18n();

  return (
    <Link
      href="/notifications"
      className={className}
      aria-label={t("notifications.title")}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        className="h-6 w-6"
        aria-hidden
      >
        <path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M13.7 21a2 2 0 0 1-3.4 0" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}
