"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MoreVertical, Trash2 } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";

type OwnContentMenuProps = {
  onDelete: () => Promise<{ ok: boolean; error: string | null }>;
  onDeleted?: () => void;
  disabled?: boolean;
  className?: string;
  menuAlign?: "left" | "right";
  confirmTitle?: string;
  confirmBody?: string | null;
  deletedToast?: string | null;
};

export default function OwnContentMenu({
  onDelete,
  onDeleted,
  disabled = false,
  className = "",
  menuAlign = "right",
  confirmTitle,
  confirmBody,
  deletedToast = null,
}: OwnContentMenuProps) {
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const resolvedConfirmTitle = confirmTitle ?? t("content.deleteTitle");
  const resolvedConfirmBody =
    confirmBody === undefined ? t("content.deleteBody") : confirmBody;

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [menuOpen]);

  const handleConfirmDelete = async () => {
    setDeleting(true);
    setError(null);

    const result = await onDelete();

    if (!result.ok) {
      setError(result.error ?? t("content.unableToDelete"));
      setDeleting(false);
      return;
    }

    setConfirmOpen(false);
    setMenuOpen(false);
    setDeleting(false);
    onDeleted?.();

    if (deletedToast) {
      setToastMessage(deletedToast);
      window.setTimeout(() => setToastMessage(null), 2200);
    }
  };

  return (
    <>
      <div ref={rootRef} className={`relative ${className}`}>
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setMenuOpen((current) => !current);
          }}
          disabled={disabled || deleting}
          className="flex h-9 w-9 items-center justify-center rounded-full text-white/90 transition hover:bg-white/10 disabled:opacity-50"
          aria-label={t("content.delete")}
          aria-expanded={menuOpen}
        >
          <MoreVertical className="h-5 w-5" aria-hidden />
        </button>

        {menuOpen ? (
          <div
            className={`absolute top-full z-50 mt-1 min-w-[10.5rem] overflow-hidden rounded-xl border border-white/10 bg-slate-950 py-1 shadow-2xl shadow-black/60 ${
              menuAlign === "left" ? "left-0" : "right-0"
            }`}
            role="menu"
          >
            <button
              type="button"
              role="menuitem"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setMenuOpen(false);
                setError(null);
                setConfirmOpen(true);
              }}
              className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm font-medium text-red-300 transition hover:bg-white/5"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              {t("content.delete")}
            </button>
          </div>
        ) : null}
      </div>

      {confirmOpen ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4">
          <div
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-950 p-5 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-content-title"
          >
            <h2 id="delete-content-title" className="text-lg font-semibold text-white">
              {resolvedConfirmTitle}
            </h2>
            {resolvedConfirmBody ? (
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{resolvedConfirmBody}</p>
            ) : null}

            {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!deleting) {
                    setConfirmOpen(false);
                    setError(null);
                  }
                }}
                disabled={deleting}
                className="flex-1 rounded-xl border border-white/15 py-2.5 text-sm font-semibold text-white transition hover:bg-white/5 disabled:opacity-50"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmDelete()}
                disabled={deleting}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-50"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                {t("common.delete")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toastMessage ? (
        <div
          className="pointer-events-none fixed bottom-[max(5.5rem,env(safe-area-inset-bottom))] left-1/2 z-[220] -translate-x-1/2"
          role="status"
          aria-live="polite"
        >
          <p className="rounded-full bg-white/95 px-4 py-2 text-sm font-medium text-black shadow-lg">
            {toastMessage}
          </p>
        </div>
      ) : null}
    </>
  );
}
