"use client";

import { Volume2, VolumeX } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";

type SpotVideoSoundOptionProps = {
  keepSound: boolean;
  disabled?: boolean;
  onChange: (keepSound: boolean) => void;
};

export default function SpotVideoSoundOption({
  keepSound,
  disabled = false,
  onChange,
}: SpotVideoSoundOptionProps) {
  const { t } = useI18n();

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wider text-white/45">
        {t("spotCompose.videoSound")}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(true)}
          className={`inline-flex flex-1 items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold transition disabled:opacity-50 ${
            keepSound
              ? "bg-white text-black"
              : "bg-white/8 text-white ring-1 ring-white/12"
          }`}
        >
          <Volume2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          {t("spotCompose.keepSound")}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(false)}
          className={`inline-flex flex-1 items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold transition disabled:opacity-50 ${
            !keepSound
              ? "bg-white text-black"
              : "bg-white/8 text-white ring-1 ring-white/12"
          }`}
        >
          <VolumeX className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          {t("spotCompose.removeSound")}
        </button>
      </div>
    </div>
  );
}
