"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import SpotDropSpotsIcon from "@/components/icons/SpotDropSpotsIcon";
import SpotVideoPreviewExitSheet from "@/components/SpotVideoPreviewExitSheet";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import { useSpotLocationCardEditorKeyboard } from "@/lib/useSpotLocationCardEditorKeyboard";
import {
  SPOT_LOCATION_CARD_FONT_STYLES,
  spotLocationCardFontCss,
  type SpotLocationCardFontStyle,
} from "@/lib/spotLocationCardStyles";

type SpotLocationTextCardEditorScreenProps = {
  locationLabel: string;
  cardText: string;
  cardFontStyle: SpotLocationCardFontStyle;
  error: string | null;
  saving?: boolean;
  onCardTextChange: (value: string) => void;
  onCardFontStyleChange: (style: SpotLocationCardFontStyle) => void;
  onBack: () => void;
  onSave: () => void;
  onSendTo?: () => void;
};

export default function SpotLocationTextCardEditorScreen({
  locationLabel,
  cardText,
  cardFontStyle,
  error,
  saving = false,
  onCardTextChange,
  onCardFontStyleChange,
  onBack,
  onSave,
  onSendTo,
}: SpotLocationTextCardEditorScreenProps) {
  const { t } = useI18n();
  const [showExitSheet, setShowExitSheet] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const blurTimeoutRef = useRef<number | null>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const toolsRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const localizedError = localizeUserMessage(t, error);

  const {
    isKeyboardOpen,
    keyboardBottom,
    cardStageHeight,
    cardScale,
    cardTranslateY,
    transition,
    scheduleCaretSync,
  } = useSpotLocationCardEditorKeyboard({
    isEditing,
    textareaRef,
    headerRef,
    toolsRef,
    cardRef,
  });

  const fontStyleLabels = useMemo(
    () => ({
      classic: t("spotLocationCard.fontClassic"),
      bold: t("spotLocationCard.fontBold"),
      elegant: t("spotLocationCard.fontElegant"),
      mono: t("spotLocationCard.fontMono"),
    }),
    [t]
  );

  const handleTextareaFocus = useCallback(() => {
    if (blurTimeoutRef.current !== null) {
      window.clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }

    setIsEditing(true);
    scheduleCaretSync();
  }, [scheduleCaretSync]);

  const handleTextareaBlur = useCallback(() => {
    if (blurTimeoutRef.current !== null) {
      window.clearTimeout(blurTimeoutRef.current);
    }

    blurTimeoutRef.current = window.setTimeout(() => {
      const active = document.activeElement;

      if (active === textareaRef.current || toolsRef.current?.contains(active)) {
        return;
      }

      setIsEditing(false);
    }, 120);
  }, []);

  const handleTextareaChange = useCallback(
    (value: string) => {
      onCardTextChange(value);
      scheduleCaretSync();
    },
    [onCardTextChange, scheduleCaretSync]
  );

  const cardTransformStyle = {
    transform: `translateY(${cardTranslateY}px) scale(${cardScale})`,
    transition: `transform ${transition}`,
    transformOrigin: "center center",
  } as const;

  const toolsPanelStyle = isKeyboardOpen
    ? {
        position: "fixed" as const,
        left: 0,
        right: 0,
        bottom: keyboardBottom,
        zIndex: 40,
        paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
        background:
          "linear-gradient(to top, rgba(3, 7, 18, 0.98) 72%, rgba(3, 7, 18, 0.88) 88%, rgba(3, 7, 18, 0))",
        transition: `bottom ${transition}`,
      }
    : {
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
      };

  const fontStyleButtons = (
    <div
      className={
        isKeyboardOpen
          ? "flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          : "flex flex-wrap gap-2"
      }
    >
      {SPOT_LOCATION_CARD_FONT_STYLES.map((style) => (
        <button
          key={style}
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onCardFontStyleChange(style)}
          className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold transition ${
            cardFontStyle === style
              ? "bg-cyan-400/18 text-cyan-100 ring-1 ring-cyan-300/35"
              : "bg-white/8 text-white/65 hover:bg-white/12"
          } ${spotLocationCardFontCss(style)}`}
        >
          {fontStyleLabels[style]}
        </button>
      ))}
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-[130] flex flex-col overflow-hidden bg-[#030712] text-white select-none"
      style={{ WebkitTapHighlightColor: "transparent" }}
    >
      <div
        ref={headerRef}
        className="shrink-0 border-b border-white/8 px-4 py-3"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowExitSheet(true)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/8 text-white transition hover:bg-white/12"
            aria-label={t("spotEditor.close")}
          >
            <ArrowLeft className="h-5 w-5" strokeWidth={2} aria-hidden />
          </button>

          <p className="text-sm font-semibold text-white/90">{t("spotLocationCard.textCardTitle")}</p>

          <div className="flex items-center gap-2">
            {onSendTo ? (
              <button
                type="button"
                disabled={saving}
                onClick={onSendTo}
                className="inline-flex h-10 items-center rounded-full border border-white/15 bg-white/8 px-3.5 text-sm font-semibold text-white transition hover:bg-white/12 disabled:opacity-50"
              >
                {t("spotLocationCard.sendTo")}
              </button>
            ) : null}
            <button
              type="button"
              disabled={saving}
              onClick={onSave}
              className="inline-flex h-10 items-center gap-0.5 rounded-full bg-primary px-3.5 text-sm font-semibold text-[#050816] transition hover:brightness-110 disabled:opacity-50"
            >
              {t("spotEditor.saveSpot")}
              <ChevronRight className="h-4 w-4" strokeWidth={2.5} aria-hidden />
            </button>
          </div>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          className={
            isKeyboardOpen
              ? "flex shrink-0 items-center justify-center overflow-hidden px-4 py-2"
              : "min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5"
          }
          style={
            isKeyboardOpen && cardStageHeight
              ? {
                  height: `${cardStageHeight}px`,
                  transition: `height ${transition}`,
                }
              : undefined
          }
        >
          <div
            ref={cardRef}
            className="relative mx-auto aspect-[4/5] w-full max-w-md overflow-hidden rounded-[1.75rem] border border-white/10 bg-gradient-to-br from-slate-900 via-[#0B1026] to-[#050816] shadow-2xl shadow-black/40"
            style={isKeyboardOpen ? cardTransformStyle : undefined}
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_22%,rgba(34,211,238,0.1),transparent_50%)]" />
            <div className="pointer-events-none absolute inset-4 rounded-[1.25rem] border border-white/8" />

            <div className="relative flex h-full flex-col items-center px-6 pb-4 pt-14 text-center">
              <SpotDropSpotsIcon
                className={`text-cyan-300 [filter:drop-shadow(0_0_10px_rgba(34,211,238,0.28))] ${
                  isKeyboardOpen ? "h-7 w-7" : "h-8 w-8"
                }`}
                strokeWidth={1.5}
                aria-hidden
              />
              <p
                className={`mt-1 font-semibold tracking-tight text-slate-300 ${
                  isKeyboardOpen ? "text-[11px]" : "text-xs"
                }`}
              >
                SpotDrop
              </p>

              <div
                className={`flex min-h-0 w-full flex-1 flex-col items-center justify-start px-1 ${
                  isKeyboardOpen ? "pt-4" : "pt-6"
                }`}
              >
                <p
                  className={`line-clamp-6 w-full whitespace-pre-wrap leading-snug text-white ${spotLocationCardFontCss(cardFontStyle)} ${
                    isKeyboardOpen ? "text-base" : "text-lg"
                  }`}
                >
                  {cardText.trim() || t("spotLocationCard.placeholder")}
                </p>
              </div>

              <div
                className={`w-full shrink-0 border-t border-white/10 pt-3.5 ${
                  isKeyboardOpen ? "mb-16 opacity-80" : "mb-32"
                }`}
              >
                <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-white/40">
                  {t("spotLocationCard.savedAt")}
                </p>
                <p className="mt-1.5 line-clamp-2 text-sm font-medium text-white/80">{locationLabel}</p>
              </div>
            </div>
          </div>
        </div>

        <div ref={toolsRef} className="mx-auto w-full max-w-md shrink-0 px-4 pt-2" style={toolsPanelStyle}>
          <textarea
            ref={textareaRef}
            value={cardText}
            onChange={(event) => handleTextareaChange(event.target.value)}
            onFocus={handleTextareaFocus}
            onBlur={handleTextareaBlur}
            onKeyUp={scheduleCaretSync}
            onClick={scheduleCaretSync}
            onSelect={scheduleCaretSync}
            rows={isKeyboardOpen ? 2 : 3}
            enterKeyHint="done"
            placeholder={t("spotLocationCard.placeholder")}
            className={`mb-3 w-full resize-none rounded-2xl border border-white/10 px-4 py-3 text-sm text-white placeholder:text-white/35 focus:border-cyan-400/35 focus:outline-none ${
              isKeyboardOpen ? "bg-white/[0.06]" : "bg-white/[0.04]"
            }`}
          />

          {fontStyleButtons}

          {localizedError ? (
            <p className="mt-2 text-center text-xs text-red-300">{localizedError}</p>
          ) : null}
        </div>
      </div>

      <SpotVideoPreviewExitSheet
        isOpen={showExitSheet}
        onCancel={() => setShowExitSheet(false)}
        onDiscard={() => {
          setShowExitSheet(false);
          onBack();
        }}
      />
    </div>
  );
}
