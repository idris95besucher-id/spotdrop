"use client";

import { useEffect, useRef } from "react";
import { useI18n } from "@/components/I18nProvider";
import { SPOT_CAPTION_MAX_LENGTH, normalizeSpotCaption } from "@/lib/spotCaption";

type SpotCompactCaptionFieldProps = {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
};

const MIN_ROWS = 1;
const MAX_ROWS = 5;

export default function SpotCompactCaptionField({
  value,
  disabled = false,
  onChange,
}: SpotCompactCaptionFieldProps) {
  const { t } = useI18n();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const captionLength = value.length;

  useEffect(() => {
    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    textarea.style.height = "auto";
    const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight) || 20;
    const maxHeight = lineHeight * MAX_ROWS + 16;
    const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${Math.max(nextHeight, lineHeight + 16)}px`;
  }, [value]);

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        disabled={disabled}
        rows={MIN_ROWS}
        maxLength={SPOT_CAPTION_MAX_LENGTH}
        placeholder={t("spotEditor.captionPlaceholder")}
        onChange={(event) => onChange(normalizeSpotCaption(event.target.value))}
        className="w-full resize-none overflow-y-auto rounded-xl border-0 bg-white/[0.08] px-3.5 py-2.5 text-[15px] leading-snug text-white placeholder:text-white/40 ring-1 ring-white/12 transition focus:outline-none focus:ring-cyan-400/40 disabled:opacity-50 [-webkit-user-select:text] [user-select:text]"
      />
      {captionLength > SPOT_CAPTION_MAX_LENGTH - 50 ? (
        <span className="pointer-events-none absolute bottom-2 right-2.5 text-[10px] tabular-nums text-white/45">
          {captionLength}/{SPOT_CAPTION_MAX_LENGTH}
        </span>
      ) : null}
    </div>
  );
}
