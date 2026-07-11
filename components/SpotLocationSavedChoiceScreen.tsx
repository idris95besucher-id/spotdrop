"use client";

import { ArrowLeft, Camera, Image, Sparkles, Type, Video } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import SpotDropSpotsIcon from "@/components/icons/SpotDropSpotsIcon";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";

type SpotLocationSavedChoiceScreenProps = {
  locationLabel: string;
  error?: string | null;
  busy?: boolean;
  onClose: () => void;
  onTextCard: () => void;
  onTakePhoto: () => void;
  onChoosePhoto: () => void;
  onChooseVideo: () => void;
};

type ChoiceOptionProps = {
  icon: React.ReactNode;
  label: string;
  hint: string;
  onClick: () => void;
  disabled?: boolean;
};

function ChoiceOption({ icon, label, hint, onClick, disabled = false }: ChoiceOptionProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="group flex w-full items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 text-left transition hover:border-cyan-400/25 hover:bg-white/[0.07] active:scale-[0.99] disabled:opacity-50"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400/20 to-cyan-500/5 text-cyan-200 ring-1 ring-cyan-300/15">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-white">{label}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-white/45">{hint}</span>
      </span>
    </button>
  );
}

export default function SpotLocationSavedChoiceScreen({
  locationLabel,
  error = null,
  busy = false,
  onClose,
  onTextCard,
  onTakePhoto,
  onChoosePhoto,
  onChooseVideo,
}: SpotLocationSavedChoiceScreenProps) {
  const { t } = useI18n();
  const localizedError = localizeUserMessage(t, error);

  return (
    <div
      className="fixed inset-0 z-[130] flex flex-col bg-[#030712] text-white select-none"
      style={{ WebkitTapHighlightColor: "transparent" }}
    >
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <button
          type="button"
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/8 text-white transition hover:bg-white/12"
          aria-label={t("spotEditor.close")}
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={2} aria-hidden />
        </button>
        <span className="text-xs font-medium uppercase tracking-[0.16em] text-white/35">SpotDrop</span>
        <div className="h-10 w-10" aria-hidden />
      </div>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 pb-8">
        <div className="mb-10 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-cyan-400/10 ring-1 ring-cyan-300/20">
            <SpotDropSpotsIcon
              className="h-8 w-8 text-cyan-300 [filter:drop-shadow(0_0_12px_rgba(34,211,238,0.35))]"
              strokeWidth={1.5}
              aria-hidden
            />
          </div>
          <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-cyan-300">
            <Sparkles className="h-4 w-4" aria-hidden />
            {t("spotLocationCard.saved")}
          </p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">
            {t("spotLocationCard.choiceTitle")}
          </h1>
          <p className="mt-2 text-sm text-white/50">{locationLabel}</p>
        </div>

        <div className="space-y-3">
          <ChoiceOption
            icon={<Type className="h-5 w-5" strokeWidth={1.75} aria-hidden />}
            label={t("spotLocationCard.optionTextCard")}
            hint={t("spotLocationCard.optionTextCardHint")}
            onClick={onTextCard}
            disabled={busy}
          />
          <ChoiceOption
            icon={<Camera className="h-5 w-5" strokeWidth={1.75} aria-hidden />}
            label={t("spotLocationCard.optionTakePhoto")}
            hint={t("spotLocationCard.optionTakePhotoHint")}
            onClick={onTakePhoto}
            disabled={busy}
          />
          <ChoiceOption
            icon={<Image className="h-5 w-5" strokeWidth={1.75} aria-hidden />}
            label={t("spotLocationCard.optionChoosePhoto")}
            hint={t("spotLocationCard.optionChoosePhotoHint")}
            onClick={onChoosePhoto}
            disabled={busy}
          />
          <ChoiceOption
            icon={<Video className="h-5 w-5" strokeWidth={1.75} aria-hidden />}
            label={t("spotLocationCard.optionChooseVideo")}
            hint={t("spotLocationCard.optionChooseVideoHint")}
            onClick={onChooseVideo}
            disabled={busy}
          />
        </div>

        {localizedError ? (
          <p className="mt-4 text-center text-xs text-red-300">{localizedError}</p>
        ) : null}
      </div>

      <div style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }} />
    </div>
  );
}
