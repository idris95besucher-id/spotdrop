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
  dispatchRoomIncomingMessage,
  DM_THREAD_READ_EVENT,
  getOptimisticReadExcludes,
  markDmThreadOpened,
  type DmThreadReadDetail,
} from "@/lib/chatUnreadSync";
import { messageMentionsUsername } from "@/lib/chatMentions";
import {
  CHATS_INBOX_REFRESH_EVENT,
  CHATS_INBOX_SILENT_REFRESH_EVENT,
} from "@/lib/chatsInbox";
import { isDmMuted } from "@/lib/chatInboxPreferences";
import {
  isViewingCityRoomThread,
  isViewingDirectMessageThread,
} from "@/lib/chatThreadRoutes";
import { groupThreadHref, isViewingGroupThread } from "@/lib/groupChatRoutes";
import { markGroupThreadRead } from "@/lib/groupChats";
import { isGroupSystemEventMessage } from "@/lib/groupChatSystemEvents";
import {
  playMessageNotificationSound,
  skipMessageNotificationSound,
} from "@/lib/messageNotificationSound";
import { buildRoomHref, fetchRoomMembershipForCity } from "@/lib/roomMemberships";
import { loadUserSettingsPreferences } from "@/lib/settingsPreferences";
import { isCapacitorNative } from "@/lib/capacitorUtils";
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
  // Bumped whenever the app resumes from background/reconnects. Included in each global
  // channel's subscribe effect deps below so a resume tears down and re-subscribes fresh
  // channels — the same "channel might be dead after a socket drop, don't just log it" gap that
  // OnlinePresenceBootstrap already closes for presence. Realtime's own auto-rejoin timer is a
  // background setTimeout that iOS can starve while the WKWebView is suspended, so these three
  // notification channels (DM/Room/Group) could otherwise stay CHANNEL_ERROR indefinitely after
  // any backgrounding or network drop until the whole app was force-restarted.
  const [resumeGeneration, setResumeGeneration] = useState(0);

  const userId = session?.user?.id ?? null;

  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const tRef = useRef(t);
  tRef.current = t;

  const localeRef = useRef(locale);
  localeRef.current = locale;

  const currentUsernameRef = useRef(currentUsername);
  currentUsernameRef.current = currentUsername;

  const dismissToast = useCallback(() => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }

    setToast(null);
  }, []);

  const showToastRef = useRef<(next: ChatToast) => void>(() => {});

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

  showToastRef.current = showToast;

  const adjustDmUnreadTotal = useCallback((delta: number) => {
    setUnreadCount((current) => {
      const next = Math.max(0, current + delta);
      console.log("[DM global] unread count updated", next);
      console.log("[DM global] badge updated", next);
      return next;
    });
  }, []);

  const adjustDmUnreadTotalRef = useRef(adjustDmUnreadTotal);
  adjustDmUnreadTotalRef.current = adjustDmUnreadTotal;

  const refreshUnreadCount = useCallback(async () => {
    if (!userId) {
      setUnreadCount(0);
      return;
    }

    const { count, error } = await countUnreadInboxMessages(userId, getOptimisticReadExcludes());

    if (error) {
      console.error("[DM global] unread count refresh failed", error);
      return;
    }

    setUnreadCount(count);
    console.log("[DM global] unread count updated", count);
    console.log("[DM global] badge updated", count);
  }, [userId]);

  const refreshUnreadCountRef = useRef(refreshUnreadCount);
  refreshUnreadCountRef.current = refreshUnreadCount;

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
    const bumpResumeGeneration = (source: string) => {
      console.log("[Chat global] resume — reconnecting global channels", { source });
      setResumeGeneration((current) => current + 1);
    };

    const onVisibilityChange = () => {
      if (!isCapacitorNative() && document.visibilityState === "visible") {
        bumpResumeGeneration("visibility-visible");
      }
    };

    const onWindowFocus = () => {
      if (!isCapacitorNative()) {
        bumpResumeGeneration("window-focus");
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onWindowFocus);

    let removeAppListener: (() => void) | undefined;

    void (async () => {
      if (!isCapacitorNative()) {
        return;
      }

      try {
        const { App } = await import("@capacitor/app");
        const handle = await App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) {
            bumpResumeGeneration("appStateChange-active");
          }
        });

        removeAppListener = () => {
          void handle.remove();
        };
      } catch (error) {
        console.error("[Chat global] Capacitor App listener setup failed", error);
      }
    })();

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onWindowFocus);
      removeAppListener?.();
    };
  }, []);

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

    console.log("[DM global] subscribe start", { userId });

    const messagesEnabled = () => loadUserSettingsPreferences().notifications.messages;

    const channel = supabase
      .channel(`dm_global_${userId}`)
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
            id: string;
            sender_id: string;
            recipient_id: string;
            body?: string | null;
            message_type?: string | null;
            spot_share_id?: string | null;
            post_id?: string | null;
            created_at: string;
          };

          if (row.sender_id === userId) {
            skipMessageNotificationSound("own_message");
            return;
          }

          console.log("[DM global] incoming message", {
            id: row.id,
            partnerId: row.sender_id,
          });

          const openThreadPath = `/dm?id=${row.sender_id}`;

          if (isViewingDirectMessageThread(pathnameRef.current, row.sender_id)) {
            skipMessageNotificationSound("viewing_thread");
            void markDmThreadOpened(userId, row.sender_id, refreshUnreadCountRef.current);
            return;
          }

          adjustDmUnreadTotalRef.current(1);

          dispatchDmIncomingMessage(row.sender_id, {
            body: row.body ?? null,
            message_type: row.message_type ?? null,
            spot_share_id: row.spot_share_id ?? null,
            post_id: row.post_id ?? null,
            created_at: row.created_at,
          });

          console.log("[DM global] inbox updated", { partnerId: row.sender_id });

          void (async () => {
            await markDirectMessagesDeliveredFromSender(userId, row.sender_id);

            if (!messagesEnabled()) {
              skipMessageNotificationSound("messages_disabled");
              return;
            }

            if (await isDmMuted(userId, row.sender_id)) {
              skipMessageNotificationSound("muted");
              return;
            }

            const { username } = await fetchProfileUsername(row.sender_id);
            const senderName = username === "Someone" ? tRef.current("common.someone") : username;
            const message = buildIncomingMessageToast(
              {
                senderUsername: senderName,
                messageType: row.message_type ?? "text",
              },
              tRef.current
            );

            void playMessageNotificationSound();

            showToastRef.current({
              id: `${row.sender_id}-${Date.now()}`,
              message,
              href: openThreadPath,
            });
          })();
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log("[DM global] subscribed", { userId });
        } else if (status === "CHANNEL_ERROR") {
          console.error("[DM global] status CHANNEL_ERROR", { userId });
        } else if (status === "TIMED_OUT") {
          console.error("[DM global] status TIMED_OUT", { userId });
        } else if (status === "CLOSED") {
          console.log("[DM global] status CLOSED", { userId });
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, resumeGeneration]);

  useEffect(() => {
    if (!userId) {
      return;
    }

    console.log("[Room global] subscribe start", { userId });

    const messagesEnabled = () => loadUserSettingsPreferences().notifications.messages;

    const channel = supabase
      .channel(`room_global_${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "city_messages",
        },
        (payload) => {
          const row = payload.new as {
            id: string;
            city_id: string;
            user_id: string;
            content?: string | null;
            created_at: string;
          };

          if (row.user_id === userId) {
            skipMessageNotificationSound("own_message");
            return;
          }

          console.log("[Room global] incoming message", {
            id: row.id,
            cityId: row.city_id,
          });

          void (async () => {
            const membership = await fetchRoomMembershipForCity(userId, row.city_id);

            if (!membership) {
              skipMessageNotificationSound("not_member");
              return;
            }

            const isMention = messageMentionsUsername(row.content, currentUsernameRef.current);
            const roomPath = buildRoomHref(membership.countrySlug, membership.citySlug);

            if (membership.isHidden && !isMention) {
              skipMessageNotificationSound("hidden_room");
              return;
            }

            const viewingRoom = isViewingCityRoomThread(pathnameRef.current, roomPath);

            if (viewingRoom) {
              console.log("[Room global] skipped current room", {
                countrySlug: membership.countrySlug,
                citySlug: membership.citySlug,
              });
              skipMessageNotificationSound("viewing_thread");
              return;
            }

            const incrementUnread = !membership.isMuted || isMention;

            dispatchRoomIncomingMessage({
              countrySlug: membership.countrySlug,
              citySlug: membership.citySlug,
              message: {
                content: row.content ?? null,
                created_at: row.created_at,
              },
              incrementUnread,
            });

            console.log("[Room global] inbox updated", {
              countrySlug: membership.countrySlug,
              citySlug: membership.citySlug,
            });

            if (incrementUnread) {
              adjustDmUnreadTotalRef.current(1);
              console.log("[Room global] unread count updated");
            }

            window.dispatchEvent(new Event(CHATS_INBOX_SILENT_REFRESH_EVENT));
            console.log("[Room global] silent refresh");

            if (membership.isMuted && !isMention) {
              skipMessageNotificationSound("muted");
              return;
            }

            if (!messagesEnabled()) {
              skipMessageNotificationSound("messages_disabled");
              return;
            }

            const message = buildIncomingRoomMessageToast(
              {
                cityName: localizeCityName(localeRef.current, {
                  slug: membership.citySlug,
                  name: membership.cityName,
                  countrySlug: membership.countrySlug,
                }),
                countryName: localizeCountryName(localeRef.current, {
                  slug: membership.countrySlug,
                  name: membership.countryName,
                }),
              },
              tRef.current
            );

            void playMessageNotificationSound();

            showToastRef.current({
              id: `${membership.citySlug}-${Date.now()}`,
              message,
              href: roomPath,
            });
          })();
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log("[Room global] subscribed", { userId });
        } else if (status === "CHANNEL_ERROR") {
          console.error("[Room global] status CHANNEL_ERROR", { userId });
        } else if (status === "TIMED_OUT") {
          console.error("[Room global] status TIMED_OUT", { userId });
        } else if (status === "CLOSED") {
          console.log("[Room global] status CLOSED", { userId });
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, resumeGeneration]);

  useEffect(() => {
    if (!userId) {
      return;
    }

    console.log("[Group global] subscribe start", { userId });

    const messagesEnabled = () => loadUserSettingsPreferences().notifications.messages;

    // RLS on group_chat_messages restricts SELECT (and therefore Realtime delivery)
    // to members of the group, so no client-side "is my group" filter is needed here.
    const channel = supabase
      .channel(`group_global_${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "group_chat_messages" },
        (payload) => {
          const row = payload.new as {
            id: string;
            group_id: string;
            sender_id: string;
            message_type?: string | null;
            body?: string | null;
            created_at: string;
          };

          if (row.sender_id === userId) {
            skipMessageNotificationSound("own_message");
            return;
          }

          console.log("[Group global] incoming message", { id: row.id, groupId: row.group_id });

          const openThreadPath = groupThreadHref(row.group_id);

          if (isViewingGroupThread(pathnameRef.current, row.group_id)) {
            skipMessageNotificationSound("viewing_thread");
            void markGroupThreadRead(row.group_id, userId);
            return;
          }

          adjustDmUnreadTotalRef.current(1);
          window.dispatchEvent(new Event(CHATS_INBOX_SILENT_REFRESH_EVENT));
          console.log("[Group global] inbox updated", { groupId: row.group_id });

          if (isGroupSystemEventMessage(row.body)) {
            skipMessageNotificationSound("system_event");
            return;
          }

          void (async () => {
            if (!messagesEnabled()) {
              skipMessageNotificationSound("messages_disabled");
              return;
            }

            const { data: groupRow } = await supabase
              .from("group_chats")
              .select("name")
              .eq("id", row.group_id)
              .maybeSingle();

            const { username } = await fetchProfileUsername(row.sender_id);
            const senderName = username === "Someone" ? tRef.current("common.someone") : username;
            const groupName = (groupRow?.name as string | null) ?? tRef.current("group.chatInfo");
            const message = tRef.current("chats.toast.message", { name: `${senderName} · ${groupName}` });

            void playMessageNotificationSound();

            showToastRef.current({
              id: `${row.group_id}-${Date.now()}`,
              message,
              href: openThreadPath,
            });
          })();
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log("[Group global] subscribed", { userId });
        } else if (status === "CHANNEL_ERROR") {
          console.error("[Group global] status CHANNEL_ERROR", { userId });
        } else if (status === "TIMED_OUT") {
          console.error("[Group global] status TIMED_OUT", { userId });
        } else if (status === "CLOSED") {
          console.log("[Group global] status CLOSED", { userId });
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, resumeGeneration]);

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
