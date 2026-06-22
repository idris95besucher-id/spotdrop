"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MapPin } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import {
  resolveLocationForSpotShare,
  sendPrivateSpotShare,
} from "@/lib/privateSpotShares";

type ShareSpotToUserButtonProps = {
  senderId: string;
  recipientId: string;
  recipientUsername: string;
  disabled?: boolean;
  className?: string;
  onSent?: () => void;
  /** Navigate to DM after a successful share (profile page). */
  redirectToDmOnSuccess?: boolean;
};

export default function ShareSpotToUserButton({
  senderId,
  recipientId,
  recipientUsername,
  disabled = false,
  className = "",
  onSent,
  redirectToDmOnSuccess = false,
}: ShareSpotToUserButtonProps) {
  const router = useRouter();
  const { t } = useI18n();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSend = async () => {
    setSending(true);
    setError(null);

    const { location, error: locationError } = await resolveLocationForSpotShare();

    if (locationError || !location) {
      setError(locationError ?? t("checkspot.locationRequired"));
      setSending(false);
      return;
    }

    const result = await sendPrivateSpotShare({
      senderId,
      recipientId,
      location,
    });

    if (result.error) {
      setError(result.error);
      setSending(false);
      return;
    }

    setSending(false);
    setConfirmOpen(false);
    onSent?.();

    if (redirectToDmOnSuccess) {
      router.push(`/dm?id=${encodeURIComponent(recipientId)}`);
    }
  };

  return (
    <>
      <button
        type="button"
        disabled={disabled || sending}
        onClick={() => {
          setError(null);
          setConfirmOpen(true);
        }}
        className={
          className ||
          "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-primary transition hover:border-primary/35 hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
        }
        aria-label={t("checkspot.sendAria", { username: recipientUsername })}
      >
        <MapPin className="h-5 w-5" strokeWidth={1.75} aria-hidden />
      </button>

      {confirmOpen ? (
        <div
          className="fixed inset-0 z-[200] flex items-end justify-center bg-black/70 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="send-checkspot-title"
        >
          <div className="w-full max-w-sm rounded-2xl border border-white/[0.08] bg-[#0B1026] p-5 shadow-2xl">
            <h2 id="send-checkspot-title" className="text-lg font-semibold text-white">
              {t("checkspot.sendTitle")}
            </h2>
            <p className="mt-2 text-sm text-muted">{t("checkspot.acceptToSeeDistance")}</p>

            {error ? (
              <p className="mt-3 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {localizeUserMessage(t, error) ?? error}
              </p>
            ) : null}

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                disabled={sending}
                onClick={() => setConfirmOpen(false)}
                className="flex-1 rounded-xl border border-white/15 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/5 disabled:opacity-50"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                disabled={sending}
                onClick={() => void handleSend()}
                className="flex-1 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-[#050816] transition hover:brightness-110 disabled:opacity-50"
              >
                {sending ? t("common.sending") : t("checkspot.send")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
