"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import CityRoomPlaceCard from "@/components/CityRoomPlaceCard";
import CityRoomMapMarkCard from "@/components/CityRoomMapMarkCard";
import ChatLocationCardPreview, {
  chatLocationCardPreviewFromPayload,
} from "@/components/ChatLocationCardPreview";
import ProfileAvatar from "@/components/ProfileAvatar";
import UsernameWithVerification from "@/components/UsernameWithVerification";
import { useI18n } from "@/components/I18nProvider";
import { usePostViewerOptional } from "@/components/PostViewerProvider";
import { formatChatMessageTime } from "@/lib/chatDates";
import { getCityRoomBubbleCornerClass } from "@/lib/cityRoomChatGrouping";
import { parseCityRoomMessageContent } from "@/lib/cityRoomPlaceMessage";
import {
  locationCardSharePayloadToViewerItem,
  type LocationCardSharePayload,
} from "@/lib/locationCardShareMessage";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import { publicProfileUsername } from "@/lib/publicProfile";
import { canDeleteMessage, canEditMessage } from "@/lib/messageEditWindow";
import { useLongPress } from "@/lib/useLongPress";
import MessageActionSheet from "@/components/chat/MessageActionSheet";
import DeletedMessageBubble from "@/components/chat/DeletedMessageBubble";
import VoiceMessagePlayer from "@/components/voice/VoiceMessagePlayer";
import ChatImageBubble from "@/components/chat/ChatImageBubble";
import ChatLocationBubble from "@/components/chat/ChatLocationBubble";

export type CityRoomMessageProfile = {
  username: string;
  avatar_url?: string | null;
  is_verified?: boolean | null;
};

export type CityRoomMessageBubbleMessage = {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  edited_at?: string | null;
  deleted_at?: string | null;
  profile: CityRoomMessageProfile | null;
  audio_url?: string | null;
  audio_duration_seconds?: number | null;
  audio_waveform?: number[] | null;
  image_url?: string | null;
  live_location_lat?: number | null;
  live_location_lng?: number | null;
  live_location_updated_at?: string | null;
  live_location_expires_at?: string | null;
};

type CityRoomMessageBubbleProps = {
  message: CityRoomMessageBubbleMessage;
  isOwnMessage: boolean;
  showSenderName: boolean;
  showAvatar: boolean;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
  isEditing?: boolean;
  editDraft?: string;
  editError?: string | null;
  savingEdit?: boolean;
  onStartEdit?: () => void;
  onCancelEdit?: () => void;
  onSaveEdit?: () => void;
  onEditDraftChange?: (value: string) => void;
  onDelete?: () => void;
};

function AvatarPlaceholder({ profile }: { profile: CityRoomMessageProfile | null }) {
  return (
    <ProfileAvatar
      src={profile?.avatar_url}
      sizeClassName="h-7 w-7"
      iconClassName="h-3.5 w-3.5"
      className="bg-slate-800/90 ring-1 ring-white/10"
    />
  );
}

export default function CityRoomMessageBubble({
  message,
  isOwnMessage,
  showSenderName,
  showAvatar,
  isFirstInGroup,
  isLastInGroup,
  isEditing = false,
  editDraft = "",
  editError = null,
  savingEdit = false,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onEditDraftChange,
  onDelete,
}: CityRoomMessageBubbleProps) {
  const router = useRouter();
  const { t } = useI18n();
  const postViewer = usePostViewerOptional();
  const [actionsOpen, setActionsOpen] = useState(false);
  const sender = message.profile;
  const isDeleted = Boolean(message.deleted_at);
  const parsedContent = parseCityRoomMessageContent(message.content);
  const isStructuredMessage =
    Boolean(message.audio_url) ||
    Boolean(message.image_url) ||
    Boolean(message.live_location_lat != null && message.live_location_lng != null) ||
    parsedContent.kind === "place" ||
    parsedContent.kind === "image" ||
    parsedContent.kind === "location_card" ||
    parsedContent.kind === "map_mark";
  const isMapMarkMessage = parsedContent.kind === "map_mark";
  const cornerClass = getCityRoomBubbleCornerClass(isFirstInGroup, isLastInGroup);
  const displayName = sender ? publicProfileUsername(sender.username) : t("common.user");
  const localizedEditError = localizeUserMessage(t, editError);

  const canOpenActions = isOwnMessage && !isDeleted && !isEditing && !isMapMarkMessage;
  const canEdit = canOpenActions && !isStructuredMessage && canEditMessage(message.created_at);
  const canDelete = canOpenActions && canDeleteMessage(message.created_at);

  const { longPressProps, onClickCapture } = useLongPress({
    onLongPress: () => {
      if (canOpenActions && (canEdit || canDelete)) {
        setActionsOpen(true);
      }
    },
    disabled: !canOpenActions,
  });

  const openLocationCard = (card: LocationCardSharePayload) => {
    const item = locationCardSharePayloadToViewerItem(card, message.user_id, {
      createdAt: message.created_at,
    });

    if (postViewer) {
      postViewer.openPostViewer([item], {
        initialSpotId: item.id,
        initialMediaUrl: card.imageUrl,
      });
      return;
    }

    router.push(`/posts?id=${encodeURIComponent(item.id)}`);
  };

  const renderBubbleBody = () => {
    if (isDeleted) {
      return <DeletedMessageBubble isOwnMessage={isOwnMessage} />;
    }

    if (message.audio_url) {
      return (
        <div className="inline-flex flex-col items-end">
          <VoiceMessagePlayer
            audioUrl={message.audio_url}
            durationSeconds={message.audio_duration_seconds ?? null}
            waveform={message.audio_waveform ?? null}
            isOwnMessage={isOwnMessage}
          />
          <span className="mt-1 text-[9.5px] leading-none text-slate-500">
            {formatChatMessageTime(message.created_at)}
          </span>
        </div>
      );
    }

    if (message.image_url) {
      return (
        <div className="inline-flex flex-col items-end">
          <ChatImageBubble imageUrl={message.image_url} isOwnMessage={isOwnMessage} />
          <span className="mt-1 text-[9.5px] leading-none text-slate-500">
            {formatChatMessageTime(message.created_at)}
          </span>
        </div>
      );
    }

    if (message.live_location_lat != null && message.live_location_lng != null) {
      return (
        <div className="inline-flex flex-col items-end">
          <ChatLocationBubble
            latitude={message.live_location_lat}
            longitude={message.live_location_lng}
            isOwnMessage={isOwnMessage}
          />
          <span className="mt-1 text-[9.5px] leading-none text-slate-500">
            {formatChatMessageTime(message.created_at)}
          </span>
        </div>
      );
    }

    if (parsedContent.kind === "place") {
      return (
        <CityRoomPlaceCard
          place={parsedContent.place}
          createdAt={message.created_at}
          editedAt={message.edited_at}
        />
      );
    }

    if (parsedContent.kind === "map_mark") {
      return (
        <CityRoomMapMarkCard
          mark={parsedContent.mark}
          profile={sender}
          userId={message.user_id}
          createdAt={message.created_at}
        />
      );
    }

    if (parsedContent.kind === "location_card") {
      const preview = chatLocationCardPreviewFromPayload(parsedContent.card);

      return (
        <div className="relative max-w-[14rem]">
          <ChatLocationCardPreview
            imageUrl={preview.imageUrl}
            title={preview.title}
            locationLabel={preview.locationLabel}
            onPress={() => openLocationCard(parsedContent.card)}
          />
          <span className="pointer-events-none absolute bottom-1 right-1 inline-flex items-center gap-1 rounded-full bg-[#0b1020]/80 px-1.5 py-0.5 text-[10px] leading-none text-slate-500">
            {message.edited_at ? (
              <span className="text-[9px] uppercase tracking-wide opacity-80">{t("messageActions.edited")}</span>
            ) : null}
            <span>{formatChatMessageTime(message.created_at)}</span>
          </span>
        </div>
      );
    }

    if (isEditing) {
      return (
        <div className={`${cornerClass} border border-cyan-400/35 bg-[#122033]/95 px-2.5 py-2 shadow-sm ring-1 ring-cyan-400/20`}>
          <textarea
            value={editDraft}
            onChange={(event) => onEditDraftChange?.(event.target.value)}
            disabled={savingEdit}
            rows={3}
            className="w-full resize-none rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-[15px] leading-6 text-white outline-none transition focus:border-cyan-400/50 disabled:opacity-60"
          />
          {localizedEditError ? <p className="mt-1.5 px-1 text-xs text-red-300">{localizedEditError}</p> : null}
          <div className="mt-2 flex flex-wrap gap-2 px-1">
            <button
              type="button"
              onClick={onSaveEdit}
              disabled={savingEdit || !editDraft.trim()}
              className="rounded-full bg-cyan-500 px-3 py-1 text-xs font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:opacity-60"
            >
              {savingEdit ? t("common.saving") : t("common.accept")}
            </button>
            <button
              type="button"
              onClick={onCancelEdit}
              disabled={savingEdit}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-200 transition hover:bg-white/10 disabled:opacity-60"
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      );
    }

    return (
      <div
        className={`group/bubble relative w-fit max-w-full rounded-[22px] px-4 py-2.5 shadow-md shadow-black/20 ${
          isOwnMessage
            ? "rounded-br-md bg-primary/20 text-cyan-50"
            : "rounded-bl-md border border-white/10 bg-[#0B1026] text-slate-100"
        }`}
      >
        <p className="whitespace-pre-wrap break-normal break-words text-[15px] leading-6">{message.content}</p>
        {message.edited_at ? (
          <span className="mt-0.5 block text-right text-[9.5px] uppercase tracking-wide text-slate-400/80">
            {t("messageActions.edited")}
          </span>
        ) : null}
        <div className={`flex ${isOwnMessage ? "justify-end" : "justify-start"}`}>
          <span className="mt-1 text-[10px] text-muted">{formatChatMessageTime(message.created_at)}</span>
        </div>
      </div>
    );
  };

  return (
    <article className={`flex items-start justify-start ${isMapMarkMessage ? "gap-0" : "gap-2"}`}>
      {isMapMarkMessage ? null : showAvatar ? (
        <Link href={`/user?id=${message.user_id}`} className="mt-0.5 shrink-0">
          <AvatarPlaceholder profile={sender} />
        </Link>
      ) : (
        <div className="mt-0.5 w-7 shrink-0" aria-hidden />
      )}

      <div className={`min-w-0 w-fit ${isMapMarkMessage ? "max-w-[min(92%,17.5rem)]" : "max-w-[min(80%,28rem)]"}`}>
        {!isMapMarkMessage && showSenderName ? (
          <div className="mb-0.5 flex flex-wrap items-center gap-x-1.5 px-0.5">
            {isOwnMessage ? (
              <span className="text-xs font-semibold text-emerald-300/90">{t("common.you")}</span>
            ) : (
              <Link
                href={`/user?id=${message.user_id}`}
                className="min-w-0 hover:text-white"
              >
                <UsernameWithVerification
                  username={displayName}
                  isVerified={sender?.is_verified}
                  className="text-xs font-semibold text-slate-300"
                  iconSize={12}
                />
              </Link>
            )}
            {isOwnMessage ? (
              <span className="text-[11px] text-slate-500">· {displayName}</span>
            ) : null}
          </div>
        ) : null}

        <div {...longPressProps} onClickCapture={onClickCapture} className="select-none touch-manipulation">
          {renderBubbleBody()}
        </div>
      </div>

      <MessageActionSheet
        isOpen={actionsOpen}
        onClose={() => setActionsOpen(false)}
        onEdit={canEdit ? onStartEdit : undefined}
        onDelete={canDelete ? onDelete : undefined}
      />
    </article>
  );
}
