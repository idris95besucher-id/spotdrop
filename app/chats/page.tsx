"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { UserRound } from "lucide-react";
import { useChatNotifications } from "@/components/ChatNotificationsProvider";
import { useI18n } from "@/components/I18nProvider";
import MessageRequestItem, { type MessageRequestItemData } from "@/components/MessageRequestItem";
import MobileSecondaryHeader from "@/components/MobileSecondaryHeader";
import RoomInboxListItem from "@/components/RoomInboxListItem";
import Shell from "@/components/Shell";
import { MOBILE_WIDTH_SAFE_CLASS } from "@/lib/mobileLayout";
import { formatChatPreview } from "@/lib/i18n/chatPreview";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import { getSafeAuthSession } from "@/lib/authSession";
import { formatUnreadBadge } from "@/lib/chatNotifications";
import { CHATS_INBOX_REFRESH_EVENT, loadChatsInbox, type InboxChatRow, type InboxItem } from "@/lib/chatsInbox";
import { publicProfileUsername } from "@/lib/publicProfile";
import { hideRoomFromMessages, setRoomMuted, type RoomInboxRow } from "@/lib/roomMemberships";
import { supabase } from "@/lib/supabaseClient";

type ChatsTab = "chats" | "requests";

function formatChatTime(createdAt: string) {
  const date = new Date(createdAt);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isToday) {
    return new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(date);
  }

  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

function ChatListItem({ chat }: { chat: InboxChatRow }) {
  const { t } = useI18n();
  const hasUnread = chat.unreadCount > 0;
  const preview = chat.lastMessage
    ? formatChatPreview(chat.lastMessage, t)
    : t("chats.preview.noMessages");

  return (
    <li>
      <Link
        href={`/dm/${chat.partnerId}`}
        className={`flex items-center gap-3 px-4 py-3.5 transition sm:gap-4 sm:px-5 sm:py-4 ${
          hasUnread ? "bg-primary/[0.06]" : "hover:bg-white/[0.03]"
        }`}
      >
        <div className="relative shrink-0">
          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-white/[0.06] sm:h-16 sm:w-16">
            {chat.avatarUrl ? (
              <img src={chat.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <UserRound className="h-6 w-6 text-muted" strokeWidth={1.5} aria-hidden />
            )}
          </div>
          {hasUnread ? (
            <span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2 border-[#0B1026] bg-primary" />
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className={`truncate text-[15px] sm:text-base ${hasUnread ? "font-bold text-white" : "font-semibold text-white"}`}>
              {publicProfileUsername(chat.username)}
            </p>
            <time className={`shrink-0 text-xs ${hasUnread ? "font-semibold text-primary" : "text-muted"}`}>
              {formatChatTime(chat.lastAt)}
            </time>
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-2">
            <p className={`truncate text-sm ${hasUnread ? "font-medium text-slate-200" : "text-muted"}`}>
              {preview}
            </p>
            {chat.unreadBadge ? (
              <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-[#050816]">
                {chat.unreadBadge}
              </span>
            ) : null}
          </div>
        </div>
      </Link>
    </li>
  );
}

export default function ChatsPage() {
  const { t } = useI18n();
  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [loadingChats, setLoadingChats] = useState(false);
  const [activeTab, setActiveTab] = useState<ChatsTab>("chats");
  const [items, setItems] = useState<InboxItem[]>([]);
  const [requests, setRequests] = useState<MessageRequestItemData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const { unreadCount, refreshUnreadCount } = useChatNotifications();

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

    window.addEventListener(CHATS_INBOX_REFRESH_EVENT, onInboxRefresh);

    return () => {
      window.removeEventListener(CHATS_INBOX_REFRESH_EVENT, onInboxRefresh);
    };
  }, [refresh]);

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

      setLoadingChats(true);
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

  const handleMuteRoom = useCallback(
    async (room: RoomInboxRow, muted: boolean) => {
      if (!session?.user?.id) {
        return;
      }

      await setRoomMuted(session.user.id, room.countrySlug, room.citySlug, muted);
      refresh();
    },
    [refresh, session?.user?.id]
  );

  const handleHideRoom = useCallback(
    async (room: RoomInboxRow) => {
      if (!session?.user?.id) {
        return;
      }

      await hideRoomFromMessages(session.user.id, room.countrySlug, room.citySlug);
      refresh();
    },
    [refresh, session?.user?.id]
  );

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
          <ul className="min-h-0 flex-1 divide-y divide-white/[0.06] overflow-y-auto">
            {items.map((item) =>
              item.kind === "room" ? (
                <RoomInboxListItem
                  key={`room-${item.room.membershipId}`}
                  room={item.room}
                  onMute={handleMuteRoom}
                  onHide={handleHideRoom}
                />
              ) : (
                <ChatListItem key={item.chat.partnerId} chat={item.chat} />
              )
            )}
          </ul>
        )}
      </div>
    </Shell>
  );
}
