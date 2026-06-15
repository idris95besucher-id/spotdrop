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
import { getSafeAuthSession } from "@/lib/authSession";
import {
  buildIncomingMessageToast,
  buildIncomingRoomMessageToast,
  countUnreadInboxMessages,
  fetchProfileUsername,
  markDirectMessagesReadInThread,
} from "@/lib/chatNotifications";
import { CHATS_INBOX_REFRESH_EVENT } from "@/lib/chatsInbox";
import { buildRoomHref, fetchRoomMembershipForCity } from "@/lib/roomMemberships";
import { supabase } from "@/lib/supabaseClient";

type ChatToast = {
  id: string;
  message: string;
  href: string;
};

type ChatNotificationsContextValue = {
  unreadCount: number;
  refreshUnreadCount: () => Promise<void>;
};

const ChatNotificationsContext = createContext<ChatNotificationsContextValue>({
  unreadCount: 0,
  refreshUnreadCount: async () => {},
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
  const { t } = useI18n();
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [toast, setToast] = useState<ChatToast | null>(null);
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

  const refreshUnreadCount = useCallback(async () => {
    if (!userId) {
      setUnreadCount(0);
      return;
    }

    const { count } = await countUnreadInboxMessages(userId);
    setUnreadCount(count);
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
      return;
    }

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
            return;
          }

          const openThreadPath = `/dm/${row.sender_id}`;
          const isViewingThread = pathname === openThreadPath;

          if (isViewingThread) {
            void markDirectMessagesReadInThread(userId, row.sender_id).then(() => {
              void refreshUnreadCount();
            });
            return;
          }

          void refreshUnreadCount();
          window.dispatchEvent(new Event(CHATS_INBOX_REFRESH_EVENT));

          void (async () => {
            const { username } = await fetchProfileUsername(row.sender_id);
            const senderName = username === "Someone" ? t("common.someone") : username;
            const message = buildIncomingMessageToast(
              {
                senderUsername: senderName,
                messageType: row.message_type ?? "text",
              },
              t
            );

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
          };

          if (row.user_id === userId) {
            return;
          }

          void (async () => {
            const membership = await fetchRoomMembershipForCity(userId, row.city_id);

            if (!membership || membership.isHidden || membership.isMuted) {
              return;
            }

            const roomPath = buildRoomHref(membership.countrySlug, membership.citySlug);
            const isViewingRoom = pathname === roomPath;

            if (isViewingRoom) {
              return;
            }

            void refreshUnreadCount();
            window.dispatchEvent(new Event(CHATS_INBOX_REFRESH_EVENT));

            const message = buildIncomingRoomMessageToast(
              {
                cityName: membership.cityName,
                countryName: membership.countryName,
              },
              t
            );

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
  }, [pathname, refreshUnreadCount, showToast, t, userId]);

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
    }),
    [refreshUnreadCount, unreadCount]
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
