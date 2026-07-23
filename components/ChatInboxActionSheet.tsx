"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/components/I18nProvider";
import { bottomSheetLayout, useBottomSheetScrollLock } from "@/lib/bottomSheetScrollLock";

export type ChatInboxActionSheetTarget =
  | {
      kind: "dm";
      title: string;
      isMuted: boolean;
    }
  | {
      kind: "room";
      title: string;
      isMuted: boolean;
    }
  | {
      kind: "group";
      title: string;
      isOwner: boolean;
    };

type ChatInboxActionSheetProps = {
  target: ChatInboxActionSheetTarget | null;
  onClose: () => void;
  onToggleMute: () => void;
  onRemove: () => void;
};

export default function ChatInboxActionSheet({
  target,
  onClose,
  onToggleMute,
  onRemove,
}: ChatInboxActionSheetProps) {
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const isOpen = Boolean(target);

  useBottomSheetScrollLock(isOpen);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setConfirmRemove(false);
  }, [target]);

  if (!isOpen || !target || !mounted) {
    return null;
  }

  const muteLabel = target.kind !== "group" && target.isMuted ? t("chats.unmuteNotifications") : t("chats.muteNotifications");
  const removeLabel =
    target.kind === "dm"
      ? t("chats.deleteChat")
      : target.kind === "group"
        ? target.isOwner
          ? t("group.deleteGroup")
          : t("group.leaveGroup")
        : t("chats.removeFromMessages");

  const needsConfirm = true;
  const confirmTitle =
    target.kind === "dm"
      ? t("chats.deleteConversationConfirmTitle")
      : target.kind === "group"
        ? target.isOwner
          ? t("group.deleteConfirmTitle")
          : t("group.leaveConfirmTitle")
        : t("chats.removeRoomConfirmTitle");
  const confirmBody =
    target.kind === "dm"
      ? t("chats.deleteConversationConfirmBody")
      : target.kind === "group"
        ? target.isOwner
          ? t("group.deleteConfirmBody")
          : t("group.leaveConfirmBody")
        : t("chats.removeRoomConfirmBody");
  const confirmAction =
    target.kind === "dm"
      ? t("chats.deleteConversationConfirmAction")
      : target.kind === "group"
        ? target.isOwner
          ? t("group.deleteConfirmAction")
          : t("group.leaveConfirmAction")
        : t("chats.removeRoomConfirmAction");

  const sheet = (
    <div className={bottomSheetLayout.overlay} role="presentation">
      <button
        type="button"
        className={bottomSheetLayout.backdrop}
        aria-label={t("common.close")}
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-inbox-actions-title"
        data-bottom-sheet-panel=""
        className={`${bottomSheetLayout.panel} select-none touch-manipulation`}
        style={{ WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
        onClick={(event) => event.stopPropagation()}
      >
        {confirmRemove && needsConfirm ? (
          <>
            <div className="border-b border-white/10 px-5 py-4">
              <h2 id="chat-inbox-actions-title" className="text-base font-semibold text-white">
                {confirmTitle}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{confirmBody}</p>
            </div>

            <div className="space-y-1 p-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={() => {
                  onRemove();
                  setConfirmRemove(false);
                  onClose();
                }}
                className="block w-full rounded-2xl px-4 py-3.5 text-left text-sm font-medium text-red-300 transition hover:bg-red-500/10 active:bg-red-500/15"
              >
                {confirmAction}
              </button>
              <button
                type="button"
                onClick={() => setConfirmRemove(false)}
                className="block w-full rounded-2xl px-4 py-3.5 text-left text-sm font-medium text-slate-300 transition hover:bg-white/5 active:bg-white/10"
              >
                {t("common.cancel")}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="border-b border-white/10 px-5 py-4">
              <h2 id="chat-inbox-actions-title" className="truncate text-base font-semibold text-white">
                {target.title}
              </h2>
            </div>

            <div className="space-y-1 p-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {target.kind !== "group" ? (
                <button
                  type="button"
                  onClick={() => {
                    onToggleMute();
                    onClose();
                  }}
                  className="block w-full rounded-2xl px-4 py-3.5 text-left text-sm font-medium text-white transition hover:bg-white/5 active:bg-white/10"
                >
                  {muteLabel}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  if (needsConfirm) {
                    setConfirmRemove(true);
                    return;
                  }

                  onRemove();
                  onClose();
                }}
                className="block w-full rounded-2xl px-4 py-3.5 text-left text-sm font-medium text-red-300 transition hover:bg-red-500/10 active:bg-red-500/15"
              >
                {removeLabel}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="block w-full rounded-2xl px-4 py-3.5 text-left text-sm font-medium text-slate-300 transition hover:bg-white/5 active:bg-white/10"
              >
                {t("common.cancel")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}
