"use client";

import { EyeOff } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";

type DeletedMessageBubbleProps = {
  isOwnMessage: boolean;
};

/** Replaces any deleted message's content, in DM/group/City Room alike. */
export default function DeletedMessageBubble({ isOwnMessage }: DeletedMessageBubbleProps) {
  const { t } = useI18n();

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-2xl px-3 py-2 text-[13px] italic text-slate-400 ring-1 ring-white/10 ${
        isOwnMessage ? "rounded-br-md bg-[#101a2c]/70" : "rounded-bl-md bg-[#101a2c]/70"
      }`}
    >
      <EyeOff className="h-3.5 w-3.5 shrink-0 opacity-70" strokeWidth={1.75} aria-hidden />
      {t("messageActions.deletedPlaceholder")}
    </div>
  );
}
