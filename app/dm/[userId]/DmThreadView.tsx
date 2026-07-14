"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import ChatDateSeparator from "@/components/ChatDateSeparator";
import DmChatThreadShell from "@/components/DmChatThreadShell";
import DmThreadHeader from "@/components/DmThreadHeader";
import DmWallpaper from "@/components/DmWallpaper";
import DirectMessageSpotShareCard from "@/components/DirectMessageSpotShareCard";
import DirectMessageSpotCard from "@/components/DirectMessageSpotCard";
import DirectMessageLocationCard from "@/components/DirectMessageLocationCard";
import DmMessageStatus from "@/components/DmMessageStatus";
import { useAuthSession } from "@/components/AuthSessionProvider";
import { useChatNotifications } from "@/components/ChatNotificationsProvider";
import ShareSpotToUserButton from "@/components/ShareSpotToUserButton";
import Shell from "@/components/Shell";
import { useI18n } from "@/components/I18nProvider";
import { localizeCaughtError, localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import { markDirectMessagesReadInThread } from "@/lib/chatNotifications";
import { markDmThreadOpened } from "@/lib/chatUnreadSync";
import { shouldShowChatDateSeparator } from "@/lib/chatDates";
import {
  acceptConversationRequest,
  canSendDirectMessage,
  declineConversationRequest,
  ensureConversationForOutgoingMessage,
  getDirectConversation,
  isIncomingRequest,
  isSpotDirectMessage,
  isSpotShareDirectMessage,
  loadDirectMessagesForThread,
  normalizeDirectMessageRow,
  resolveDmThreadPartnerId,
  spotShareMessageCardType,
  touchConversationUpdatedAt,
  type DirectConversation,
  type DirectMessageType,
} from "@/lib/directConversations";
import { startDmThreadLiveSync, type DmAppendSource } from "@/lib/dmThreadSync";
import { CHATS_INBOX_REFRESH_EVENT } from "@/lib/chatsInbox";
import { getCachedDmThreadMessages, setCachedDmThreadMessages } from "@/lib/dmThreadCache";
import { perfMark, perfSince } from "@/lib/perfLog";
import { resolveDmRoutePartnerId } from "@/lib/chatThreadRoutes";
import { startDmTypingSync } from "@/lib/dmTypingIndicator";
import { useDmPartnerPresence } from "@/lib/useDmPartnerPresence";
import { useCanSeeOnlineStatus } from "@/lib/useCanSeeOnlineStatus";
import { fetchPartnerProfilePresenceDirect, resolveProfileIsOnline } from "@/lib/userPresence";
import { checkCanMessageUser, type MessagePrivacyBlockReasonKey } from "@/lib/messagePrivacy";
import { loadPrivateSpotSharesByIds, type PrivateSpotShare } from "@/lib/privateSpotShares";
import { useDmThreadScroll } from "@/lib/useDmThreadScroll";
import { useDmComposerKeyboardInset, dmComposerBottomPadding } from "@/lib/useDmComposerInsets";
import { CHAT_MESSAGES_FLEX_PADDING } from "@/lib/keyboardSystem";
import { isGuideAccountUsername, publicProfileUsername } from "@/lib/publicProfile";
import { supabase } from "@/lib/supabaseClient";
import { isLocationCardShareMessage } from "@/lib/locationCardShareMessage";

type PartnerProfile = {
  id: string;
  username: string;
  name?: string | null;
  profileUsername?: string;
  avatar_url?: string | null;
  isOnline?: boolean;
  lastSeenAt?: string | null;
};

type DirectMessage = {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string | null;
  message_type: DirectMessageType;
  spot_share_id: string | null;
  post_id: string | null;
  created_at: string;
  delivered_at: string | null;
  read_at: string | null;
};

type DmThreadViewProps = {
  partnerIdOverride?: string;
};

console.log("[DM SCREEN] app/dm/[userId]/DmThreadView.tsx module loaded");

export default function DirectMessagePage({ partnerIdOverride }: DmThreadViewProps = {}) {
  const { t } = useI18n();
  const params = useParams<{ userId?: string }>();
  const routeUserId = resolveDmRoutePartnerId({
    partnerIdOverride,
    paramsUserId: params.userId,
  });

  const { session } = useAuthSession();
  const [partner, setPartner] = useState<PartnerProfile | null>(null);
  const [partnerId, setPartnerId] = useState("");
  const [partnerIdReady, setPartnerIdReady] = useState(false);
  const [conversation, setConversation] = useState<DirectConversation | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [resolvingRequest, setResolvingRequest] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [messagePrivacyBlockKey, setMessagePrivacyBlockKey] = useState<MessagePrivacyBlockReasonKey | null>(null);
  const [shareById, setShareById] = useState<Map<string, PrivateSpotShare>>(new Map());
  const [initialBottomReady, setInitialBottomReady] = useState(false);
  const [currentUserUsername, setCurrentUserUsername] = useState("");
  const [partnerTypingName, setPartnerTypingName] = useState<string | null>(null);

  const {
    messagesContainerRef,
    messagesEndRef,
    runDmOpenBottomSequence,
    scrollOnMessageAppended,
    scrollOnSend,
    scrollOnKeyboard,
  } = useDmThreadScroll();
  const composerTextareaRef = useRef<HTMLTextAreaElement>(null);
  const keyboardScrollTimeoutsRef = useRef<number[]>([]);
  const { refreshUnreadCount } = useChatNotifications();
  const markedReadForPartnerRef = useRef<string | null>(null);
  const seenMessageIdsRef = useRef(new Set<string>());
  const messagesRef = useRef<DirectMessage[]>([]);
  messagesRef.current = messages;
  const currentUserId = session?.user?.id ?? null;
  const threadPartnerId =
    partnerIdReady && partnerId && currentUserId && partnerId !== currentUserId ? partnerId : null;
  const isSelfConversation = Boolean(
    currentUserId && partnerId && currentUserId === partnerId
  );
  const canSeePartnerPresence = useCanSeeOnlineStatus(currentUserId, threadPartnerId);
  const partnerPresence = useDmPartnerPresence(
    canSeePartnerPresence ? threadPartnerId : null,
    partner?.profileUsername ?? null
  );

  useEffect(() => {
    let cancelled = false;

    setPartnerIdReady(false);
    setPartner(null);
    setPartnerId("");

    void (async () => {
      const result = await resolveDmThreadPartnerId(currentUserId, routeUserId);

      if (cancelled) {
        return;
      }

      setPartnerId(result.partnerId ?? "");
      setPartnerIdReady(true);

      if (result.error) {
        setError(result.error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentUserId, routeUserId]);
  const showIncomingRequestBanner = Boolean(
    conversation && currentUserId && isIncomingRequest(conversation, currentUserId)
  );
  const sendPermission = canSendDirectMessage(conversation, currentUserId ?? "");
  const canSendMessages = sendPermission.allowed && !messagePrivacyBlockKey;
  const openBottomSequenceStartedRef = useRef<string | null>(null);
  const typingSyncRef = useRef<ReturnType<typeof startDmTypingSync> | null>(null);

  useLayoutEffect(() => {
    setInitialBottomReady(false);
    setMessages([]);
    setLoading(true);
    openBottomSequenceStartedRef.current = null;

    const container = messagesContainerRef.current;

    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [partnerId, messagesContainerRef]);

  useLayoutEffect(() => {
    if (loading) {
      return;
    }

    const skipOpenBottom =
      messages.length === 0 ||
      Boolean(error) ||
      isSelfConversation ||
      !currentUserId;

    if (skipOpenBottom) {
      setInitialBottomReady(true);
      return;
    }

    const sequenceKey = `${partnerId}:${messages.length}`;

    if (openBottomSequenceStartedRef.current === sequenceKey) {
      return;
    }

    openBottomSequenceStartedRef.current = sequenceKey;

    const stopSequence = runDmOpenBottomSequence(() => {
      setInitialBottomReady(true);
    });

    return stopSequence;
  }, [
    currentUserId,
    error,
    isSelfConversation,
    loading,
    messages.length,
    partnerId,
    runDmOpenBottomSequence,
  ]);

  useEffect(() => {
    if (!currentUserId) {
      setCurrentUserUsername("");
      return;
    }

    let cancelled = false;

    void supabase
      .from("profiles")
      .select("username")
      .eq("id", currentUserId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) {
          return;
        }

        if (error) {
          console.warn("[Typing] username load failed", error.message);
          setCurrentUserUsername("");
          return;
        }

        setCurrentUserUsername(publicProfileUsername(data?.username ?? ""));
      });

    return () => {
      cancelled = true;
    };
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId || !partnerId || isSelfConversation) {
      setPartnerTypingName(null);
      return;
    }

    const sync = startDmTypingSync({
      currentUserId,
      partnerId,
      username: currentUserUsername || publicProfileUsername(t("common.user")),
      onPartnerTyping: (name) => {
        setPartnerTypingName(name);
      },
      onPartnerStopped: () => {
        setPartnerTypingName(null);
      },
    });

    typingSyncRef.current = sync;

    return () => {
      typingSyncRef.current = null;
      sync.stop();
      setPartnerTypingName(null);
    };
  }, [currentUserId, currentUserUsername, isSelfConversation, partnerId, t]);

  const handleDraftChange = useCallback(
    (value: string) => {
      setDraft(value);

      if (value.trim() && canSendMessages) {
        typingSyncRef.current?.signalTyping();
      }
    },
    [canSendMessages]
  );

  const scheduleComposerScrollBottom = useCallback(() => {
    keyboardScrollTimeoutsRef.current.forEach((id) => window.clearTimeout(id));
    keyboardScrollTimeoutsRef.current = [100, 300].map((delayMs) =>
      window.setTimeout(() => {
        scrollOnKeyboard();
      }, delayMs)
    );
  }, [scrollOnKeyboard]);

  const { isKeyboardOpen: isDmKeyboardOpen, composerStyle } = useDmComposerKeyboardInset();

  const handleComposerFocus = useCallback(() => {
    scheduleComposerScrollBottom();
  }, [scheduleComposerScrollBottom]);

  useEffect(() => {
    if (!isDmKeyboardOpen) {
      return;
    }

    scheduleComposerScrollBottom();
  }, [isDmKeyboardOpen, scheduleComposerScrollBottom]);

  useEffect(() => {
    return () => {
      keyboardScrollTimeoutsRef.current.forEach((id) => window.clearTimeout(id));
      keyboardScrollTimeoutsRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (!currentUserId || !partnerId || isSelfConversation) {
      return;
    }

    if (markedReadForPartnerRef.current === partnerId) {
      return;
    }

    markedReadForPartnerRef.current = partnerId;

    void markDmThreadOpened(currentUserId, partnerId, refreshUnreadCount);
  }, [currentUserId, isSelfConversation, partnerId, refreshUnreadCount]);

  useEffect(() => {
    markedReadForPartnerRef.current = null;
    seenMessageIdsRef.current.clear();
  }, [partnerId]);

  const reloadConversation = useCallback(async () => {
    if (!currentUserId || !partnerId) {
      return;
    }

    const result = await getDirectConversation(currentUserId, partnerId);
    setConversation(result.conversation);
  }, [currentUserId, partnerId]);

  useEffect(() => {
    const mountAt = perfMark("dm-thread");

    const loadConversation = async () => {
      if (!partnerIdReady) {
        return;
      }

      if (!partnerId) {
        setLoading(false);
        setError(t("dm.error.invalidConversation"));
        return;
      }

      setError(null);
      setSendError(null);
      setMessagePrivacyBlockKey(null);

      if (currentUserId && partnerId === currentUserId) {
        setError(t("dm.error.invalidConversation"));
        setPartner(null);
        setMessages([]);
        setConversation(null);
        setLoading(false);
        return;
      }

      const cachedMessages =
        currentUserId && partnerId ? getCachedDmThreadMessages(currentUserId, partnerId) : null;

      if (cachedMessages?.length) {
        setMessages(cachedMessages as DirectMessage[]);
        seenMessageIdsRef.current = new Set(cachedMessages.map((message) => message.id));
        setLoading(false);
        perfSince(mountAt, "first data received", { partnerId, source: "cache" });
      } else {
        setLoading(true);
      }

      const partnerQuery = supabase
        .from("profiles")
        .select("id, username, avatar_url, is_online, last_seen_at")
        .eq("id", partnerId)
        .maybeSingle();

      if (!currentUserId) {
        const { data: partnerRow, error: partnerError } = await partnerQuery;

        if (partnerError) {
          setError(localizeCaughtError(t, partnerError, "dm.error.loadConversation"));
          setPartner(null);
          setMessages([]);
          setConversation(null);
          setLoading(false);
          return;
        }

        if (!partnerRow || isGuideAccountUsername(partnerRow.username)) {
          setError(t("profile.userNotFound"));
          setPartner(null);
          setMessages([]);
          setConversation(null);
          setLoading(false);
          return;
        }

        const partnerLastSeenAt = (partnerRow.last_seen_at as string | null) ?? null;
        setPartner({
          id: partnerRow.id,
          username: publicProfileUsername(partnerRow.username),
          profileUsername: partnerRow.username,
          avatar_url: partnerRow.avatar_url,
          isOnline: resolveProfileIsOnline(partnerRow.is_online, partnerLastSeenAt, {
            screen: "dm-thread-load",
            userId: partnerRow.id,
            username: partnerRow.username,
          }),
          lastSeenAt: partnerLastSeenAt,
        } as PartnerProfile);
        setMessages([]);
        setConversation(null);
        setLoading(false);
        return;
      }

      const [
        { data: partnerRow, error: partnerError },
        messagePermission,
        conversationResult,
        messagesResult,
      ] = await Promise.all([
        partnerQuery,
        checkCanMessageUser(currentUserId, partnerId),
        getDirectConversation(currentUserId, partnerId),
        loadDirectMessagesForThread(currentUserId, partnerId),
      ]);

      if (partnerError) {
        console.error("Failed to load DM partner:", JSON.stringify(partnerError, null, 2));
        setError(localizeCaughtError(t, partnerError, "dm.error.loadConversation"));
        setPartner(null);
        setMessages([]);
        setConversation(null);
        setLoading(false);
        return;
      }

      if (!partnerRow || isGuideAccountUsername(partnerRow.username)) {
        setError(t("profile.userNotFound"));
        setPartner(null);
        setMessages([]);
        setConversation(null);
        setLoading(false);
        return;
      }

      if (partnerRow.id === currentUserId) {
        const corrected = await resolveDmThreadPartnerId(currentUserId, routeUserId);

        if (corrected.partnerId && corrected.partnerId !== currentUserId) {
          setPartnerId(corrected.partnerId);
          return;
        }

        setError(t("dm.error.invalidConversation"));
        setPartner(null);
        setMessages([]);
        setConversation(null);
        setLoading(false);
        return;
      }

      const partnerLastSeenAt = (partnerRow.last_seen_at as string | null) ?? null;
      const partnerIsOnline = resolveProfileIsOnline(partnerRow.is_online, partnerLastSeenAt, {
        screen: "dm-thread-load",
        userId: partnerRow.id,
        username: partnerRow.username,
      });

      setPartner({
        id: partnerRow.id,
        username: publicProfileUsername(partnerRow.username),
        profileUsername: partnerRow.username,
        avatar_url: partnerRow.avatar_url,
        isOnline: partnerIsOnline,
        lastSeenAt: partnerLastSeenAt,
      } as PartnerProfile);

      void fetchPartnerProfilePresenceDirect(partnerRow.id, partnerRow.username);

      if (!messagePermission.allowed) {
        setMessagePrivacyBlockKey(messagePermission.reasonKey);
      }

      if (conversationResult.error && !conversationResult.conversation) {
        setError(conversationResult.error);
      }

      setConversation(conversationResult.conversation);

      if (messagesResult.error) {
        console.error("Failed to load direct messages:", messagesResult.error);
        if (!cachedMessages?.length) {
          setError(messagesResult.error || t("dm.error.loadMessages"));
          setMessages([]);
          setShareById(new Map());
        }
      } else {
        setMessages(messagesResult.messages as DirectMessage[]);
        seenMessageIdsRef.current = new Set(messagesResult.messages.map((message) => message.id));
        setCachedDmThreadMessages(currentUserId, partnerId, messagesResult.messages);
        perfSince(mountAt, "first data received", {
          partnerId,
          source: cachedMessages?.length ? "network-refresh" : "network",
        });

        const shareIds = [
          ...new Set(
            messagesResult.messages
              .map((message) => message.spot_share_id)
              .filter((id): id is string => Boolean(id))
          ),
        ];

        const sharesResult = await loadPrivateSpotSharesByIds(shareIds);
        setShareById(sharesResult.shares);
      }

      setLoading(false);
      perfSince(mountAt, "interaction ready", { partnerId });
    };

    void loadConversation();
  }, [currentUserId, partnerId, partnerIdReady, routeUserId, t]);

  const refreshUnreadCountRef = useRef(refreshUnreadCount);
  refreshUnreadCountRef.current = refreshUnreadCount;

  const scrollOnMessageAppendedRef = useRef(scrollOnMessageAppended);
  scrollOnMessageAppendedRef.current = scrollOnMessageAppended;

  const reloadConversationRef = useRef(reloadConversation);
  reloadConversationRef.current = reloadConversation;

  useEffect(() => {
    if (!currentUserId || !partnerId || isSelfConversation) {
      return;
    }

    const appendThreadMessage = (normalized: DirectMessage, source: DmAppendSource) => {
      console.log("[DM append] added message id", normalized.id, { source });

      setMessages((current) => {
        if (current.some((message) => message.id === normalized.id)) {
          return current;
        }

        return [...current, normalized].sort(
          (left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
        );
      });

      scrollOnMessageAppendedRef.current();

      if (normalized.recipient_id === currentUserId && normalized.sender_id === partnerId) {
        void markDirectMessagesReadInThread(currentUserId, partnerId).then(() => {
          void refreshUnreadCountRef.current();
        });
      }

      window.dispatchEvent(new Event(CHATS_INBOX_REFRESH_EVENT));

      if (normalized.spot_share_id) {
        void loadPrivateSpotSharesByIds([normalized.spot_share_id]).then((result) => {
          const share = result.shares.get(normalized.spot_share_id!);

          if (share) {
            setShareById((current) => new Map(current).set(share.id, share));
          }
        });
      }
    };

    const stopSync = startDmThreadLiveSync(currentUserId, partnerId, {
      onAppendMessage: (message, source) => {
        appendThreadMessage(message as DirectMessage, source);
      },
      onUpdateMessage: (updated) => {
        setMessages((current) =>
          current.map((message) =>
            message.id === updated.id
              ? {
                  ...message,
                  delivered_at: updated.delivered_at,
                  read_at: updated.read_at,
                }
              : message
          )
        );
      },
      getLatestCreatedAt: () => {
        const list = messagesRef.current;

        if (list.length === 0) {
          return null;
        }

        return list[list.length - 1]?.created_at ?? null;
      },
      hasMessageId: (messageId) =>
        seenMessageIdsRef.current.has(messageId) ||
        messagesRef.current.some((message) => message.id === messageId),
      rememberMessageId: (messageId) => {
        seenMessageIdsRef.current.add(messageId);
      },
    });

    const spotShareChannel = supabase
      .channel(`dm_thread_shares_${currentUserId}_${partnerId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "private_spot_shares",
        },
        (payload) => {
          const updated = payload.new as PrivateSpotShare;
          const inThread =
            (updated.sender_id === currentUserId && updated.recipient_id === partnerId) ||
            (updated.sender_id === partnerId && updated.recipient_id === currentUserId);

          if (!inThread) {
            return;
          }

          void loadPrivateSpotSharesByIds([updated.id]).then((result) => {
            const share = result.shares.get(updated.id);

            if (share) {
              setShareById((current) => new Map(current).set(share.id, share));
            }
          });
        }
      )
      .subscribe();

    const conversationChannel = supabase
      .channel(`dm_thread_conv_${currentUserId}_${partnerId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "direct_conversations",
        },
        () => {
          void reloadConversationRef.current();
        }
      )
      .subscribe();

    return () => {
      stopSync();
      void supabase.removeChannel(spotShareChannel);
      void supabase.removeChannel(conversationChannel);
    };
  }, [currentUserId, isSelfConversation, partnerId]);

  const handleAcceptRequest = async () => {
    if (!conversation || !currentUserId) {
      return;
    }

    setResolvingRequest(true);
    setSendError(null);

    const result = await acceptConversationRequest(conversation.id, currentUserId);

    if (result.error) {
      setSendError(result.error);
      setResolvingRequest(false);
      return;
    }

    await reloadConversation();
    setResolvingRequest(false);
  };

  const handleDeclineRequest = async () => {
    if (!conversation || !currentUserId) {
      return;
    }

    setResolvingRequest(true);
    setSendError(null);

    const result = await declineConversationRequest(conversation.id, currentUserId);

    if (result.error) {
      setSendError(result.error);
      setResolvingRequest(false);
      return;
    }

    await reloadConversation();
    setResolvingRequest(false);
  };

  const handleSend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSendError(null);

    if (sending) {
      return;
    }

    const trimmed = draft.trim();

    if (!trimmed || !currentUserId || !partnerId) {
      return;
    }

    if (currentUserId === partnerId) {
      setSendError(t("dm.cannotMessageSelf"));
      return;
    }

    setSending(true);

    const ensured = await ensureConversationForOutgoingMessage(currentUserId, partnerId);

    if (ensured.error && !ensured.conversation) {
      setSendError(localizeCaughtError(t, ensured.error, "dm.error.sendMessage"));
      setSending(false);
      return;
    }

    if (ensured.sendBlockedReason) {
      setSendError(localizeCaughtError(t, ensured.sendBlockedReason, "dm.error.sendMessage"));
      setSending(false);
      return;
    }

    setConversation(ensured.conversation);

    const createdAt = new Date().toISOString();

    const { data: inserted, error: insertError } = await supabase
      .from("direct_messages")
      .insert({
        sender_id: currentUserId,
        recipient_id: partnerId,
        message_type: "text",
        body: trimmed,
        created_at: createdAt,
      })
      .select("id, sender_id, recipient_id, body, message_type, spot_share_id, post_id, created_at, delivered_at, read_at")
      .single();

    setSending(false);

    if (insertError) {
      console.error("Failed to send direct message:", insertError.code ?? "unknown");
      setSendError(localizeCaughtError(t, insertError, "dm.error.sendMessage"));
      return;
    }

    if (inserted) {
      seenMessageIdsRef.current.add(inserted.id);
      setMessages((current) => {
        if (current.some((message) => message.id === inserted.id)) {
          return current;
        }

        return [...current, normalizeDirectMessageRow(inserted) as DirectMessage];
      });
    }

    setDraft("");
    setPartnerTypingName(null);
    void touchConversationUpdatedAt(currentUserId, partnerId);
    window.dispatchEvent(new Event(CHATS_INBOX_REFRESH_EVENT));
    scrollOnSend();
  };

  const reloadSharesForMessages = useCallback(async (messageList: DirectMessage[]) => {
    const shareIds = [
      ...new Set(
        messageList.map((message) => message.spot_share_id).filter((id): id is string => Boolean(id))
      ),
    ];

    const sharesResult = await loadPrivateSpotSharesByIds(shareIds);
    setShareById(sharesResult.shares);
  }, []);

  const handleSpotShareSent = useCallback(async () => {
    if (!currentUserId || !partnerId) {
      return;
    }

    const { messages: loadedMessages } = await loadDirectMessagesForThread(currentUserId, partnerId);

    setMessages(loadedMessages as DirectMessage[]);
    await reloadSharesForMessages(loadedMessages);
    await markDirectMessagesReadInThread(currentUserId, partnerId);
    void refreshUnreadCount();
    scrollOnSend();
  }, [currentUserId, partnerId, refreshUnreadCount, reloadSharesForMessages, scrollOnSend]);

  const isSendDisabled =
    sending || !draft.trim() || !currentUserId || isSelfConversation || !canSendMessages;

  const composerPlaceholder = isSelfConversation
    ? t("dm.placeholder.self")
    : messagePrivacyBlockKey
      ? t(messagePrivacyBlockKey)
    : conversation?.status === "declined"
      ? t("dm.placeholder.declined")
      : showIncomingRequestBanner
        ? t("dm.placeholder.acceptToReply")
        : conversation?.status === "pending" && conversation.requested_by === currentUserId
          ? t("dm.placeholder.waiting")
          : t("dm.placeholder.message");

  return (
    <Shell chatThread>
      <DmChatThreadShell>
        <DmThreadHeader
          partnerId={partnerId || null}
          partner={partner}
          presence={partnerPresence}
          isSelfConversation={isSelfConversation}
          canSeePartnerPresence={canSeePartnerPresence}
        />

        {showIncomingRequestBanner ? (
          <section className="shrink-0 border-b border-primary/20 bg-primary/10 px-4 py-3">
            <p className="text-sm font-semibold text-white">{t("dm.requestTitle")}</p>
            <p className="mt-1 text-sm text-slate-300">
              {t("dm.requestBody", {
                user: partner ? publicProfileUsername(partner.username) : t("common.user"),
              })}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={resolvingRequest}
                onClick={() => void handleAcceptRequest()}
                className="inline-flex rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-[#050816] transition hover:brightness-110 disabled:opacity-50"
              >
                {resolvingRequest ? "…" : t("common.accept")}
              </button>
              <button
                type="button"
                disabled={resolvingRequest}
                onClick={() => void handleDeclineRequest()}
                className="inline-flex rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/5 disabled:opacity-50"
              >
                {t("common.decline")}
              </button>
            </div>
          </section>
        ) : null}

        {conversation?.status === "pending" && conversation.requested_by === currentUserId ? (
          <section className="shrink-0 border-b border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            {t("dm.waitingAccept", {
              user: partner ? publicProfileUsername(partner.username) : t("common.user"),
            })}
          </section>
        ) : null}

        {conversation?.status === "declined" ? (
          <section className="shrink-0 border-b border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-200">
            {t("dm.declined")}
          </section>
        ) : null}

        <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[#070b14]">
          <DmWallpaper />

          {!initialBottomReady && (loading || messages.length > 0) ? (
            <div
              className="absolute inset-0 z-20 flex items-center justify-center bg-[#070b14]/95"
              aria-busy="true"
              aria-live="polite"
            >
              <p className="text-sm text-slate-300">{t("dm.loadingMessages")}</p>
            </div>
          ) : null}

          <div
            ref={messagesContainerRef}
            className={`relative z-10 min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-y-contain [overflow-anchor:none] px-4 pt-4 ${CHAT_MESSAGES_FLEX_PADDING} ${
              !initialBottomReady && messages.length > 0
                ? "pointer-events-none invisible"
                : ""
            }`}
          >
            {!currentUserId && !loading ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-[#050816]/80 p-6 text-center text-sm text-slate-300">
                <Link href="/auth/login" className="font-semibold text-primary hover:brightness-110">
                  {t("auth.signIn")}
                </Link>{" "}
                {t("dm.signInToSend")}
              </div>
            ) : isSelfConversation ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-[#050816]/80 p-6 text-center text-sm text-slate-300">
                {t("dm.cannotMessageSelf")}
              </div>
            ) : loading ? null : error ? (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-200">
                {localizeUserMessage(t, error) ?? error}
              </div>
            ) : messages.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-[#050816]/80 p-6 text-center text-sm text-slate-300">
                {t("dm.emptySayHello")}
              </div>
            ) : (
              messages.map((message, messageIndex) => {
                const isOwnMessage = message.sender_id === currentUserId;
                const previousMessage = messageIndex > 0 ? messages[messageIndex - 1] : null;
                const showDateSeparator = shouldShowChatDateSeparator(
                  previousMessage?.created_at,
                  message.created_at
                );

                const isSpotShareMessage = isSpotShareDirectMessage(message);
                const isSpotPostMessage = isSpotDirectMessage(message);
                const isLocationCardMessage = isLocationCardShareMessage(message.body);

                return (
                  <Fragment key={message.id}>
                    {showDateSeparator ? <ChatDateSeparator createdAt={message.created_at} /> : null}
                    <div className={`flex ${isOwnMessage ? "justify-end" : "justify-start"}`}>
                      {isSpotPostMessage && message.post_id ? (
                        <DirectMessageSpotCard
                          postId={message.post_id}
                          isOwnMessage={isOwnMessage}
                          senderUsername={
                            isOwnMessage
                              ? partner?.username ?? t("common.you")
                              : partner?.username ?? t("common.user")
                          }
                          createdAt={message.created_at}
                          currentUserId={currentUserId!}
                          deliveredAt={message.delivered_at}
                          readAt={message.read_at}
                          senderId={message.sender_id}
                        />
                      ) : isSpotShareMessage && message.spot_share_id ? (
                        <DirectMessageSpotShareCard
                          shareId={message.spot_share_id}
                          messageType={spotShareMessageCardType(message)}
                          isOwnMessage={isOwnMessage}
                          currentUserId={currentUserId!}
                          partnerUsername={partner?.username ?? t("common.user")}
                          senderUsername={
                            message.sender_id === currentUserId
                              ? partner?.username ?? t("common.you")
                              : partner?.username ?? t("common.user")
                          }
                          createdAt={message.created_at}
                          deliveredAt={message.delivered_at}
                          readAt={message.read_at}
                          senderId={message.sender_id}
                          initialShare={shareById.get(message.spot_share_id) ?? null}
                          onShareUpdated={() => void handleSpotShareSent()}
                        />
                      ) : isLocationCardMessage && message.body ? (
                        <DirectMessageLocationCard
                          body={message.body}
                          isOwnMessage={isOwnMessage}
                          currentUserId={currentUserId!}
                          message={message}
                        />
                      ) : (
                        <div
                          className={`max-w-[85%] rounded-[22px] px-4 py-2.5 shadow-md shadow-black/20 ${
                            isOwnMessage
                              ? "rounded-br-md bg-primary/20 text-cyan-50"
                              : "rounded-bl-md border border-white/10 bg-[#0B1026] text-slate-100"
                          }`}
                        >
                          <p className="whitespace-pre-wrap break-words text-[15px] leading-6">
                            {message.body}
                          </p>
                          {currentUserId ? (
                            <DmMessageStatus
                              message={message}
                              currentUserId={currentUserId}
                              isOwnMessage={isOwnMessage}
                            />
                          ) : null}
                        </div>
                      )}
                    </div>
                  </Fragment>
                );
              })
            )}
            <div ref={messagesEndRef} aria-hidden className="h-px w-full shrink-0" />
          </div>

          <div
            className="relative z-20 shrink-0"
            style={{
              ...composerStyle,
              paddingBottom: dmComposerBottomPadding(isDmKeyboardOpen),
            }}
          >
              {partnerTypingName ? (
                <p
                  className="border-t border-white/5 bg-[#0B1026]/95 px-4 py-1.5 text-xs text-slate-400 backdrop-blur-md"
                  aria-live="polite"
                >
                  {t("dm.typing", { name: partnerTypingName })}
                </p>
              ) : null}
              <form
                onSubmit={(event) => void handleSend(event)}
                className="border-t border-white/10 bg-[#070b14]/95 px-3 pt-2.5 backdrop-blur-xl"
              >
            <div className="flex items-end gap-2">
              {currentUserId && partner && !isSelfConversation ? (
                <ShareSpotToUserButton
                  senderId={currentUserId}
                  recipientId={partner.id}
                  recipientUsername={partner.username}
                  disabled={!canSendMessages || sending}
                  onSent={() => void handleSpotShareSent()}
                />
              ) : null}
              <textarea
                ref={composerTextareaRef}
                name="spotdrop-dm-message"
                autoComplete="off"
                value={draft}
                onChange={(event) => handleDraftChange(event.target.value)}
                onFocus={handleComposerFocus}
                disabled={!currentUserId || isSelfConversation || !canSendMessages}
                placeholder={composerPlaceholder}
                rows={1}
                className="min-h-[48px] max-h-32 w-full resize-none rounded-2xl border border-white/10 bg-[#0d1322] px-4 py-3 text-sm text-white outline-none transition focus:border-primary/45 disabled:cursor-not-allowed disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={isSendDisabled}
                className="shrink-0 rounded-2xl bg-primary px-4 py-3 text-xs font-semibold text-[#050816] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {sending ? "…" : t("common.send")}
              </button>
            </div>
            {sendError ? (
              <p className="mt-2 text-xs text-red-300">{localizeUserMessage(t, sendError) ?? sendError}</p>
            ) : null}
            </form>
          </div>
        </section>
      </DmChatThreadShell>
    </Shell>
  );
}
