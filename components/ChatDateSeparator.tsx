import { formatChatDateLabel } from "@/lib/chatDates";

type ChatDateSeparatorProps = {
  createdAt: string;
};

export default function ChatDateSeparator({ createdAt }: ChatDateSeparatorProps) {
  const label = formatChatDateLabel(createdAt);

  if (!label) {
    return null;
  }

  return (
    <div className="flex justify-center py-1" role="separator" aria-label={label}>
      <span className="rounded-full bg-slate-800/90 px-3 py-1 text-[11px] font-medium tracking-wide text-slate-400 shadow-sm">
        {label}
      </span>
    </div>
  );
}
