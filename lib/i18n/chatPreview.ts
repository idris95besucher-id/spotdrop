import type { DirectMessageRow } from "@/lib/directConversations";
import { isSpotDirectMessage } from "@/lib/directConversations";
import { isLocationCardShareMessage } from "@/lib/locationCardShareMessage";
import type { TranslationKey } from "@/lib/i18n/messages";

type TranslateFn = (key: TranslationKey, values?: Record<string, string | number>) => string;

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

  const trimmed = (message.body ?? "").trim();

  if (!trimmed) {
    return t("chats.preview.message");
  }

  if (trimmed.length <= max) {
    return trimmed;
  }

  return `${trimmed.slice(0, max - 1)}…`;
}
