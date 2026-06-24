import { formatChatMessageTime } from "@/lib/chatDates";
import type { TranslationKey } from "@/lib/i18n/messages";

export type DmReceiptFields = {
  sender_id: string;
  created_at: string;
  read_at?: string | null;
};

export type OutgoingDmStatus = "sent" | "read";

type TranslateFn = (key: TranslationKey, values?: Record<string, string | number>) => string;

/** Outgoing message receipt state for the current user (sender). WhatsApp-style: only read_at matters. */
export function getOutgoingMessageStatus(
  message: DmReceiptFields,
  currentUserId: string
): OutgoingDmStatus | null {
  if (message.sender_id !== currentUserId) {
    return null;
  }

  if (message.read_at) {
    return "read";
  }

  return "sent";
}

export function formatOutgoingMessageMeta(
  message: DmReceiptFields,
  currentUserId: string,
  t: TranslateFn
) {
  const status = getOutgoingMessageStatus(message, currentUserId);
  const sentTime = formatChatMessageTime(message.created_at);

  if (!status) {
    return { sentTime, statusLabel: null as string | null, readTime: null as string | null };
  }

  if (status === "read" && message.read_at) {
    const readTime = formatChatMessageTime(message.read_at);
    return {
      sentTime,
      statusLabel: t("dm.status.read"),
      readTime,
    };
  }

  return { sentTime, statusLabel: t("dm.status.sent"), readTime: null };
}
