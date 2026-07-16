"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { Search, SquarePen } from "lucide-react";
import ChatInboxActionSheet, {
  type ChatInboxActionSheetTarget,
} from "@/components/ChatInboxActionSheet";
import { useChatNotifications } from "@/components/ChatNotificationsProvider";
import DmInboxListItem from "@/components/DmInboxListItem";
import GroupInboxListItem from "@/components/GroupInboxListItem";
import { useI18n } from "@/components/I18nProvider";
import type { MessageRequestItemData } from "@/components/MessageRequestItem";
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
  filterInboxItems,
  getCachedChatsInbox,
  loadChatsInbox,
  type InboxChatRow,
  type InboxItem,
} from "@/lib/chatsInbox";
import { perfMark, perfSince } from "@/lib/perfLog";
import {
  CHATS_INBOX_DM_INCOMING_EVENT,
  CHATS_INBOX_OPTIMISTIC_READ_EVENT,
  CHATS_INBOX_ROOM_INCOMING_EVENT,
  DM_THREAD_READ_EVENT,
  patchInboxItemsForIncomingDm,
  patchInboxItemsForIncomingRoom,
  patchInboxItemsOptimistically,
  type DmIncomingDetail,
  type DmThreadReadDetail,
  type OptimisticInboxReadDetail,
  type RoomIncomingDetail,
} from "@/lib/chatUnreadSync";
import { deleteGroupChat, leaveGroupChat, type GroupChatSummary } from "@/lib/groupChats";
import { hideRoomFromMessages, setRoomMuted, type RoomInboxRow } from "@/lib/roomMemberships";
import { PRESENCE_HEARTBEAT_MS } from "@/lib/userPresence";
import { supabase } from "@/lib/supabaseClient";

type ActionTarget =
  | { kind: "dm"; chat: InboxChatRow }
  | { kind: "room"; room: RoomInboxRow }
  | { kind: "group"; group: GroupChatSummary };

function ChatsPageFallback() {
  const { t } = useI18n();

  return (
    <Shell showHeader={false} immersive>
      <div className="flex h-full items-center justify-center text-sm text-slate-400">{t("common.loading")}</div>
    </Shell>
  );
}

function ChatsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, locale } = useI18n();
  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [loadingChats, setLoadingChats] = useState(false);
  const [items, setItems] = useState<InboxItem[]>([]);
  const [requests, setRequests] = useState<MessageRequestItemData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [actionTarget, setActionTarget] = useState<ActionTarget | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const { refreshUnreadCount } = useChatNotifications();
  const silentReloadRef = useRef(false);
  const refreshDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(() => {
    setReloadKey((current) => current + 1);
    void refreshUnreadCount();
  }, [refreshUnreadCount]);

  const debouncedRefresh = useCallback(() => {
    if (refreshDebounceRef.current) {
      clearTimeout(refreshDebounceRef.current);
    }

    refreshDebounceRef.current = setTimeout(() => {
      refreshDebounceRef.current = null;
      silentReloadRef.current = true;
      setReloadKey((current) => current + 1);
    }, 400);
  }, []);

  useEffect(() => {
    return () => {
      if (refreshDebounceRef.current) {
        clearTimeout(refreshDebounceRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (searchParams.get("tab") === "friends") {
      router.replace("/friends");
    }
  }, [router, searchParams]);

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
    if (!session?.user) {
      return;
    }

    const interval = setInterval(() => {
      if (document.visibilityState !== "visible") {
        return;
      }

      silentReloadRef.current = true;
      setReloadKey((current) => current + 1);
    }, PRESENCE_HEARTBEAT_MS);

    return () => {
      clearInterval(interval);
    };
  }, [session?.user]);

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
    const onRoomIncoming = (event: Event) => {
      const detail = (event as CustomEvent<RoomIncomingDetail>).detail;

      if (!detail?.countrySlug || !detail?.citySlug || !detail.message) {
        return;
      }

      setItems((current) => {
        const result = patchInboxItemsForIncomingRoom(current, detail);

        if (!result.roomFound) {
          silentReloadRef.current = true;
          setReloadKey((key) => key + 1);
          return current;
        }

        return result.items;
      });
    };

    window.addEventListener(CHATS_INBOX_ROOM_INCOMING_EVENT, onRoomIncoming);

    return () => {
      window.removeEventListener(CHATS_INBOX_ROOM_INCOMING_EVENT, onRoomIncoming);
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

      const mountAt = perfMark("chats-inbox");
      const cached = getCachedChatsInbox(userId);

      if (cached && !silentReloadRef.current) {
        setItems(cached.items);
        setRequests(cached.requests);
        setLoadingChats(false);
        perfSince(mountAt, "first data received", { source: "cache" });
      } else {
        setLoadingChats(!silentReloadRef.current);
      }

      setError(null);

      const result = await loadChatsInbox(userId);

      if (result.error) {
        setError(result.error);
        setItems([]);
        setRequests([]);
      } else {
        setItems(result.items);
        setRequests(result.requests);
        perfSince(mountAt, "first data received", { source: "network" });
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
            debouncedRefresh();
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "direct_messages" },
        (payload) => {
          const row = payload.new as { sender_id: string; recipient_id: string };

          if (row.sender_id === userId || row.recipient_id === userId) {
            debouncedRefresh();
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "direct_conversations" },
        () => {
          debouncedRefresh();
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "city_messages" },
        () => {
          debouncedRefresh();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_memberships", filter: `user_id=eq.${userId}` },
        () => {
          debouncedRefresh();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_inbox_preferences", filter: `user_id=eq.${userId}` },
        () => {
          debouncedRefresh();
        }
      )
      .on(
        // RLS restricts these to the caller's own groups, so no extra filter is needed.
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "group_chat_messages" },
        () => {
          debouncedRefresh();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "group_chats" },
        () => {
          debouncedRefresh();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "group_chat_members", filter: `user_id=eq.${userId}` },
        () => {
          debouncedRefresh();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [debouncedRefresh, session?.user?.id]);

  const pendingCount = requests.length;
  const requestsBadge = formatUnreadBadge(pendingCount);
  const hasInboxItems = items.length > 0;

  const filteredItems = useMemo(() => {
    return filterInboxItems(items, searchQuery, {
      localizeCityName: (room) =>
        localizeCityName(locale, {
          slug: room.citySlug,
          name: room.cityName,
          countrySlug: room.countrySlug,
        }),
    });
  }, [items, locale, searchQuery]);

  const isSearching = searchQuery.trim().length > 0;

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

    if (actionTarget.kind === "group") {
      return {
        kind: "group",
        title: actionTarget.group.name,
        isOwner: actionTarget.group.role === "owner",
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
    } else if (actionTarget.kind === "room") {
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

    if (actionTarget.kind === "group") {
      if (actionTarget.group.role === "owner") {
        await deleteGroupChat(actionTarget.group.id);
      } else {
        await leaveGroupChat(actionTarget.group.id);
      }

      refresh();
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
    <Shell showHeader={false} immersive>
      <div className={`mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col ${MOBILE_WIDTH_SAFE_CLASS}`}>
        {session?.user ? (
          <div className="shrink-0 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <div className="flex items-center gap-2">
              <h1 className="min-w-0 flex-1 truncate text-xl font-bold text-white">{t("nav.myChats")}</h1>
              <Link
                href="/chats/new"
                aria-label={t("chats.newMessage")}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition hover:bg-white/10 active:scale-95"
              >
                <SquarePen className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              </Link>
            </div>
            <label className="relative mt-3 block">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                aria-hidden
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={t("chats.searchPlaceholder")}
                className="w-full rounded-2xl border border-white/10 bg-[#0d1322] py-2.5 pl-10 pr-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-primary/45"
              />
            </label>
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
        ) : !hasInboxItems ? (
          <div className="px-4 py-16 text-center">
            <p className="text-lg font-semibold text-white">{t("chats.noMessages")}</p>
            <p className="mt-2 text-sm text-muted">{t("chats.noMessagesBody")}</p>
            {pendingCount > 0 ? (
              <Link
                href="/chats/requests"
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-[#050816]"
              >
                {t("chats.viewRequests", { count: requestsBadge ?? pendingCount })}
              </Link>
            ) : (
              <Link
                href="/search"
                className="mt-4 inline-flex rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-[#050816]"
              >
                {t("chats.findPeople")}
              </Link>
            )}
          </div>
        ) : isSearching && filteredItems.length === 0 ? (
          <div className="px-4 py-16 text-center text-sm text-muted">{t("chats.noResultsFound")}</div>
        ) : (
          <ul className="min-h-0 flex-1 divide-y divide-white/[0.06] overflow-y-auto px-2 py-1 select-none sm:px-3">
            {filteredItems.map((item) =>
              item.kind === "room" ? (
                <RoomInboxListItem
                  key={`room-${item.room.membershipId}`}
                  room={item.room}
                  onLongPress={(room) => setActionTarget({ kind: "room", room })}
                />
              ) : item.kind === "group" ? (
                <GroupInboxListItem
                  key={`group-${item.group.id}`}
                  group={item.group}
                  onLongPress={(group) => setActionTarget({ kind: "group", group })}
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

export default function ChatsPage() {
  return (
    <Suspense fallback={<ChatsPageFallback />}>
      <ChatsPageContent />
    </Suspense>
  );
}
