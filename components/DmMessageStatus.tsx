"use client";

import { Check, CheckCheck } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import {
  formatOutgoingMessageMeta,
  getOutgoingMessageStatus,
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

  const status = getOutgoingMessageStatus(message, currentUserId);
  const meta = formatOutgoingMessageMeta(message, currentUserId, t);

  if (!status) {
    return null;
  }

  const checksClass =
    status === "read" ? "text-primary" : status === "delivered" ? "text-slate-300" : "text-slate-400";

  return (
    <p
      className={`mt-1 flex items-center justify-end gap-1 text-[10px] text-primary/70 ${className}`}
      aria-label={
        status === "read" && meta.readTime
          ? `${meta.sentTime}, ${meta.statusLabel} ${meta.readTime}`
          : `${meta.sentTime}, ${meta.statusLabel}`
      }
    >
      <span>{meta.sentTime}</span>
      {status === "read" && meta.readTime ? (
        <span className="text-primary/80">
          · {meta.statusLabel} {meta.readTime}
        </span>
      ) : null}
      <span className={`inline-flex shrink-0 ${checksClass}`} aria-hidden>
        {status === "sent" ? (
          <Check className="h-3 w-3" strokeWidth={2.5} />
        ) : (
          <CheckCheck className="h-3 w-3" strokeWidth={2.5} />
        )}
      </span>
    </p>
  );
}
