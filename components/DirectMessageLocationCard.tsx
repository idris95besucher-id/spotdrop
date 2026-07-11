"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import ChatLocationCardPreview, {
  chatLocationCardPreviewFromPayload,
} from "@/components/ChatLocationCardPreview";
import DmMessageStatus from "@/components/DmMessageStatus";
import { useI18n } from "@/components/I18nProvider";
import { usePostViewerOptional } from "@/components/PostViewerProvider";
import type { DirectMessageRow } from "@/lib/directConversations";
import {
  locationCardSharePayloadToViewerItem,
  parseLocationCardShareMessage,
} from "@/lib/locationCardShareMessage";

type DirectMessageLocationCardProps = {
  body: string;
  isOwnMessage: boolean;
  currentUserId: string;
  message: Pick<DirectMessageRow, "created_at" | "delivered_at" | "read_at" | "sender_id">;
};

export default function DirectMessageLocationCard({
  body,
  isOwnMessage,
  currentUserId,
  message,
}: DirectMessageLocationCardProps) {
  const router = useRouter();
  const { t } = useI18n();
  const postViewer = usePostViewerOptional();
  const [opening, setOpening] = useState(false);
  const card = parseLocationCardShareMessage(body);

  const openSpot = async () => {
    if (!card || opening) {
      return;
    }

    setOpening(true);

    const item = locationCardSharePayloadToViewerItem(card, message.sender_id, {
      createdAt: message.created_at,
    });

    setOpening(false);

    if (postViewer) {
      postViewer.openPostViewer([item], {
        initialSpotId: item.id,
        initialMediaUrl: card.imageUrl,
      });
      return;
    }

    router.push(`/posts?id=${encodeURIComponent(item.id)}`);
  };

  if (!card) {
    return (
      <div
        className={`max-w-[85%] rounded-[22px] px-4 py-2.5 shadow-md shadow-black/20 ${
          isOwnMessage
            ? "rounded-br-md bg-primary/20 text-cyan-50"
            : "rounded-bl-md border border-white/10 bg-[#0B1026] text-slate-100"
        }`}
      >
        <p className="text-sm text-slate-300">{t("spotLocationCard.unavailable")}</p>
        {currentUserId ? (
          <DmMessageStatus message={message} currentUserId={currentUserId} isOwnMessage={isOwnMessage} />
        ) : null}
      </div>
    );
  }

  const preview = chatLocationCardPreviewFromPayload(card);

  return (
    <div
      className={`max-w-[85%] ${
        isOwnMessage ? "rounded-br-md" : "rounded-bl-md"
      }`}
    >
      <ChatLocationCardPreview
        imageUrl={preview.imageUrl}
        title={preview.title}
        locationLabel={preview.locationLabel}
        onPress={() => void openSpot()}
        disabled={opening}
      />

      {currentUserId ? (
        <div className={`mt-1 flex ${isOwnMessage ? "justify-end" : "justify-start"}`}>
          <DmMessageStatus message={message} currentUserId={currentUserId} isOwnMessage={isOwnMessage} />
        </div>
      ) : null}
    </div>
  );
}
