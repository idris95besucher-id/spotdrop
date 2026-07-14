"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  AlignCenter,
  AlignLeft,
  AlignRight,
  Check,
  ChevronDown,
  Type,
} from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import SpotDropSpotsIcon from "@/components/icons/SpotDropSpotsIcon";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import { bottomSheetLayout, useBottomSheetScrollLock } from "@/lib/bottomSheetScrollLock";
import {
  getSpotTextCardTemplate,
  SPOT_LOCATION_CARD_FONT_STYLES,
  SPOT_TEXT_CARD_TEMPLATES,
  spotLocationCardFontCss,
  type SpotLocationCardFontStyle,
  type SpotTextCardAlign,
  type SpotTextCardFontSize,
  type SpotTextCardTemplateId,
} from "@/lib/spotLocationCardStyles";

const QUICK_EMOJIS = ["📍", "✨", "🔥", "💙", "🌙", "🌊", "🏔", "🚨", "☕", "🎉"];

type SpotTextCardEditorScreenProps = {
  locationLabel: string;
  cardText: string;
  templateId: SpotTextCardTemplateId;
  fontStyle: SpotLocationCardFontStyle;
  fontSize: SpotTextCardFontSize;
  align: SpotTextCardAlign;
  error?: string | null;
  publishing?: boolean;
  onCardTextChange: (value: string) => void;
  onTemplateChange: (id: SpotTextCardTemplateId) => void;
  onFontStyleChange: (style: SpotLocationCardFontStyle) => void;
  onFontSizeChange: (size: SpotTextCardFontSize) => void;
  onAlignChange: (align: SpotTextCardAlign) => void;
  onBack: () => void;
  onContinue: () => void;
  onSwitchToPhoto: () => void;
};

export default function SpotTextCardEditorScreen({
  locationLabel,
  cardText,
  templateId,
  fontStyle,
  fontSize,
  align,
  error = null,
  publishing = false,
  onCardTextChange,
  onTemplateChange,
  onFontStyleChange,
  onFontSizeChange,
  onAlignChange,
  onBack,
  onContinue,
  onSwitchToPhoto,
}: SpotTextCardEditorScreenProps) {
  const { t } = useI18n();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [modeSwipeStartX, setModeSwipeStartX] = useState<number | null>(null);
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const template = useMemo(() => getSpotTextCardTemplate(templateId), [templateId]);
  const localizedError = localizeUserMessage(t, error);

  useBottomSheetScrollLock(themePickerOpen);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => textareaRef.current?.focus(), 280);
    return () => window.clearTimeout(timeoutId);
  }, []);

  const insertEmoji = useCallback(
    (emoji: string) => {
      const next = `${cardText}${cardText && !cardText.endsWith(" ") ? " " : ""}${emoji}`.slice(0, 280);
      onCardTextChange(next);
      textareaRef.current?.focus();
    },
    [cardText, onCardTextChange]
  );

  const selectTheme = useCallback(
    (id: SpotTextCardTemplateId) => {
      const next = getSpotTextCardTemplate(id);
      onTemplateChange(id);
      onFontStyleChange(next.defaultFont);
      onAlignChange(next.defaultAlign);
      setThemePickerOpen(false);
    },
    [onAlignChange, onFontStyleChange, onTemplateChange]
  );

  const previewFontSize =
    fontSize === "sm" ? "text-[1.35rem]" : fontSize === "lg" ? "text-[2.05rem]" : "text-[1.7rem]";
  const previewAlign =
    align === "left" ? "text-left" : align === "right" ? "text-right" : "text-center";

  const backgroundStyle =
    typeof template.background === "string"
      ? { background: template.background }
      : {
          background: `linear-gradient(145deg, ${template.background[0]}, ${template.background[1]}${
            template.background[2] ? `, ${template.background[2]}` : ""
          })`,
        };

  const themeSheet =
    themePickerOpen && typeof document !== "undefined"
      ? createPortal(
          <div className="fixed inset-0 z-[150] flex items-end justify-center overscroll-none" role="presentation">
            <button
              type="button"
              className={bottomSheetLayout.backdrop}
              aria-label={t("common.close")}
              onClick={() => setThemePickerOpen(false)}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="spot-text-theme-title"
              data-bottom-sheet-panel=""
              className={`${bottomSheetLayout.panel} select-none touch-manipulation`}
              style={{ WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex justify-center pt-3 pb-1">
                <span className="h-1 w-10 rounded-full bg-white/20" aria-hidden />
              </div>
              <div className="border-b border-white/10 px-5 pb-3 pt-1">
                <h2 id="spot-text-theme-title" className="text-base font-semibold text-white">
                  Theme
                </h2>
                <p className="mt-1 text-sm text-white/50">Choose a look for your Text Card</p>
              </div>

              <div
                data-bottom-sheet-scroll=""
                className={`${bottomSheetLayout.scroll} px-2 py-2`}
                style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
              >
                {SPOT_TEXT_CARD_TEMPLATES.map((item) => {
                  const selected = item.id === templateId;
                  const chipBg =
                    typeof item.background === "string"
                      ? item.background
                      : `linear-gradient(135deg, ${item.background[0]}, ${item.background[1]})`;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => selectTheme(item.id)}
                      className={`mb-1 flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${
                        selected ? "bg-white/10" : "hover:bg-white/5 active:bg-white/8"
                      }`}
                    >
                      <span
                        className="h-11 w-11 shrink-0 rounded-xl ring-1 ring-white/15"
                        style={{ background: chipBg }}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 text-sm font-semibold text-white">{item.label}</span>
                      {selected ? (
                        <Check className="h-4 w-4 shrink-0 text-cyan-300" strokeWidth={2.5} aria-hidden />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div
      className="fixed inset-0 z-[130] flex flex-col bg-black text-white select-none"
      style={{ WebkitTapHighlightColor: "transparent" }}
      onTouchStart={(event) => {
        if (themePickerOpen) {
          return;
        }
        setModeSwipeStartX(event.changedTouches[0]?.clientX ?? null);
      }}
      onTouchEnd={(event) => {
        if (themePickerOpen || modeSwipeStartX == null) {
          return;
        }

        const endX = event.changedTouches[0]?.clientX ?? modeSwipeStartX;
        const delta = endX - modeSwipeStartX;
        setModeSwipeStartX(null);

        if (delta > 70) {
          onSwitchToPhoto();
        }
      }}
    >
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
      >
        <button
          type="button"
          onClick={onBack}
          disabled={publishing}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition active:scale-95 disabled:opacity-50"
          aria-label={t("common.back")}
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={2} aria-hidden />
        </button>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/70">Text</p>
        <button
          type="button"
          onClick={onContinue}
          disabled={publishing || !cardText.trim()}
          className="rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 transition active:scale-95 disabled:opacity-40"
        >
          {publishing ? t("common.saving") : t("spotEditor.next")}
        </button>
      </div>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col overflow-y-auto px-4 pb-3">
        <div
          className="relative mx-auto aspect-[4/5] w-full max-w-[22rem] overflow-hidden rounded-[1.75rem] shadow-2xl shadow-black/50 ring-1 ring-white/10"
          style={backgroundStyle}
        >
          <div className="absolute inset-0 flex flex-col px-6 pb-8 pt-10">
            <div className="flex flex-col items-center">
              <SpotDropSpotsIcon
                className="h-8 w-8"
                style={{ color: template.accentColor }}
                strokeWidth={1.5}
                aria-hidden
              />
              <p
                className="mt-2 text-[11px] font-bold uppercase tracking-[0.2em]"
                style={{ color: template.mutedColor }}
              >
                SpotDrop
              </p>
            </div>

            <textarea
              ref={textareaRef}
              value={cardText}
              maxLength={280}
              disabled={publishing}
              onChange={(event) => onCardTextChange(event.target.value.slice(0, 280))}
              placeholder={t("spotLocationCard.placeholder")}
              className={`mt-8 min-h-[9rem] flex-1 resize-none bg-transparent outline-none placeholder:opacity-40 ${previewFontSize} ${previewAlign} ${spotLocationCardFontCss(fontStyle)}`}
              style={{ color: template.textColor }}
            />

            <div className="mt-auto border-t border-white/15 pt-4 text-center">
              <p
                className="text-[10px] font-medium uppercase tracking-[0.16em]"
                style={{ color: template.mutedColor }}
              >
                {t("spotLocationCard.savedAt")}
              </p>
              <p className="mt-1 text-sm font-semibold" style={{ color: template.textColor }}>
                {locationLabel || t("map.selectedLocation")}
              </p>
            </div>
          </div>
        </div>

        {localizedError ? <p className="mt-3 text-center text-xs text-red-300">{localizedError}</p> : null}

        <div className="mt-4 space-y-3">
          <button
            type="button"
            disabled={publishing}
            onClick={() => setThemePickerOpen(true)}
            className="flex h-12 w-full items-center justify-between rounded-2xl bg-white/10 px-4 text-left ring-1 ring-white/12 transition hover:bg-white/14 active:scale-[0.99] disabled:opacity-50"
            aria-haspopup="dialog"
            aria-expanded={themePickerOpen}
          >
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-white/50">Theme</span>
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-white">
              {template.label}
              <ChevronDown className="h-4 w-4 text-white/55" aria-hidden />
            </span>
          </button>

          <div className="flex items-center gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {SPOT_LOCATION_CARD_FONT_STYLES.map((style) => (
              <button
                key={style}
                type="button"
                onClick={() => onFontStyleChange(style)}
                className={`h-9 shrink-0 rounded-full px-3.5 text-xs font-semibold capitalize transition ${
                  fontStyle === style ? "bg-white text-slate-950" : "bg-white/10 text-white/80"
                }`}
              >
                {style}
              </button>
            ))}
            {(["sm", "md", "lg"] as const).map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => onFontSizeChange(size)}
                className={`flex h-9 shrink-0 items-center rounded-full px-3.5 text-xs font-semibold uppercase transition ${
                  fontSize === size ? "bg-cyan-400/90 text-slate-950" : "bg-white/10 text-white/80"
                }`}
              >
                <Type className="mr-1 inline h-3 w-3" aria-hidden />
                {size}
              </button>
            ))}
            {(
              [
                ["left", AlignLeft],
                ["center", AlignCenter],
                ["right", AlignRight],
              ] as const
            ).map(([value, Icon]) => (
              <button
                key={value}
                type="button"
                onClick={() => onAlignChange(value)}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition ${
                  align === value ? "bg-white text-slate-950" : "bg-white/10 text-white/80"
                }`}
                aria-label={value}
              >
                <Icon className="h-4 w-4" aria-hidden />
              </button>
            ))}
          </div>

          <div className="flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => insertEmoji(emoji)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-lg transition active:scale-95"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div
        className="shrink-0 border-t border-white/10 bg-black/90 px-4 pt-3"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)" }}
      >
        <div className="mb-1 flex items-center justify-center gap-12">
          <button
            type="button"
            onClick={onSwitchToPhoto}
            className="relative pb-1.5 text-[11px] font-bold uppercase tracking-[0.22em] text-white/45"
          >
            Camera
          </button>
          <button
            type="button"
            className="relative pb-1.5 text-[11px] font-bold uppercase tracking-[0.22em] text-white"
          >
            Text
            <span className="absolute inset-x-0 -bottom-0.5 mx-auto h-0.5 w-5 rounded-full bg-white" />
          </button>
        </div>
      </div>

      {themeSheet}
    </div>
  );
}
