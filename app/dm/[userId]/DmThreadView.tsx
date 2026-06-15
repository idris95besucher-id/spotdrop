"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { ChevronLeft, UserRound } from "lucide-react";
import ChatDateSeparator from "@/components/ChatDateSeparator";
import ChatNewMessagesPill from "@/components/ChatNewMessagesPill";
import ChatThreadShell from "@/components/ChatThreadShell";
import DirectMessageSpotShareCard from "@/components/DirectMessageSpotShareCard";
import DirectMessageSpotCard from "@/components/DirectMessageSpotCard";
import { useChatNotifications } from "@/components/ChatNotificationsProvider";
import ShareSpotToUserButton from "@/components/ShareSpotToUserButton";
import Shell from "@/components/Shell";
import { useI18n } from "@/components/I18nProvider";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import { markDirectMessagesReadInThread } from "@/lib/chatNotifications";
import { getSafeAuthSession } from "@/lib/authSession";
import { formatChatMessageTime, shouldShowChatDateSeparator } from "@/lib/chatDates";
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
  spotShareMessageCardType,
  touchConversationUpdatedAt,
  type DirectConversation,
  type DirectMessageType,
} from "@/lib/directConversations";
import { CHATS_INBOX_REFRESH_EVENT } from "@/lib/chatsInbox";
import { checkCanMessageUser, type MessagePrivacyBlockReasonKey } from "@/lib/messagePrivacy";
import { loadPrivateSpotSharesByIds, type PrivateSpotShare } from "@/lib/privateSpotShares";
import { useChatScroll, useChatScrollEffect } from "@/lib/useChatScroll";
import { isGuideAccountUsername, publicProfileUsername } from "@/lib/publicProfile";
import { supabase } from "@/lib/supabaseClient";

type PartnerProfile = {
  id: string;
  username: string;
  avatar_url?: string | null;
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
};

export default function DirectMessagePage() {
  const { t } = useI18n();
  const params = useParams<{ userId: string }>();
  const partnerId = params.userId;

  const [session, setSession] = useState<Session | null>(null);
  const [partner, setPartner] = useState<PartnerProfile | null>(null);
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

  const {
    messagesContainerRef,
    showNewMessages,
    scrollToBottom,
    handleScroll,
    syncMessagesScroll,
    markForceScroll,
    resetChatScroll,
  } = useChatScroll();
  const { refreshUnreadCount } = useChatNotifications();
  const currentUserId = session?.user?.id ?? null;
  const isSelfConversation = Boolean(currentUserId && partnerId && currentUserId === partnerId);
  const showIncomingRequestBanner = Boolean(
    conversation && currentUserId && isIncomingRequest(conversation, currentUserId)
  );
  const sendPermission = canSendDirectMessage(conversation, currentUserId ?? "");
  const canSendMessages = sendPermission.allowed && !messagePrivacyBlockKey;

  useChatScrollEffect(syncMessagesScroll, messages.length, loading);

  useEffect(() => {
    resetChatScroll();
  }, [partnerId, resetChatScroll]);

  const reloadConversation = useCallback(async () => {
    if (!currentUserId || !partnerId) {
      return;
    }

    const result = await getDirectConversation(currentUserId, partnerId);
    setConversation(result.conversation);
  }, [currentUserId, partnerId]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    void getSafeAuthSession().then((result) => {
      setSession(result.session);
      if (result.error) {
        setError(result.error);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const loadConversation = async () => {
      if (!partnerId) {
        setLoading(false);
        setError(t("dm.error.invalidConversation"));
        return;
      }

      setLoading(true);
      setError(null);
      setSendError(null);
      setMessagePrivacyBlockKey(null);

      if (currentUserId && partnerId === currentUserId) {
        setError(t("dm.cannotMessageSelf"));
        setPartner(null);
        setMessages([]);
        setConversation(null);
        setLoading(false);
        return;
      }

      const { data: partnerRow, error: partnerError } = await supabase
        .from("profiles")
        .select("id, username, avatar_url")
        .eq("id", partnerId)
        .maybeSingle();

      if (partnerError) {
        console.error("Failed to load DM partner:", JSON.stringify(partnerError, null, 2));
        setError(partnerError.message || t("dm.error.loadConversation"));
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

      setPartner({
        ...partnerRow,
        username: publicProfileUsername(partnerRow.username),
      } as PartnerProfile);

      if (!currentUserId) {
        setMessages([]);
        setConversation(null);
        setLoading(false);
        return;
      }

      const messagePermission = await checkCanMessageUser(currentUserId, partnerId);

      if (!messagePermission.allowed) {
        setMessagePrivacyBlockKey(messagePermission.reasonKey);
      }

      const conversationResult = await getDirectConversation(currentUserId, partnerId);

      if (conversationResult.error && !conversationResult.conversation) {
        setError(conversationResult.error);
      }

      setConversation(conversationResult.conversation);

      const { messages: loadedMessages, error: messagesError } = await loadDirectMessagesForThread(
        currentUserId,
        partnerId
      );

      if (messagesError) {
        console.error("Failed to load direct messages:", messagesError);
        setError(messagesError || t("dm.error.loadMessages"));
        setMessages([]);
        setShareById(new Map());
      } else {
        setMessages(loadedMessages as DirectMessage[]);

        const shareIds = [
          ...new Set(
            loadedMessages
              .map((message) => message.spot_share_id)
              .filter((id): id is string => Boolean(id))
          ),
        ];

        const sharesResult = await loadPrivateSpotSharesByIds(shareIds);
        setShareById(sharesResult.shares);

        await markDirectMessagesReadInThread(currentUserId, partnerId);
        void refreshUnreadCount();
        window.dispatchEvent(new Event(CHATS_INBOX_REFRESH_EVENT));
      }

      setLoading(false);
    };

    void loadConversation();
  }, [currentUserId, partnerId, refreshUnreadCount, t]);

  useEffect(() => {
    if (!currentUserId || !partnerId || isSelfConversation) {
      return;
    }

    const channel = supabase
      .channel(`direct_messages_${currentUserId}_${partnerId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "direct_messages",
        },
        (payload) => {
          const incoming = payload.new as DirectMessage;
          const isThreadMessage =
            (incoming.sender_id === currentUserId && incoming.recipient_id === partnerId) ||
            (incoming.sender_id === partnerId && incoming.recipient_id === currentUserId);

          if (!isThreadMessage) {
            return;
          }

          const normalized = normalizeDirectMessageRow(incoming) as DirectMessage;

          if (normalized.recipient_id === currentUserId) {
            void markDirectMessagesReadInThread(currentUserId, partnerId).then(() => {
              void refreshUnreadCount();
            });
          }

          setMessages((current) => {
            if (current.some((message) => message.id === normalized.id)) {
              return current;
            }

            return [...current, normalized].sort(
              (left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
            );
          });

          window.dispatchEvent(new Event(CHATS_INBOX_REFRESH_EVENT));

          if (normalized.spot_share_id) {
            void loadPrivateSpotSharesByIds([normalized.spot_share_id]).then((result) => {
              const share = result.shares.get(normalized.spot_share_id!);

              if (share) {
                setShareById((current) => new Map(current).set(share.id, share));
              }
            });
          }
        }
      )
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
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "direct_conversations",
        },
        () => {
          void reloadConversation();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, isSelfConversation, partnerId, refreshUnreadCount, reloadConversation]);

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
      setSendError(ensured.error);
      setSending(false);
      return;
    }

    if (ensured.sendBlockedReason) {
      setSendError(ensured.sendBlockedReason);
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
      .select("id, sender_id, recipient_id, body, message_type, spot_share_id, post_id, created_at")
      .single();

    setSending(false);

    if (insertError) {
      console.error("Failed to send direct message:", JSON.stringify(insertError, null, 2));
      setSendError(insertError.message || t("dm.error.sendMessage"));
      return;
    }

    if (inserted) {
      setMessages((current) => {
        if (current.some((message) => message.id === inserted.id)) {
          return current;
        }

        return [...current, normalizeDirectMessageRow(inserted) as DirectMessage];
      });
    }

    setDraft("");
    void touchConversationUpdatedAt(currentUserId, partnerId);
    window.dispatchEvent(new Event(CHATS_INBOX_REFRESH_EVENT));
    markForceScroll();
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
    markForceScroll();
  }, [currentUserId, partnerId, refreshUnreadCount, reloadSharesForMessages, markForceScroll]);

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
      <ChatThreadShell>
        <header className="shrink-0 border-b border-white/10 bg-[#0B1026]/95 px-2 py-2 backdrop-blur-xl sm:px-3">
          <div className="flex items-center gap-1">
            <Link
              href="/chats"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition hover:bg-white/5"
              aria-label={t("dm.backToMessages")}
            >
              <ChevronLeft className="h-5 w-5" strokeWidth={2} aria-hidden />
            </Link>
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/[0.06] ring-1 ring-white/10">
                {partner?.avatar_url ? (
                  <img src={partner.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <UserRound className="h-4 w-4 text-muted" strokeWidth={1.75} aria-hidden />
                )}
              </div>
              <h1 className="truncate text-[15px] font-semibold leading-tight text-white">
                {partner ? publicProfileUsername(partner.username) : t("dm.chat")}
              </h1>
            </div>
          </div>
        </header>

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

        <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[#050816]/60">
          <div
            ref={messagesContainerRef}
            onScroll={handleScroll}
            className="flex-1 space-y-3 overflow-y-auto p-4"
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
            ) : loading ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-[#050816]/80 p-6 text-center text-sm text-slate-300">
                {t("dm.loadingMessages")}
              </div>
            ) : error ? (
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
                          initialShare={shareById.get(message.spot_share_id) ?? null}
                          onShareUpdated={() => void handleSpotShareSent()}
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
                          <p
                            className={`mt-1 text-[10px] ${isOwnMessage ? "text-primary/70" : "text-muted"}`}
                          >
                            {formatChatMessageTime(message.created_at)}
                          </p>
                        </div>
                      )}
                    </div>
                  </Fragment>
                );
              })
            )}
          </div>

          <div className="relative shrink-0">
            {showNewMessages ? (
              <div className="absolute inset-x-0 bottom-full z-30 mb-2 flex justify-center px-4">
                <ChatNewMessagesPill onClick={() => scrollToBottom("smooth")} />
              </div>
            ) : null}

            <form
              onSubmit={(event) => void handleSend(event)}
              className="border-t border-white/10 bg-[#0B1026]/95 p-3 backdrop-blur-xl"
              style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
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
                name="spotdrop-dm-message"
                autoComplete="off"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                disabled={!currentUserId || isSelfConversation || !canSendMessages}
                placeholder={composerPlaceholder}
                rows={1}
                className="min-h-[48px] max-h-32 w-full resize-none rounded-2xl border border-white/10 bg-[#050816] px-4 py-3 text-sm text-white outline-none transition focus:border-primary/45 disabled:cursor-not-allowed disabled:opacity-60"
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
      </ChatThreadShell>
    </Shell>
  );
}
