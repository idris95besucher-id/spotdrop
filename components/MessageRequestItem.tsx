"use client";

import Link from "next/link";
import { useState } from "react";
import { UserRound } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import {
  acceptConversationRequest,
  declineConversationRequest,
} from "@/lib/directConversations";
import { CHATS_INBOX_REFRESH_EVENT, type ChatPreviewMessage } from "@/lib/chatsInbox";
import { formatChatPreview } from "@/lib/i18n/chatPreview";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import { dmThreadHref } from "@/lib/chatThreadRoutes";
import { publicProfileUsername } from "@/lib/publicProfile";

export type MessageRequestItemData = {
  conversationId: string;
  partnerId: string;
  username: string;
  avatarUrl: string | null;
  previewMessage: ChatPreviewMessage | null;
  requestedAt: string;
};

type MessageRequestItemProps = {
  request: MessageRequestItemData;
  viewerUserId: string;
  onResolved: () => void;
};

function formatRequestTime(createdAt: string) {
  const date = new Date(createdAt);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function MessageRequestItem({ request, viewerUserId, onResolved }: MessageRequestItemProps) {
  const { t } = useI18n();
  const [acting, setActing] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const preview = request.previewMessage
    ? formatChatPreview(request.previewMessage, t)
    : t("chats.preview.request");

  const handleAccept = async () => {
    setActing("accept");
    setError(null);

    const result = await acceptConversationRequest(request.conversationId, viewerUserId);

    if (result.error) {
      setError(result.error);
      setActing(null);
      return;
    }

    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(CHATS_INBOX_REFRESH_EVENT));
    }

    onResolved();
  };

  const handleDecline = async () => {
    setActing("decline");
    setError(null);

    const result = await declineConversationRequest(request.conversationId, viewerUserId);

    if (result.error) {
      setError(result.error);
      setActing(null);
      return;
    }

    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(CHATS_INBOX_REFRESH_EVENT));
    }

    onResolved();
  };

  return (
    <li className="rounded-2xl border border-white/[0.08] bg-[#0B1026] p-4">
      <div className="flex items-start gap-3">
        <Link
          href={dmThreadHref(request.partnerId)}
          className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/[0.06]"
        >
          {request.avatarUrl ? (
            <img src={request.avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <UserRound className="h-5 w-5 text-muted" strokeWidth={1.75} aria-hidden />
          )}
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <Link href={dmThreadHref(request.partnerId)} className="min-w-0">
              <p className="truncate font-semibold text-white">
                {publicProfileUsername(request.username)}
              </p>
              <p className="mt-0.5 text-[11px] text-muted">{formatRequestTime(request.requestedAt)}</p>
            </Link>
          </div>

          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-slate-300">{preview}</p>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={acting !== null}
              onClick={() => void handleAccept()}
              className="inline-flex min-w-[5.5rem] flex-1 items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-[#050816] transition hover:brightness-110 disabled:opacity-50 sm:flex-none"
            >
              {acting === "accept" ? "…" : t("common.accept")}
            </button>
            <button
              type="button"
              disabled={acting !== null}
              onClick={() => void handleDecline()}
              className="inline-flex min-w-[5.5rem] flex-1 items-center justify-center rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/5 disabled:opacity-50 sm:flex-none"
            >
              {acting === "decline" ? "…" : t("common.decline")}
            </button>
          </div>

          {error ? (
            <p className="mt-2 text-xs text-red-300">{localizeUserMessage(t, error) ?? error}</p>
          ) : null}
        </div>
      </div>
    </li>
  );
}
