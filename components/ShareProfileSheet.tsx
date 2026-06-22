"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Download, Share2, X } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import {
  buildProfileShareUrl,
  formatProfileShareHandle,
  normalizeProfileUsername,
} from "@/lib/profileShare";

type ShareProfileSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  username: string;
};

export default function ShareProfileSheet({ isOpen, onClose, username }: ShareProfileSheetProps) {
  const { t } = useI18n();
  const [profileUrl, setProfileUrl] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [loadingQr, setLoadingQr] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canNativeShare, setCanNativeShare] = useState(false);

  const handle = formatProfileShareHandle(username);
  const normalizedUsername = normalizeProfileUsername(username);

  useEffect(() => {
    setCanNativeShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setCopied(false);
      setError(null);
      return;
    }

    const url = buildProfileShareUrl(username);
    setProfileUrl(url);
    setLoadingQr(true);
    setQrDataUrl(null);

    void import("qrcode")
      .then((QRCode) =>
        QRCode.toDataURL(url, {
          width: 280,
          margin: 2,
          color: {
            dark: "#050816",
            light: "#ffffff",
          },
        })
      )
      .then((dataUrl) => {
        setQrDataUrl(dataUrl);
        setLoadingQr(false);
      })
      .catch(() => {
        setError(t("share.errorQr"));
        setLoadingQr(false);
      });
  }, [isOpen, t, username]);

  if (!isOpen) {
    return null;
  }

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(profileUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(t("share.errorCopy"));
    }
  };

  const handleDownloadQr = () => {
    if (!qrDataUrl) {
      return;
    }

    const anchor = document.createElement("a");
    anchor.href = qrDataUrl;
    anchor.download = `spotdrop-${normalizedUsername || "profile"}-qr.png`;
    anchor.click();
  };

  const handleNativeShare = async () => {
    if (!navigator.share) {
      return;
    }

    try {
      await navigator.share({
        title: t("share.nativeTitle", { handle }),
        text: t("share.nativeText", { handle }),
        url: profileUrl,
      });
    } catch (shareError) {
      if (shareError instanceof Error && shareError.name === "AbortError") {
        return;
      }

      setError(t("share.errorShare"));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-label={t("common.close")}
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-profile-title"
        className="relative z-10 flex w-full max-w-md flex-col rounded-t-3xl sd-modal-panel pt-3 shadow-none sm:rounded-3xl sm:pt-5"
        style={{
          maxHeight: "calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 24px)",
        }}
      >
        {/* Drag pill — always visible, never scrolls */}
        <div className="mx-auto mb-2 h-1 w-10 shrink-0 rounded-full bg-white/20 sm:hidden" />

        {/* Header — always visible, never scrolls */}
        <div className="mb-4 flex shrink-0 items-center justify-between px-5">
          <p id="share-profile-title" className="text-sm font-semibold text-white">
            {t("share.title")}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"
            aria-label={t("common.close")}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {/* Scrollable content — clears the fixed bottom nav + home indicator */}
        <div
          className="min-h-0 flex-1 overflow-y-auto px-5"
          style={{
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 96px)",
          }}
        >
          <div className="mx-auto w-full max-w-xs rounded-2xl bg-white p-5 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-slate-500">SpotDrop</p>

            <div className="mx-auto mt-4 flex h-[220px] w-[220px] items-center justify-center">
              {loadingQr ? (
                <div className="h-[200px] w-[200px] animate-pulse rounded-xl bg-slate-100" />
              ) : qrDataUrl ? (
                <img src={qrDataUrl} alt="" className="h-[200px] w-[200px] rounded-lg" />
              ) : (
                <div className="flex h-[200px] w-[200px] items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-500">
                  {t("share.qrUnavailable")}
                </div>
              )}
            </div>

            <p className="mt-4 text-lg font-semibold text-slate-900">{handle}</p>
            <p className="mt-1 truncate text-xs text-slate-500">{profileUrl}</p>
          </div>

          {error ? <p className="mt-4 text-center text-sm text-red-300">{error}</p> : null}

          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => void handleCopyLink()}
              className="flex flex-col items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-xs font-medium text-slate-200 transition hover:bg-white/10"
            >
              {copied ? <Check className="h-5 w-5 text-emerald-400" aria-hidden /> : <Copy className="h-5 w-5" aria-hidden />}
              {copied ? t("share.copied") : t("share.copyLink")}
            </button>

            <button
              type="button"
              onClick={handleDownloadQr}
              disabled={!qrDataUrl}
              className="flex flex-col items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-xs font-medium text-slate-200 transition hover:bg-white/10 disabled:opacity-40"
            >
              <Download className="h-5 w-5" aria-hidden />
              {t("share.downloadQr")}
            </button>

            {canNativeShare ? (
              <button
                type="button"
                onClick={() => void handleNativeShare()}
                className="col-span-2 flex flex-col items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-xs font-medium text-slate-200 transition hover:bg-white/10 sm:col-span-1"
              >
                <Share2 className="h-5 w-5" aria-hidden />
                {t("share.share")}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
