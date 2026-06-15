"use client";

import type { ReactNode } from "react";
import { Bookmark, Footprints, MessageCircle, type LucideIcon } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import type { SpotPublicStats } from "@/lib/spotRanking";

type SpotStatsBarProps = {
  stats: SpotPublicStats;
  className?: string;
  onCommentsClick?: () => void;
  /** Small stat labels before the count */
  showLabels?: boolean;
  /** Stats on dark image overlays (detail / profile grid) */
  tone?: "default" | "onDark";
  /** Plain text row for spot viewer under title */
  variant?: "icons" | "text";
};

const ICON_SIZE = 18;
const ICON_STROKE = 1.75;

function StatIcon({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center ${className}`} aria-hidden>
      {children}
    </span>
  );
}

type StatBlockProps = {
  icon: LucideIcon;
  count: number;
  label: string;
  showLabel: boolean;
  iconClass: string;
  countClass: string;
  labelClass: string;
  onClick?: () => void;
};

function StatBlock({
  icon: Icon,
  count,
  label,
  showLabel,
  iconClass,
  countClass,
  labelClass,
  onClick,
}: StatBlockProps) {
  const content = (
    <>
      <StatIcon className={iconClass}>
        <Icon size={ICON_SIZE} strokeWidth={ICON_STROKE} />
      </StatIcon>
      {showLabel ? <span className={labelClass}>{label}</span> : null}
      <span className={countClass}>{count}</span>
    </>
  );

  const layoutClass = "inline-flex items-center gap-1.5";

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${layoutClass} cursor-pointer transition hover:opacity-80`}
        aria-label={`${label} ${count}`}
      >
        {content}
      </button>
    );
  }

  return (
    <span className={layoutClass} aria-label={`${label} ${count}`}>
      {content}
    </span>
  );
}

export default function SpotStatsBar({
  stats,
  className = "",
  onCommentsClick,
  showLabels = false,
  tone = "default",
  variant = "icons",
}: SpotStatsBarProps) {
  const { t } = useI18n();
  const onDark = tone === "onDark";

  if (variant === "text") {
    return (
      <p
        className={`text-xs font-medium tabular-nums leading-relaxed ${
          onDark ? "text-white/70" : "text-muted"
        } ${className}`}
      >
        {t("spotStats.summary", {
          visited: stats.visited_count,
          comments: stats.comments_count,
          saved: stats.saved_count,
        })}
      </p>
    );
  }

  const iconClass = onDark ? "text-white/55" : "text-slate-400";
  const countClass = `text-sm font-semibold tabular-nums leading-none ${onDark ? "text-white" : "text-white"}`;
  const labelClass = `text-xs font-medium leading-none ${onDark ? "text-white/70" : "text-slate-400"}`;

  return (
    <div className={`flex flex-wrap items-center gap-x-5 gap-y-1 ${className}`}>
      <StatBlock
        icon={Footprints}
        count={stats.visited_count}
        label={t("spotStats.visited")}
        showLabel={showLabels}
        iconClass={iconClass}
        countClass={countClass}
        labelClass={labelClass}
      />
      <StatBlock
        icon={MessageCircle}
        count={stats.comments_count}
        label={t("spotStats.comments")}
        showLabel={showLabels}
        iconClass={iconClass}
        countClass={countClass}
        labelClass={labelClass}
        onClick={onCommentsClick}
      />
      <StatBlock
        icon={Bookmark}
        count={stats.saved_count}
        label={t("spotStats.saved")}
        showLabel={showLabels}
        iconClass={iconClass}
        countClass={countClass}
        labelClass={labelClass}
      />
    </div>
  );
}
