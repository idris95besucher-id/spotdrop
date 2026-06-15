"use client";

import { ChevronDown } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";

type ChatNewMessagesPillProps = {
  onClick: () => void;
  label?: string;
  className?: string;
};

export default function ChatNewMessagesPill({
  onClick,
  label,
  className = "",
}: ChatNewMessagesPillProps) {
  const { t } = useI18n();

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-[#0B1026]/95 px-4 py-2 text-xs font-semibold text-primary shadow-lg shadow-black/30 backdrop-blur-md transition hover:bg-primary/10 ${className}`}
    >
      {label ?? t("chats.newMessage")}
      <ChevronDown className="h-3.5 w-3.5" aria-hidden />
    </button>
  );
}
