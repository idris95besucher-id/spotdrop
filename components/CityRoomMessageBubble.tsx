"use client";

import Link from "next/link";
import { Pencil, Trash2, UserRound } from "lucide-react";
import CityRoomPlaceCard from "@/components/CityRoomPlaceCard";
import { useI18n } from "@/components/I18nProvider";
import { formatChatMessageTime } from "@/lib/chatDates";
import { getCityRoomBubbleCornerClass } from "@/lib/cityRoomChatGrouping";
import { parseCityRoomMessageContent } from "@/lib/cityRoomPlaceMessage";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import { publicProfileUsername } from "@/lib/publicProfile";

export type CityRoomMessageProfile = {
  username: string;
  avatar_url?: string | null;
};

export type CityRoomMessageBubbleMessage = {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  edited_at?: string | null;
  profile: CityRoomMessageProfile | null;
};

type CityRoomMessageBubbleProps = {
  message: CityRoomMessageBubbleMessage;
  isOwnMessage: boolean;
  showSenderName: boolean;
  showAvatar: boolean;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
  isEditing?: boolean;
  isConfirmingDelete?: boolean;
  editDraft?: string;
  editError?: string | null;
  deleteError?: string | null;
  savingEdit?: boolean;
  deletingMessage?: boolean;
  onStartEdit?: () => void;
  onCancelEdit?: () => void;
  onSaveEdit?: () => void;
  onEditDraftChange?: (value: string) => void;
  onRequestDelete?: () => void;
  onCancelDelete?: () => void;
  onConfirmDelete?: () => void;
};

function AvatarPlaceholder({ profile }: { profile: CityRoomMessageProfile | null }) {
  return (
    <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-slate-800 text-[11px] font-semibold text-white ring-1 ring-white/10">
      {profile?.avatar_url ? (
        <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
      ) : profile?.username ? (
        publicProfileUsername(profile.username).charAt(0).toUpperCase()
      ) : (
        <UserRound className="h-3.5 w-3.5 text-slate-500" strokeWidth={1.5} aria-hidden />
      )}
    </div>
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
  isConfirmingDelete = false,
  editDraft = "",
  editError = null,
  deleteError = null,
  savingEdit = false,
  deletingMessage = false,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onEditDraftChange,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: CityRoomMessageBubbleProps) {
  const { t } = useI18n();
  const sender = message.profile;
  const parsedContent = parseCityRoomMessageContent(message.content);
  const isStructuredMessage = parsedContent.kind === "place" || parsedContent.kind === "image";
  const cornerClass = getCityRoomBubbleCornerClass(isFirstInGroup, isLastInGroup);
  const bubbleShellClass = `${cornerClass} bg-[#182232]/90 text-slate-100 shadow-sm shadow-black/20 ring-1 ring-white/5`;
  const displayName = sender ? publicProfileUsername(sender.username) : t("common.user");
  const localizedEditError = localizeUserMessage(t, editError);
  const localizedDeleteError = localizeUserMessage(t, deleteError);

  const renderBubbleBody = () => {
    if (isConfirmingDelete) {
      return (
        <div className={`${bubbleShellClass} px-3 py-2.5`}>
          <p className="text-sm font-medium text-slate-100">{t("rooms.message.deleteTitle")}</p>
          {localizedDeleteError ? <p className="mt-1.5 text-xs text-red-300">{localizedDeleteError}</p> : null}
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onConfirmDelete}
              disabled={deletingMessage}
              className="rounded-full bg-red-500 px-3 py-1 text-xs font-semibold text-white transition hover:bg-red-400 disabled:opacity-60"
            >
              {deletingMessage ? t("rooms.message.deleting") : t("common.delete")}
            </button>
            <button
              type="button"
              onClick={onCancelDelete}
              disabled={deletingMessage}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-200 transition hover:bg-white/10 disabled:opacity-60"
            >
              {t("common.cancel")}
            </button>
          </div>
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
      <div className={`group/bubble relative ${bubbleShellClass} px-2.5 py-1.5`}>
        <p className="whitespace-pre-wrap break-words pr-14 text-[15px] leading-[1.35]">{message.content}</p>
        <span className="absolute bottom-1.5 right-2 inline-flex items-center gap-1 text-[10px] leading-none text-slate-400">
          {message.edited_at ? <span className="text-[9px] uppercase tracking-wide opacity-80">{t("rooms.message.edited")}</span> : null}
          <span>{formatChatMessageTime(message.created_at)}</span>
        </span>
      </div>
    );
  };

  return (
    <article className="flex items-start justify-start gap-2">
      {showAvatar ? (
        <Link href={`/user?id=${message.user_id}`} className="mt-0.5 shrink-0">
          <AvatarPlaceholder profile={sender} />
        </Link>
      ) : (
        <div className="mt-0.5 w-8 shrink-0" aria-hidden />
      )}

      <div className="min-w-0 max-w-[min(88%,28rem)] flex-1">
        {showSenderName ? (
          <div className="mb-0.5 flex flex-wrap items-center gap-x-1.5 px-0.5">
            {isOwnMessage ? (
              <span className="text-xs font-semibold text-emerald-300">{t("common.you")}</span>
            ) : (
              <Link
                href={`/user?id=${message.user_id}`}
                className="text-xs font-semibold text-cyan-400 hover:text-cyan-300"
              >
                {displayName}
              </Link>
            )}
            {isOwnMessage ? (
              <span className="text-[11px] text-slate-500">· {displayName}</span>
            ) : null}
          </div>
        ) : null}

        {renderBubbleBody()}

        {isOwnMessage && isLastInGroup && !isEditing && !isConfirmingDelete ? (
          <div className="mt-0.5 flex gap-0.5 px-0.5">
            {!isStructuredMessage ? (
              <button
                type="button"
                onClick={onStartEdit}
                className="rounded-md p-0.5 text-slate-500 transition hover:bg-white/5 hover:text-slate-300"
                aria-label={t("rooms.message.edit")}
              >
                <Pencil className="h-3 w-3" strokeWidth={1.75} aria-hidden />
              </button>
            ) : null}
            <button
              type="button"
              onClick={onRequestDelete}
              className="rounded-md p-0.5 text-slate-500 transition hover:bg-red-500/10 hover:text-red-300"
              aria-label={t("rooms.message.delete")}
            >
              <Trash2 className="h-3 w-3" strokeWidth={1.75} aria-hidden />
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}
