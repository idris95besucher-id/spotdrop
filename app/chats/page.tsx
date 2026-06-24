"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import ChatInboxActionSheet, {
  type ChatInboxActionSheetTarget,
} from "@/components/ChatInboxActionSheet";
import { useChatNotifications } from "@/components/ChatNotificationsProvider";
import DmInboxListItem from "@/components/DmInboxListItem";
import { useI18n } from "@/components/I18nProvider";
import MessageRequestItem, { type MessageRequestItemData } from "@/components/MessageRequestItem";
import MobileSecondaryHeader from "@/components/MobileSecondaryHeader";
import RoomInboxListItem from "@/components/RoomInboxListItem";
import Shell from "@/components/Shell";
import { hideDmChat, setDmMuted } from "@/lib/chatInboxPreferences";
import { MOBILE_WIDTH_SAFE_CLASS } from "@/lib/mobileLayout";
import { localizeCountryName, localizeCityName } from "@/lib/i18n/localizeGeo";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import { getSafeAuthSession } from "@/lib/authSession";
import { formatUnreadBadge } from "@/lib/chatNotifications";
import {
  CHATS_INBOX_REFRESH_EVENT,
  CHATS_INBOX_SILENT_REFRESH_EVENT,
  loadChatsInbox,
  type InboxChatRow,
  type InboxItem,
} from "@/lib/chatsInbox";
import {
  CHATS_INBOX_DM_INCOMING_EVENT,
  CHATS_INBOX_OPTIMISTIC_READ_EVENT,
  DM_THREAD_READ_EVENT,
  patchInboxItemsForIncomingDm,
  patchInboxItemsOptimistically,
  type DmIncomingDetail,
  type DmThreadReadDetail,
  type OptimisticInboxReadDetail,
} from "@/lib/chatUnreadSync";
import { hideRoomFromMessages, setRoomMuted, type RoomInboxRow } from "@/lib/roomMemberships";
import { supabase } from "@/lib/supabaseClient";

type ChatsTab = "chats" | "requests";

type ActionTarget =
  | { kind: "dm"; chat: InboxChatRow }
  | { kind: "room"; room: RoomInboxRow };

export default function ChatsPage() {
  const { t, locale } = useI18n();
  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [loadingChats, setLoadingChats] = useState(false);
  const [activeTab, setActiveTab] = useState<ChatsTab>("chats");
  const [items, setItems] = useState<InboxItem[]>([]);
  const [requests, setRequests] = useState<MessageRequestItemData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [actionTarget, setActionTarget] = useState<ActionTarget | null>(null);
  const { unreadCount, refreshUnreadCount } = useChatNotifications();
  const silentReloadRef = useRef(false);

  const refresh = useCallback(() => {
    setReloadKey((current) => current + 1);
    void refreshUnreadCount();
  }, [refreshUnreadCount]);

  useEffect(() => {
    const { data: { subscription } = {} } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    void getSafeAuthSession().then((result) => {
      setSession(result.session);
      if (result.error) {
        setError(result.error);
      }
      setLoadingSession(false);
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const onInboxRefresh = () => refresh();

    const onSilentRefresh = () => {
      silentReloadRef.current = true;
      setReloadKey((current) => current + 1);
    };

    window.addEventListener(CHATS_INBOX_REFRESH_EVENT, onInboxRefresh);
    window.addEventListener(CHATS_INBOX_SILENT_REFRESH_EVENT, onSilentRefresh);

    return () => {
      window.removeEventListener(CHATS_INBOX_REFRESH_EVENT, onInboxRefresh);
      window.removeEventListener(CHATS_INBOX_SILENT_REFRESH_EVENT, onSilentRefresh);
    };
  }, [refresh]);

  useEffect(() => {
    const onOptimisticRead = (event: Event) => {
      const detail = (event as CustomEvent<OptimisticInboxReadDetail>).detail;

      if (!detail) {
        return;
      }

      setItems((current) => patchInboxItemsOptimistically(current, detail));
    };

    window.addEventListener(CHATS_INBOX_OPTIMISTIC_READ_EVENT, onOptimisticRead);

    return () => {
      window.removeEventListener(CHATS_INBOX_OPTIMISTIC_READ_EVENT, onOptimisticRead);
    };
  }, []);

  useEffect(() => {
    const onThreadRead = (event: Event) => {
      const detail = (event as CustomEvent<DmThreadReadDetail>).detail;

      if (!detail?.partnerId) {
        return;
      }

      setItems((current) =>
        patchInboxItemsOptimistically(current, { kind: "dm", partnerId: detail.partnerId })
      );
    };

    window.addEventListener(DM_THREAD_READ_EVENT, onThreadRead);

    return () => {
      window.removeEventListener(DM_THREAD_READ_EVENT, onThreadRead);
    };
  }, []);

  useEffect(() => {
    const onDmIncoming = (event: Event) => {
      const detail = (event as CustomEvent<DmIncomingDetail>).detail;

      if (!detail?.partnerId || !detail.message) {
        return;
      }

      setItems((current) => {
        const result = patchInboxItemsForIncomingDm(current, detail);

        if (!result.partnerFound) {
          silentReloadRef.current = true;
          setReloadKey((key) => key + 1);
          return current;
        }

        return result.items;
      });
    };

    window.addEventListener(CHATS_INBOX_DM_INCOMING_EVENT, onDmIncoming);

    return () => {
      window.removeEventListener(CHATS_INBOX_DM_INCOMING_EVENT, onDmIncoming);
    };
  }, []);

  useEffect(() => {
    const loadInbox = async () => {
      const userId = session?.user?.id;

      if (!userId) {
        setItems([]);
        setRequests([]);
        setLoadingChats(false);
        setError(null);
        return;
      }

      setLoadingChats(!silentReloadRef.current);
      setError(null);

      const result = await loadChatsInbox(userId);

      if (result.error) {
        setError(result.error);
        setItems([]);
        setRequests([]);
      } else {
        setItems(result.items);
        setRequests(result.requests);
      }

      silentReloadRef.current = false;
      setLoadingChats(false);
    };

    void loadInbox();
  }, [session?.user?.id, reloadKey]);

  useEffect(() => {
    const userId = session?.user?.id;

    if (!userId) {
      return;
    }

    const channel = supabase
      .channel(`chats_inbox_${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages" },
        (payload) => {
          const row = payload.new as { sender_id: string; recipient_id: string };

          if (row.sender_id === userId || row.recipient_id === userId) {
            refresh();
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "direct_messages" },
        (payload) => {
          const row = payload.new as { sender_id: string; recipient_id: string };

          if (row.sender_id === userId || row.recipient_id === userId) {
            refresh();
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "direct_conversations" },
        () => {
          refresh();
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "city_messages" },
        () => {
          refresh();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_memberships", filter: `user_id=eq.${userId}` },
        () => {
          refresh();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_inbox_preferences", filter: `user_id=eq.${userId}` },
        () => {
          refresh();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refresh, session?.user?.id]);

  const pendingCount = requests.length;
  const unreadBadge = formatUnreadBadge(unreadCount);
  const requestsBadge = formatUnreadBadge(pendingCount);
  const showAlerts = pendingCount > 0 || unreadCount > 0;
  const hasInboxItems = items.length > 0;

  const actionSheetTarget = useMemo((): ChatInboxActionSheetTarget | null => {
    if (!actionTarget) {
      return null;
    }

    if (actionTarget.kind === "dm") {
      return {
        kind: "dm",
        title: actionTarget.chat.username,
        isMuted: actionTarget.chat.isMuted,
      };
    }

    return {
      kind: "room",
      title: localizeCityName(locale, {
        slug: actionTarget.room.citySlug,
        name: actionTarget.room.cityName,
        countrySlug: actionTarget.room.countrySlug,
      }),
      isMuted: actionTarget.room.isMuted,
    };
  }, [actionTarget, locale]);

  const handleToggleMute = useCallback(async () => {
    if (!session?.user?.id || !actionTarget) {
      return;
    }

    if (actionTarget.kind === "dm") {
      await setDmMuted(session.user.id, actionTarget.chat.partnerId, !actionTarget.chat.isMuted);
    } else {
      await setRoomMuted(
        session.user.id,
        actionTarget.room.countrySlug,
        actionTarget.room.citySlug,
        !actionTarget.room.isMuted
      );
    }

    refresh();
  }, [actionTarget, refresh, session?.user?.id]);

  const handleRemove = useCallback(async () => {
    if (!session?.user?.id || !actionTarget) {
      return;
    }

    if (actionTarget.kind === "dm") {
      await hideDmChat(session.user.id, actionTarget.chat.partnerId);
    } else {
      await hideRoomFromMessages(
        session.user.id,
        actionTarget.room.countrySlug,
        actionTarget.room.citySlug
      );
    }

    refresh();
  }, [actionTarget, refresh, session?.user?.id]);

  return (
    <Shell showHeader={false} flushTop>
      <div className={`mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col ${MOBILE_WIDTH_SAFE_CLASS}`}>
        <MobileSecondaryHeader title={t("chats.title")} backHref="/feed" />

        {session?.user && showAlerts ? (
          <section className="flex flex-wrap gap-2 border-b border-white/[0.08] px-4 py-3">
            {pendingCount > 0 ? (
              <button
                type="button"
                onClick={() => setActiveTab("requests")}
                className="inline-flex items-center gap-2 rounded-full bg-[#050816] px-3 py-1.5 text-sm font-semibold text-white ring-1 ring-white/10"
              >
                {t("chats.requests")}
                <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
                  {requestsBadge}
                </span>
              </button>
            ) : null}
            {unreadCount > 0 ? (
              <button
                type="button"
                onClick={() => setActiveTab("chats")}
                className="inline-flex items-center gap-2 rounded-full bg-[#050816] px-3 py-1.5 text-sm font-semibold text-white ring-1 ring-white/10"
              >
                {t("chats.newMessages")}
                <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-[#050816]">
                  {unreadBadge}
                </span>
              </button>
            ) : null}
          </section>
        ) : null}

        {session?.user ? (
          <div className="grid grid-cols-2 border-b border-white/[0.08]">
            <button
              type="button"
              onClick={() => setActiveTab("chats")}
              className={`py-3 text-sm font-semibold transition ${
                activeTab === "chats"
                  ? "border-b-2 border-white text-white"
                  : "text-muted hover:text-white"
              }`}
            >
              {t("chats.title")}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("requests")}
              className={`relative py-3 text-sm font-semibold transition ${
                activeTab === "requests"
                  ? "border-b-2 border-white text-white"
                  : "text-muted hover:text-white"
              }`}
            >
              {t("chats.requests")}
              {pendingCount > 0 ? (
                <span className="ml-1.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                  {requestsBadge}
                </span>
              ) : null}
            </button>
          </div>
        ) : null}

        {loadingSession ? (
          <div className="px-4 py-12 text-center text-sm text-muted">{t("common.loading")}</div>
        ) : !session?.user ? (
          <div className="space-y-4 px-4 py-12 text-center">
            <p className="text-slate-300">{t("chats.signInPrompt")}</p>
            <Link
              href="/auth/login"
              className="inline-flex rounded-full bg-primary px-6 py-3 text-sm font-semibold text-[#050816]"
            >
              {t("auth.signIn")}
            </Link>
          </div>
        ) : loadingChats ? (
          <div className="px-4 py-12 text-center text-sm text-muted">{t("common.loading")}</div>
        ) : error ? (
          <div className="mx-4 my-6 rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-200">
            {localizeUserMessage(t, error) ?? error}
          </div>
        ) : activeTab === "requests" ? (
          requests.length === 0 ? (
            <div className="px-4 py-16 text-center">
              <p className="text-lg font-semibold text-white">{t("chats.noRequests")}</p>
              <p className="mt-2 text-sm text-muted">{t("chats.noRequestsBody")}</p>
            </div>
          ) : (
            <ul className="divide-y divide-white/[0.06] px-2 py-2 sm:px-3">
              {requests.map((request) => (
                <MessageRequestItem
                  key={request.conversationId}
                  request={request}
                  viewerUserId={session.user.id}
                  onResolved={refresh}
                />
              ))}
            </ul>
          )
        ) : !hasInboxItems ? (
          <div className="px-4 py-16 text-center">
            <p className="text-lg font-semibold text-white">{t("chats.noMessages")}</p>
            <p className="mt-2 text-sm text-muted">{t("chats.noMessagesBody")}</p>
            {pendingCount > 0 ? (
              <button
                type="button"
                onClick={() => setActiveTab("requests")}
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-[#050816]"
              >
                {t("chats.viewRequests", { count: requestsBadge ?? pendingCount })}
              </button>
            ) : (
              <Link
                href="/search"
                className="mt-4 inline-flex rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-[#050816]"
              >
                {t("chats.findPeople")}
              </Link>
            )}
          </div>
        ) : (
          <ul className="min-h-0 flex-1 divide-y divide-white/[0.06] overflow-y-auto select-none">
            {items.map((item) =>
              item.kind === "room" ? (
                <RoomInboxListItem
                  key={`room-${item.room.membershipId}`}
                  room={item.room}
                  onLongPress={(room) => setActionTarget({ kind: "room", room })}
                />
              ) : (
                <DmInboxListItem
                  key={item.chat.partnerId}
                  chat={item.chat}
                  onLongPress={(chat) => setActionTarget({ kind: "dm", chat })}
                />
              )
            )}
          </ul>
        )}
      </div>

      <ChatInboxActionSheet
        target={actionSheetTarget}
        onClose={() => setActionTarget(null)}
        onToggleMute={() => void handleToggleMute()}
        onRemove={() => void handleRemove()}
      />
    </Shell>
  );
}
