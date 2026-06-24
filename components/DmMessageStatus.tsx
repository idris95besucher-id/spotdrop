"use client";

import { Check, CheckCheck } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import {
  formatOutgoingMessageMeta,
  type DmReceiptFields,
} from "@/lib/chatMessageStatus";

type DmMessageStatusProps = {
  message: DmReceiptFields;
  currentUserId: string;
  isOwnMessage: boolean;
  className?: string;
};

export default function DmMessageStatus({
  message,
  currentUserId,
  isOwnMessage,
  className = "",
}: DmMessageStatusProps) {
  const { t } = useI18n();

  if (!isOwnMessage) {
    return (
      <p className={`mt-1 text-[10px] text-muted ${className}`}>
        {formatOutgoingMessageMeta(message, currentUserId, t).sentTime}
      </p>
    );
  }

  const meta = formatOutgoingMessageMeta(message, currentUserId, t);
  const isRead = Boolean(message.read_at);

  const checksClass = isRead ? "text-primary" : "text-slate-400";

  return (
    <p
      className={`mt-1 flex items-center justify-end gap-1 text-[10px] text-primary/70 ${className}`}
      aria-label={
        isRead && meta.readTime
          ? `${meta.sentTime}, ${meta.statusLabel} ${meta.readTime}`
          : `${meta.sentTime}, ${meta.statusLabel}`
      }
    >
      <span>{meta.sentTime}</span>
      {isRead && meta.readTime ? (
        <span className="text-primary/80">
          · {meta.statusLabel} {meta.readTime}
        </span>
      ) : null}
      <span className={`inline-flex shrink-0 ${checksClass}`} aria-hidden>
        {isRead ? (
          <CheckCheck className="h-3 w-3" strokeWidth={2.5} />
        ) : (
          <Check className="h-3 w-3" strokeWidth={2.5} />
        )}
      </span>
    </p>
  );
}
