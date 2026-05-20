type OfficialAIGuideBadgeProps = {
  className?: string;
};

export default function OfficialAIGuideBadge({ className = "" }: OfficialAIGuideBadgeProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border border-cyan-400/25 bg-cyan-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200 ${className}`}
    >
      Official AI Guide
    </span>
  );
}
