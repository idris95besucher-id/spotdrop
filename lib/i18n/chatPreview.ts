import type { DirectMessageRow } from "@/lib/directConversations";
import { isSpotDirectMessage } from "@/lib/directConversations";
import { isLocationCardShareMessage } from "@/lib/locationCardShareMessage";
import { isCityRoomStructuredMessage, parseCityRoomMessageContent } from "@/lib/cityRoomPlaceMessage";
import { isGroupSystemEventMessage } from "@/lib/groupChatSystemEvents";
import type { TranslationKey } from "@/lib/i18n/messages";

type TranslateFn = (key: TranslationKey, values?: Record<string, string | number>) => string;

/** Inbox-row preview for a group's last message — no username lookups, so system events render generically. */
export function formatGroupChatPreview(
  lastMessage: string | null,
  lastMessageType: "text" | "system" | null,
  t: TranslateFn,
  max = 100
) {
  if (!lastMessage) {
    return t("chats.preview.message");
  }

  if (lastMessageType === "system" && isGroupSystemEventMessage(lastMessage)) {
    return t("chats.preview.groupUpdated");
  }

  if (lastMessageType === "text") {
    const parsed = parseCityRoomMessageContent(lastMessage);

    if (parsed.kind === "map_mark") {
      return t("chats.preview.sharedMark");
    }

    if (parsed.kind === "place") {
      return t("chats.preview.sharedPlace", { name: parsed.place.name });
    }
  }

  const trimmed = lastMessage.trim();

  if (!trimmed) {
    return t("chats.preview.message");
  }

  if (trimmed.length <= max) {
    return trimmed;
  }

  return `${trimmed.slice(0, max - 1)}…`;
}

export function formatChatPreview(
  message: Pick<DirectMessageRow, "body" | "message_type" | "spot_share_id" | "post_id">,
  t: TranslateFn,
  max = 100
) {
  if (isSpotDirectMessage(message)) {
    return t("chats.preview.sharedSpot");
  }

  if (
    message.message_type === "spot_share_request" ||
    (message.spot_share_id && message.message_type !== "spot_share_accepted")
  ) {
    return t("chats.preview.checkspot");
  }

  if (message.message_type === "spot_share_accepted") {
    return t("chats.preview.checkspotAccepted");
  }

  if (isLocationCardShareMessage(message.body)) {
    return t("chats.preview.locationCard");
  }

  if (isCityRoomStructuredMessage(message.body ?? "")) {
    const parsed = parseCityRoomMessageContent(message.body ?? "");

    if (parsed.kind === "map_mark") {
      return t("chats.preview.sharedMark");
    }

    if (parsed.kind === "place") {
      return t("chats.preview.sharedPlace", { name: parsed.place.name });
    }
  }

  const trimmed = (message.body ?? "").trim();

  if (!trimmed) {
    return t("chats.preview.message");
  }

  if (trimmed.length <= max) {
    return trimmed;
  }

  return `${trimmed.slice(0, max - 1)}…`;
}
