"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
import { localizeCountryName, localizeCityName } from "@/lib/i18n/localizeGeo";
import { getSafeAuthSession } from "@/lib/authSession";
import {
  buildIncomingMessageToast,
  buildIncomingRoomMessageToast,
  countUnreadInboxMessages,
  fetchProfileUsername,
  markDirectMessagesDeliveredFromSender,
} from "@/lib/chatNotifications";
import {
  dispatchDmIncomingMessage,
  DM_THREAD_READ_EVENT,
  getOptimisticReadExcludes,
  markDmThreadOpened,
  type DmThreadReadDetail,
} from "@/lib/chatUnreadSync";
import { messageMentionsUsername } from "@/lib/chatMentions";
import { CHATS_INBOX_REFRESH_EVENT } from "@/lib/chatsInbox";
import { isDmMuted } from "@/lib/chatInboxPreferences";
import {
  isViewingCityRoomThread,
  isViewingDirectMessageThread,
} from "@/lib/chatThreadRoutes";
import {
  playMessageNotificationSound,
  skipMessageNotificationSound,
} from "@/lib/messageNotificationSound";
import { buildRoomHref, fetchRoomMembershipForCity } from "@/lib/roomMemberships";
import { loadUserSettingsPreferences } from "@/lib/settingsPreferences";
import { supabase } from "@/lib/supabaseClient";

type ChatToast = {
  id: string;
  message: string;
  href: string;
};

type ChatNotificationsContextValue = {
  unreadCount: number;
  refreshUnreadCount: () => Promise<void>;
  adjustDmUnreadTotal: (delta: number) => void;
};

const ChatNotificationsContext = createContext<ChatNotificationsContextValue>({
  unreadCount: 0,
  refreshUnreadCount: async () => {},
  adjustDmUnreadTotal: () => {},
});

export function useChatNotifications() {
  return useContext(ChatNotificationsContext);
}

function ChatToastBanner({
  toast,
  onDismiss,
  openLabel,
}: {
  toast: ChatToast;
  onDismiss: () => void;
  openLabel: string;
}) {
  return (
    <div
      className="fixed left-4 right-4 top-20 z-[70] mx-auto max-w-lg md:left-auto md:right-6 md:top-24"
      role="status"
      aria-live="polite"
    >
      <Link
        href={toast.href}
        onClick={onDismiss}
        className="flex items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-[#0B1026] px-4 py-3 text-sm font-medium text-white shadow-xl shadow-black/40 ring-1 ring-primary/20"
      >
        <span>{toast.message}</span>
        <span className="shrink-0 text-xs font-semibold text-primary">{openLabel}</span>
      </Link>
    </div>
  );
}

export default function ChatNotificationsProvider({ children }: { children: ReactNode }) {
  const { t, locale } = useI18n();
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [toast, setToast] = useState<ChatToast | null>(null);
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const userId = session?.user?.id ?? null;

  const dismissToast = useCallback(() => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }

    setToast(null);
  }, []);

  const showToast = useCallback(
    (next: ChatToast) => {
      dismissToast();
      setToast(next);
      toastTimerRef.current = setTimeout(() => {
        setToast(null);
        toastTimerRef.current = null;
      }, 5000);
    },
    [dismissToast]
  );

  const adjustDmUnreadTotal = useCallback((delta: number) => {
    setUnreadCount((current) => {
      const next = Math.max(0, current + delta);
      console.log("[DM unread] total updated", next);
      return next;
    });
  }, []);

  const refreshUnreadCount = useCallback(async () => {
    if (!userId) {
      setUnreadCount(0);
      return;
    }

    const { count, error } = await countUnreadInboxMessages(userId, getOptimisticReadExcludes());

    if (error) {
      console.error("[DM unread] total refresh failed", error);
      return;
    }

    setUnreadCount(count);
    console.log("[DM read] total unread after clear=", count);
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
    if (!userId) {
      setUnreadCount(0);
    }
  }, [userId]);

  useEffect(() => {
    void refreshUnreadCount();
  }, [refreshUnreadCount]);

  useEffect(() => {
    const onThreadRead = (event: Event) => {
      const detail = (event as CustomEvent<DmThreadReadDetail>).detail;

      if (!detail?.partnerId || detail.clearedCount <= 0) {
        return;
      }

      adjustDmUnreadTotal(-detail.clearedCount);
    };

    window.addEventListener(DM_THREAD_READ_EVENT, onThreadRead);

    return () => {
      window.removeEventListener(DM_THREAD_READ_EVENT, onThreadRead);
    };
  }, [adjustDmUnreadTotal]);

  useEffect(() => {
    const handleInboxRefresh = () => {
      void refreshUnreadCount();
    };

    window.addEventListener(CHATS_INBOX_REFRESH_EVENT, handleInboxRefresh);

    return () => {
      window.removeEventListener(CHATS_INBOX_REFRESH_EVENT, handleInboxRefresh);
    };
  }, [refreshUnreadCount]);

  useEffect(() => {
    if (!userId) {
      setCurrentUsername(null);
      return;
    }

    let cancelled = false;

    void supabase
      .from("profiles")
      .select("username")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) {
          setCurrentUsername((data?.username as string | null) ?? null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      return;
    }

    const messagesEnabled = () => loadUserSettingsPreferences().notifications.messages;

    const channel = supabase
      .channel(`chat_notifications_${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "direct_messages",
          filter: `recipient_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as {
            sender_id: string;
            recipient_id: string;
            message_type?: string | null;
          };

          if (row.sender_id === userId) {
            skipMessageNotificationSound("own_message");
            return;
          }

          const openThreadPath = `/dm?id=${row.sender_id}`;

          if (isViewingDirectMessageThread(pathname, row.sender_id)) {
            skipMessageNotificationSound("viewing_thread");
            void markDmThreadOpened(userId, row.sender_id, refreshUnreadCount);
            return;
          }

          console.log("[DM unread] incoming message", { partnerId: row.sender_id });
          adjustDmUnreadTotal(1);
          dispatchDmIncomingMessage(row.sender_id);

          void (async () => {
            await markDirectMessagesDeliveredFromSender(userId, row.sender_id);
            void refreshUnreadCount();
            window.dispatchEvent(new Event(CHATS_INBOX_REFRESH_EVENT));

            if (!messagesEnabled()) {
              skipMessageNotificationSound("messages_disabled");
              return;
            }

            if (await isDmMuted(userId, row.sender_id)) {
              skipMessageNotificationSound("muted");
              return;
            }

            const { username } = await fetchProfileUsername(row.sender_id);
            const senderName = username === "Someone" ? t("common.someone") : username;
            const message = buildIncomingMessageToast(
              {
                senderUsername: senderName,
                messageType: row.message_type ?? "text",
              },
              t
            );

            void playMessageNotificationSound();

            showToast({
              id: `${row.sender_id}-${Date.now()}`,
              message,
              href: openThreadPath,
            });
          })();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "city_messages",
        },
        (payload) => {
          const row = payload.new as {
            city_id: string;
            user_id: string;
            content?: string | null;
          };

          if (row.user_id === userId) {
            skipMessageNotificationSound("own_message");
            return;
          }

          void (async () => {
            const membership = await fetchRoomMembershipForCity(userId, row.city_id);

            if (!membership) {
              skipMessageNotificationSound("not_member");
              return;
            }

            const isMention = messageMentionsUsername(row.content, currentUsername);
            const roomPath = buildRoomHref(membership.countrySlug, membership.citySlug);

            if (membership.isHidden && !isMention) {
              skipMessageNotificationSound("hidden_room");
              return;
            }

            if (membership.isMuted && !isMention) {
              skipMessageNotificationSound("muted");
              return;
            }

            if (isViewingCityRoomThread(pathname, roomPath)) {
              skipMessageNotificationSound("viewing_thread");
              return;
            }

            void refreshUnreadCount();
            window.dispatchEvent(new Event(CHATS_INBOX_REFRESH_EVENT));

            if (!messagesEnabled()) {
              skipMessageNotificationSound("messages_disabled");
              return;
            }

            const message = buildIncomingRoomMessageToast(
              {
                cityName: localizeCityName(locale, {
                  slug: membership.citySlug,
                  name: membership.cityName,
                  countrySlug: membership.countrySlug,
                }),
                countryName: localizeCountryName(locale, {
                  slug: membership.countrySlug,
                  name: membership.countryName,
                }),
              },
              t
            );

            void playMessageNotificationSound();

            showToast({
              id: `${membership.citySlug}-${Date.now()}`,
              message,
              href: roomPath,
            });
          })();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [
    adjustDmUnreadTotal,
    currentUsername,
    pathname,
    refreshUnreadCount,
    showToast,
    t,
    locale,
    userId,
  ]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const value = useMemo(
    () => ({
      unreadCount,
      refreshUnreadCount,
      adjustDmUnreadTotal,
    }),
    [adjustDmUnreadTotal, refreshUnreadCount, unreadCount]
  );

  return (
    <ChatNotificationsContext.Provider value={value}>
      {children}
      {toast ? (
        <ChatToastBanner toast={toast} onDismiss={dismissToast} openLabel={t("common.open")} />
      ) : null}
    </ChatNotificationsContext.Provider>
  );
}
