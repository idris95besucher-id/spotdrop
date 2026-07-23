"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import type { FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import ChatDateSeparator from "@/components/ChatDateSeparator";
import DmChatThreadShell from "@/components/DmChatThreadShell";
import GroupMessagePlaceCard from "@/components/GroupMessagePlaceCard";
import GroupMessageMapMarkCard from "@/components/GroupMessageMapMarkCard";
import GroupThreadHeader from "@/components/GroupThreadHeader";
import Shell from "@/components/Shell";
import { useAuthSession } from "@/components/AuthSessionProvider";
import { useI18n } from "@/components/I18nProvider";
import { formatChatMessageTime, shouldShowChatDateSeparator } from "@/lib/chatDates";
import { CHATS_INBOX_REFRESH_EVENT } from "@/lib/chatsInbox";
import { isCityRoomPlaceMessage } from "@/lib/cityRoomPlaceMessage";
import { isCityRoomMapMarkMessage } from "@/lib/cityRoomMapMarkMessage";
import { describeGroupError } from "@/lib/groupChatErrors";
import { loadGroupMessagesForThread, sendGroupTextMessage, type GroupChatMessageRow } from "@/lib/groupChatMessages";
import {
  loadGroupChat,
  loadGroupMembers,
  markGroupThreadRead,
  type GroupChatDetails,
  type GroupChatMember,
} from "@/lib/groupChats";
import { startGroupThreadLiveSync } from "@/lib/groupChatSync";
import { formatGroupSystemEventText, isGroupSystemEventMessage, parseGroupSystemEvent } from "@/lib/groupChatSystemEvents";
import {
  CHAT_MESSAGES_FLEX_PADDING,
  dmComposerBottomPadding,
  useDmComposerKeyboardInset,
} from "@/lib/keyboardSystem";
import { useDmThreadScroll } from "@/lib/useDmThreadScroll";
import { publicProfileUsername } from "@/lib/publicProfile";
import VoiceMessagePlayer from "@/components/voice/VoiceMessagePlayer";
import ChatImageBubble from "@/components/chat/ChatImageBubble";
import ChatLocationBubble from "@/components/chat/ChatLocationBubble";
import VoiceMessageRecorder from "@/components/voice/VoiceMessageRecorder";
import { sendGroupVoiceMessage } from "@/lib/groupChatMessages";
import { uploadVoiceMessage } from "@/lib/voiceMessages/uploadVoiceMessage";
import type { VoiceRecordingResult } from "@/lib/voiceMessages/useVoiceRecorder";
import ChatAttachmentMenu from "@/components/chat/ChatAttachmentMenu";
import { sendGroupPhoto } from "@/lib/sendChatPhoto";
import { pickChatPhotos } from "@/lib/pickMediaFromGallery";
import { sendGroupLocation } from "@/lib/sendChatLocation";
import { requestCheckSpotGpsReading } from "@/lib/checkSpotGps";
import { canEditMessage, canDeleteMessage } from "@/lib/messageEditWindow";
import { editGroupMessage, deleteGroupMessageForEveryone, mapEditDeleteError } from "@/lib/messageEditDelete";
import MessageActionSheet from "@/components/chat/MessageActionSheet";
import MessageActionErrorToast from "@/components/chat/MessageActionErrorToast";
import MessageLongPressZone from "@/components/chat/MessageLongPressZone";
import DeletedMessageBubble from "@/components/chat/DeletedMessageBubble";

export default function GroupThreadView() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const groupId = searchParams.get("id") ?? "";
  const { session } = useAuthSession();
  const currentUserId = session?.user?.id ?? null;

  const [group, setGroup] = useState<GroupChatDetails | null>(null);
  const [members, setMembers] = useState<GroupChatMember[]>([]);
  const [messages, setMessages] = useState<GroupChatMessageRow[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  const [initialBottomReady, setInitialBottomReady] = useState(false);

  const {
    messagesContainerRef,
    messagesEndRef,
    runDmOpenBottomSequence,
    scrollOnMessageAppended,
    scrollOnSend,
  } = useDmThreadScroll();
  const composerTextareaRef = useRef<HTMLTextAreaElement>(null);
  const { isKeyboardOpen: isKeyboardOpenState, composerStyle } = useDmComposerKeyboardInset();
  const markedReadRef = useRef<string | null>(null);
  const seenMessageIdsRef = useRef(new Set<string>());
  const messagesRef = useRef<GroupChatMessageRow[]>([]);
  messagesRef.current = messages;
  const openBottomSequenceStartedRef = useRef<string | null>(null);

  const usernameById = new Map(members.map((member) => [member.userId, member.username]));
  const isMember = members.some((member) => member.userId === currentUserId);
  const canSend = Boolean(currentUserId) && isMember && !removed;

  useEffect(() => {
    setInitialBottomReady(false);
    setMessages([]);
    setLoading(true);
    setError(null);
    setRemoved(false);
    openBottomSequenceStartedRef.current = null;
    seenMessageIdsRef.current = new Set();

    const container = messagesContainerRef.current;

    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [groupId, messagesContainerRef]);

  useEffect(() => {
    if (loading) {
      return;
    }

    const skipOpenBottom = messages.length === 0 || Boolean(error);

    if (skipOpenBottom) {
      setInitialBottomReady(true);
      return;
    }

    const sequenceKey = `${groupId}:${messages.length}`;

    if (openBottomSequenceStartedRef.current === sequenceKey) {
      return;
    }

    openBottomSequenceStartedRef.current = sequenceKey;

    return runDmOpenBottomSequence(() => setInitialBottomReady(true));
  }, [error, groupId, loading, messages.length, runDmOpenBottomSequence]);

  useEffect(() => {
    if (!groupId) {
      setLoading(false);
      setError(t("group.error.notFound"));
      return;
    }

    let cancelled = false;

    void (async () => {
      const [groupResult, membersResult, messagesResult] = await Promise.all([
        loadGroupChat(groupId),
        loadGroupMembers(groupId),
        loadGroupMessagesForThread(groupId),
      ]);

      if (cancelled) {
        return;
      }

      if (!groupResult.group) {
        setError(groupResult.error ?? t("group.error.notFound"));
        setLoading(false);
        return;
      }

      setGroup(groupResult.group);
      setMembers(membersResult.members);

      if (messagesResult.error) {
        setError(describeGroupError(messagesResult.error, t("group.error.load")));
      } else {
        setMessages(messagesResult.messages);
        seenMessageIdsRef.current = new Set(messagesResult.messages.map((message) => message.id));
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [groupId, t]);

  useEffect(() => {
    if (!currentUserId || !groupId || !isMember) {
      return;
    }

    if (markedReadRef.current === groupId) {
      return;
    }

    markedReadRef.current = groupId;
    void markGroupThreadRead(groupId, currentUserId).then(() => {
      // ChatNotificationsProvider listens and refreshes unread + app icon badge.
      window.dispatchEvent(new Event(CHATS_INBOX_REFRESH_EVENT));
    });
  }, [currentUserId, groupId, isMember]);

  const reloadMembers = useCallback(async () => {
    if (!groupId) return;
    const result = await loadGroupMembers(groupId);
    setMembers(result.members);
  }, [groupId]);

  const reloadGroup = useCallback(async () => {
    if (!groupId) return;
    const result = await loadGroupChat(groupId);
    if (result.group) {
      setGroup(result.group);
    }
  }, [groupId]);

  useEffect(() => {
    if (!currentUserId || !groupId) {
      return;
    }

    const stopSync = startGroupThreadLiveSync(groupId, currentUserId, {
      onAppendMessage: (message) => {
        setMessages((current) => {
          if (current.some((existing) => existing.id === message.id)) {
            return current;
          }

          return [...current, message].sort(
            (left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
          );
        });

        scrollOnMessageAppended();
        window.dispatchEvent(new Event(CHATS_INBOX_REFRESH_EVENT));
      },
      onUpdateMessage: (updated) => {
        setMessages((current) =>
          current.map((message) =>
            message.id === updated.id
              ? { ...message, body: updated.body, edited_at: updated.edited_at, deleted_at: updated.deleted_at }
              : message
          )
        );

        if (updated.deleted_at) {
          setEditingMessageId((current) => (current === updated.id ? null : current));
        }
      },
      getLatestCreatedAt: () => {
        const list = messagesRef.current;
        return list.length > 0 ? list[list.length - 1]?.created_at ?? null : null;
      },
      hasMessageId: (id) => seenMessageIdsRef.current.has(id) || messagesRef.current.some((m) => m.id === id),
      rememberMessageId: (id) => seenMessageIdsRef.current.add(id),
      onRemovedFromGroup: () => setRemoved(true),
      onMembersChanged: () => void reloadMembers(),
      onGroupUpdated: () => void reloadGroup(),
    });

    return stopSync;
  }, [currentUserId, groupId, reloadGroup, reloadMembers, scrollOnMessageAppended]);

  const handleSend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSendError(null);

    if (sending || !currentUserId || !groupId) {
      return;
    }

    const trimmed = draft.trim();

    if (!trimmed) {
      return;
    }

    setSending(true);

    const result = await sendGroupTextMessage(groupId, currentUserId, trimmed);

    setSending(false);

    if (result.error) {
      setSendError(describeGroupError(result.error, t("group.error.send")));
      return;
    }

    if (result.message) {
      seenMessageIdsRef.current.add(result.message.id);
      setMessages((current) => {
        if (current.some((m) => m.id === result.message!.id)) {
          return current;
        }
        return [...current, result.message!];
      });
    }

    setDraft("");
    window.dispatchEvent(new Event(CHATS_INBOX_REFRESH_EVENT));
    scrollOnSend();
  };

  const handleVoiceSend = async (result: Extract<VoiceRecordingResult, { ok: true }>) => {
    if (sending || !currentUserId || !groupId) {
      return;
    }

    setSending(true);
    setSendError(null);

    const uploaded = await uploadVoiceMessage(currentUserId, result.blob, result.mimeType);

    if (!uploaded.audioUrl) {
      setSending(false);
      setSendError(describeGroupError(uploaded.error, t("group.error.send")));
      return;
    }

    const sendResult = await sendGroupVoiceMessage(
      groupId,
      currentUserId,
      uploaded.audioUrl,
      Math.round(result.durationMs / 1000),
      result.waveform
    );

    setSending(false);

    if (sendResult.error) {
      setSendError(describeGroupError(sendResult.error, t("group.error.send")));
      return;
    }

    if (sendResult.message) {
      seenMessageIdsRef.current.add(sendResult.message.id);
      setMessages((current) => {
        if (current.some((m) => m.id === sendResult.message!.id)) {
          return current;
        }
        return [...current, sendResult.message!];
      });
    }

    window.dispatchEvent(new Event(CHATS_INBOX_REFRESH_EVENT));
    scrollOnSend();
  };

  const handlePhotoSend = async (files: File[]) => {
    if (sending || !currentUserId || !groupId || files.length === 0) {
      return;
    }

    setSending(true);
    setSendError(null);

    for (const file of files) {
      const sendResult = await sendGroupPhoto({ groupId, senderId: currentUserId, file });

      if (sendResult.error) {
        setSendError(describeGroupError(sendResult.error, t("chatAttach.sendFailed")));
        continue;
      }

      if (sendResult.message) {
        seenMessageIdsRef.current.add(sendResult.message.id);
        setMessages((current) => {
          if (current.some((m) => m.id === sendResult.message!.id)) {
            return current;
          }
          return [...current, sendResult.message!];
        });
      }
    }

    setSending(false);
    window.dispatchEvent(new Event(CHATS_INBOX_REFRESH_EVENT));
    scrollOnSend();
  };

  const handlePickAndSendPhotos = async () => {
    const files = await pickChatPhotos();

    if (files.length === 0) {
      return;
    }

    await handlePhotoSend(files);
  };

  const handleSendCurrentLocation = async () => {
    if (sending || !currentUserId || !groupId) {
      return;
    }

    setSending(true);
    setSendError(null);

    const { reading, error: gpsError } = await requestCheckSpotGpsReading();

    if (!reading) {
      setSending(false);
      setSendError(describeGroupError(gpsError, t("chatAttach.locationPermissionDenied")));
      return;
    }

    const sendResult = await sendGroupLocation({
      groupId,
      senderId: currentUserId,
      latitude: reading.latitude,
      longitude: reading.longitude,
    });

    setSending(false);

    if (sendResult.error) {
      setSendError(describeGroupError(sendResult.error, t("chatAttach.sendFailed")));
      return;
    }

    if (sendResult.message) {
      seenMessageIdsRef.current.add(sendResult.message.id);
      setMessages((current) => {
        if (current.some((m) => m.id === sendResult.message!.id)) {
          return current;
        }
        return [...current, sendResult.message!];
      });
    }

    window.dispatchEvent(new Event(CHATS_INBOX_REFRESH_EVENT));
    scrollOnSend();
  };

  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [actionSheetMessageId, setActionSheetMessageId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const deletingMessageIdsRef = useRef<Set<string>>(new Set());

  const startEditingMessage = (message: GroupChatMessageRow) => {
    if (!canEditMessage(message.created_at)) {
      return;
    }

    setEditError(null);
    setEditingMessageId(message.id);
    setEditDraft(message.body ?? "");
  };

  const cancelEditingMessage = () => {
    setEditError(null);
    setEditingMessageId(null);
    setEditDraft("");
  };

  const saveEditedMessage = async () => {
    if (!currentUserId || !editingMessageId) {
      return;
    }

    const trimmed = editDraft.trim();
    if (!trimmed) {
      setEditError("Message cannot be empty.");
      return;
    }

    const targetMessage = messages.find((message) => message.id === editingMessageId);
    if (!targetMessage || targetMessage.sender_id !== currentUserId) {
      return;
    }

    if (trimmed === targetMessage.body) {
      cancelEditingMessage();
      return;
    }

    setSavingEdit(true);
    setEditError(null);

    const { message: updatedMessage, error: updateError } = await editGroupMessage({
      messageId: editingMessageId,
      senderId: currentUserId,
      body: trimmed,
    });

    if (updateError || !updatedMessage) {
      setEditError(mapEditDeleteError("edit", updateError));
      setSavingEdit(false);
      return;
    }

    setMessages((current) =>
      current.map((message) =>
        message.id === updatedMessage.id
          ? { ...message, body: updatedMessage.body, edited_at: updatedMessage.edited_at }
          : message
      )
    );

    cancelEditingMessage();
    setSavingEdit(false);
  };

  const handleDeleteMessage = async (targetMessage: GroupChatMessageRow) => {
    if (!currentUserId || targetMessage.sender_id !== currentUserId) {
      return;
    }

    if (deletingMessageIdsRef.current.has(targetMessage.id)) {
      return;
    }

    deletingMessageIdsRef.current.add(targetMessage.id);

    try {
      const { error: deleteErrorResult } = await deleteGroupMessageForEveryone({
        messageId: targetMessage.id,
        senderId: currentUserId,
      });

      if (deleteErrorResult) {
        console.error("Failed to delete group message:", deleteErrorResult);
        setActionError(mapEditDeleteError("delete", deleteErrorResult));
        return;
      }

      setMessages((current) =>
        current.map((message) =>
          message.id === targetMessage.id ? { ...message, deleted_at: new Date().toISOString() } : message
        )
      );
    } finally {
      deletingMessageIdsRef.current.delete(targetMessage.id);
    }
  };

  const isSendDisabled = sending || !draft.trim() || !canSend;
  const composerPlaceholder = !isMember && !loading ? t("group.error.notMember") : t("group.placeholder.message");

  return (
    <Shell chatThread>
      <DmChatThreadShell>
        <GroupThreadHeader groupId={groupId} group={group} memberCount={members.length} />

        {removed ? (
          <section className="shrink-0 border-b border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-200">
            {t("group.error.notMember")}
          </section>
        ) : null}

        <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[#070b14]">
          {!initialBottomReady && (loading || messages.length > 0) ? (
            <div
              className="absolute inset-0 z-20 flex items-center justify-center bg-[#070b14]/95"
              aria-busy="true"
              aria-live="polite"
            >
              <p className="text-sm text-slate-300">{t("group.loadingMessages")}</p>
            </div>
          ) : null}

          <div
            ref={messagesContainerRef}
            className={`relative z-10 min-h-0 flex-1 touch-pan-y space-y-3 overflow-y-auto overscroll-y-contain [overflow-anchor:none] px-4 pt-4 ${CHAT_MESSAGES_FLEX_PADDING} ${
              !initialBottomReady && messages.length > 0 ? "pointer-events-none invisible" : ""
            }`}
          >
            {loading ? null : error ? (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-200">{error}</div>
            ) : messages.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-[#050816]/80 p-6 text-center text-sm text-slate-300">
                {t("group.emptySayHello")}
              </div>
            ) : (
              messages.map((message, index) => {
                const isOwnMessage = message.sender_id === currentUserId;
                const previousMessage = index > 0 ? messages[index - 1] : null;
                const showDateSeparator = shouldShowChatDateSeparator(
                  previousMessage?.created_at,
                  message.created_at
                );
                const isSystemEvent = message.message_type === "system" && isGroupSystemEventMessage(message.body);

                if (isSystemEvent) {
                  const event = parseGroupSystemEvent(message.body);
                  const text = event
                    ? formatGroupSystemEventText(event, usernameById, t, currentUserId)
                    : "";

                  return (
                    <Fragment key={message.id}>
                      {showDateSeparator ? <ChatDateSeparator createdAt={message.created_at} /> : null}
                      <p className="py-1 text-center text-xs text-slate-500">{text}</p>
                    </Fragment>
                  );
                }

                const senderName = publicProfileUsername(usernameById.get(message.sender_id));
                const isPlaceMessage =
                  message.message_type === "text" && isCityRoomPlaceMessage(message.body ?? "");
                const isMapMarkMessage =
                  message.message_type === "text" && isCityRoomMapMarkMessage(message.body ?? "");
                const isDeletedMessage = Boolean(message.deleted_at);
                const isEditingThis = editingMessageId === message.id;
                const isStructuredMessage =
                  Boolean(message.audio_url) ||
                  Boolean(message.image_url) ||
                  Boolean(message.live_location_lat != null && message.live_location_lng != null) ||
                  isMapMarkMessage ||
                  isPlaceMessage;
                const canEditThis = isOwnMessage && !isStructuredMessage && canEditMessage(message.created_at);
                const canDeleteThis = isOwnMessage && canDeleteMessage(message.created_at);
                const localizedEditError = isEditingThis ? editError : null;

                const senderNameLabel = !isOwnMessage ? (
                  <p className="mb-1 ml-1 truncate text-[11px] font-medium text-slate-500">{senderName}</p>
                ) : null;

                const timestampRow = (
                  <div className={`flex ${isOwnMessage ? "justify-end" : "justify-start"}`}>
                    <span className="mt-1 text-[10px] text-muted">
                      {message.edited_at ? `${t("messageActions.edited")} · ` : ""}
                      {formatChatMessageTime(message.created_at)}
                    </span>
                  </div>
                );

                const bubbleContent = isDeletedMessage ? (
                  <div className="max-w-[85%]">
                    {senderNameLabel}
                    <DeletedMessageBubble isOwnMessage={isOwnMessage} />
                  </div>
                ) : isEditingThis ? (
                  <div className="max-w-[85%] min-w-[220px]">
                    {senderNameLabel}
                    <div className="rounded-[22px] border border-cyan-400/35 bg-[#122033]/95 px-3 py-2.5 shadow-sm ring-1 ring-cyan-400/20">
                      <textarea
                        value={editDraft}
                        onChange={(event) => setEditDraft(event.target.value)}
                        disabled={savingEdit}
                        rows={3}
                        className="w-full resize-none rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-[15px] leading-6 text-white outline-none transition focus:border-cyan-400/50 disabled:opacity-60"
                      />
                      {localizedEditError ? <p className="mt-1.5 px-1 text-xs text-red-300">{localizedEditError}</p> : null}
                      <div className="mt-2 flex flex-wrap gap-2 px-1">
                        <button
                          type="button"
                          onClick={() => void saveEditedMessage()}
                          disabled={savingEdit || !editDraft.trim()}
                          className="rounded-full bg-cyan-500 px-3 py-1 text-xs font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:opacity-60"
                        >
                          {savingEdit ? t("common.saving") : t("common.accept")}
                        </button>
                        <button
                          type="button"
                          onClick={cancelEditingMessage}
                          disabled={savingEdit}
                          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-200 transition hover:bg-white/10 disabled:opacity-60"
                        >
                          {t("common.cancel")}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : message.audio_url ? (
                  <div className="max-w-[85%]">
                    {senderNameLabel}
                    <VoiceMessagePlayer
                      audioUrl={message.audio_url}
                      durationSeconds={message.audio_duration_seconds}
                      waveform={message.audio_waveform}
                      isOwnMessage={isOwnMessage}
                    />
                    {timestampRow}
                  </div>
                ) : message.image_url ? (
                  <div className="max-w-[85%]">
                    {senderNameLabel}
                    <ChatImageBubble imageUrl={message.image_url} isOwnMessage={isOwnMessage} />
                    {timestampRow}
                  </div>
                ) : message.live_location_lat != null && message.live_location_lng != null ? (
                  <div className="max-w-[85%]">
                    {senderNameLabel}
                    <ChatLocationBubble
                      latitude={message.live_location_lat}
                      longitude={message.live_location_lng}
                      isOwnMessage={isOwnMessage}
                    />
                    {timestampRow}
                  </div>
                ) : isMapMarkMessage ? (
                  <div className="max-w-[85%]">
                    {senderNameLabel}
                    <GroupMessageMapMarkCard body={message.body ?? ""} isOwnMessage={isOwnMessage} />
                  </div>
                ) : isPlaceMessage ? (
                  <div className="max-w-[85%]">
                    {senderNameLabel}
                    <GroupMessagePlaceCard body={message.body ?? ""} isOwnMessage={isOwnMessage} />
                  </div>
                ) : (
                  <div className="w-fit max-w-full">
                    {senderNameLabel}
                    <div
                      className={`w-fit max-w-full rounded-[22px] px-4 py-2.5 shadow-md shadow-black/20 ${
                        isOwnMessage
                          ? "rounded-br-md bg-primary/20 text-cyan-50"
                          : "rounded-bl-md border border-white/10 bg-[#0B1026] text-slate-100"
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-normal break-words text-[15px] leading-6">{message.body}</p>
                      {message.edited_at ? (
                        <span className="mt-0.5 block text-right text-[9.5px] uppercase tracking-wide text-slate-400/80">
                          {t("messageActions.edited")}
                        </span>
                      ) : null}
                    </div>
                  </div>
                );

                return (
                  <Fragment key={message.id}>
                    {showDateSeparator ? <ChatDateSeparator createdAt={message.created_at} /> : null}
                    <div className={`flex ${isOwnMessage ? "justify-end" : "justify-start"}`}>
                      {/* min-w-0 w-fit max-w-[80%] must live on this outermost box, not on bubbleContent's
                          own div — nesting two independent width:fit-content boxes breaks WebKit's
                          shrink-to-fit width computation for overflow-wrap:break-word text, causing
                          normal short words to wrap mid-word (e.g. "Привет" -> "При"/"вет") even with
                          plenty of room. bubbleContent is max-w-full precisely so only this box supplies
                          the cap. */}
                      <div className="min-w-0 w-fit max-w-[80%]">
                        <MessageLongPressZone
                          enabled={isOwnMessage && !isDeletedMessage && !isEditingThis && (canEditThis || canDeleteThis)}
                          onLongPress={() => setActionSheetMessageId(message.id)}
                        >
                          {bubbleContent}
                        </MessageLongPressZone>
                      </div>
                    </div>
                    <MessageActionSheet
                      isOpen={actionSheetMessageId === message.id}
                      onClose={() => setActionSheetMessageId(null)}
                      onEdit={canEditThis ? () => startEditingMessage(message) : undefined}
                      onDelete={canDeleteThis ? () => void handleDeleteMessage(message) : undefined}
                    />
                  </Fragment>
                );
              })
            )}
            <div ref={messagesEndRef} aria-hidden className="h-px w-full shrink-0" />
          </div>

          <div
            className="relative z-20 shrink-0"
            style={{ ...composerStyle, paddingBottom: dmComposerBottomPadding(isKeyboardOpenState) }}
          >
            <form
              onSubmit={(event) => void handleSend(event)}
              className="border-t border-white/10 bg-[#070b14]/95 px-3 pt-2.5 backdrop-blur-xl"
            >
              <ChatAttachmentMenu
                isOpen={attachmentMenuOpen}
                onClose={() => setAttachmentMenuOpen(false)}
                onSendPhoto={() => void handlePickAndSendPhotos()}
                onSendCurrentLocation={() => void handleSendCurrentLocation()}
              />
              <div className="relative flex items-end gap-2">
                <button
                  type="button"
                  disabled={!canSend || sending}
                  onClick={() => setAttachmentMenuOpen(true)}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-primary transition hover:border-primary/35 hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={t("chatAttach.title")}
                >
                  <Plus className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                </button>
                <textarea
                  ref={composerTextareaRef}
                  name="spotdrop-group-message"
                  autoComplete="off"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  disabled={!canSend}
                  placeholder={composerPlaceholder}
                  rows={1}
                  className="min-h-[48px] max-h-32 w-full resize-none rounded-2xl border border-white/10 bg-[#0d1322] px-4 py-3 text-sm text-white outline-none transition focus:border-primary/45 disabled:cursor-not-allowed disabled:opacity-60"
                />
                {draft.trim() ? (
                  <button
                    type="submit"
                    disabled={isSendDisabled}
                    className="shrink-0 rounded-2xl bg-primary px-4 py-3 text-xs font-semibold text-[#050816] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {sending ? "…" : t("common.send")}
                  </button>
                ) : (
                  <VoiceMessageRecorder disabled={!canSend || sending} onSend={(result) => void handleVoiceSend(result)} />
                )}
              </div>
              {sendError ? (
                <p className="mt-2 text-xs text-red-300">{sendError}</p>
              ) : null}
            </form>
          </div>
        </section>
      </DmChatThreadShell>
      <MessageActionErrorToast message={actionError} onDismiss={() => setActionError(null)} />
    </Shell>
  );
}
