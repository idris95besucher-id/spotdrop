"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreVertical, Trash2 } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";

const DELETE_TIMEOUT_MS = 10_000;
const SHEET_Z = 300;
const TOAST_Z = 320;

type OwnContentMenuProps = {
  onDelete: () => Promise<{ ok: boolean; error: string | null }>;
  onDeleted?: () => void;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  deleteMenuLabel?: string;
  confirmTitle?: string;
  confirmBody?: string | null;
  deletedToast?: string | null;
  errorToastPrefix?: string | null;
};

function runWithTimeout<T>(promise: Promise<T>, ms: number, timeoutMessage: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error(timeoutMessage)), ms);
    }),
  ]);
}

export default function OwnContentMenu({
  onDelete,
  onDeleted,
  disabled = false,
  className = "",
  triggerClassName = "",
  deleteMenuLabel,
  deletedToast = null,
}: OwnContentMenuProps) {
  const { t } = useI18n();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const resolvedDeleteLabel = deleteMenuLabel ?? t("content.delete");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!sheetOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [sheetOpen]);

  const handleDeleteClick = async () => {
    console.log("DELETE CLICKED");
    setSheetOpen(false);

    if (!window.confirm("Delete this spot?")) {
      return;
    }

    console.log("CONFIRM ACCEPTED");
    setDeleting(true);

    try {
      const result = await runWithTimeout(
        onDelete(),
        DELETE_TIMEOUT_MS,
        "Delete timed out after 10 seconds. Check your connection and try again."
      );

      if (!result.ok) {
        const message = result.error ?? t("content.unableToDelete");
        console.log("DELETE FAILED", message);
        window.alert(message);
        return;
      }

      console.log("DELETE SUCCESS");
      onDeleted?.();

      if (deletedToast) {
        setToastMessage(deletedToast);
        window.setTimeout(() => setToastMessage(null), 2200);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log("DELETE FAILED", message);
      window.alert(message);
    } finally {
      setDeleting(false);
    }
  };

  const actionSheet =
    sheetOpen && mounted
      ? createPortal(
          <div className="fixed inset-0 flex flex-col justify-end" style={{ zIndex: SHEET_Z }}>
            <button
              type="button"
              className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
              aria-label={t("common.cancel")}
              onClick={() => setSheetOpen(false)}
            />

            <div
              role="dialog"
              aria-modal="true"
              aria-label={resolvedDeleteLabel}
              className="relative z-10 mx-3 mb-3 overflow-hidden rounded-2xl border border-white/10 bg-[#121212]/95 shadow-2xl shadow-black/60 backdrop-blur-xl"
              style={{ marginBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="p-2">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => void handleDeleteClick()}
                  className="flex w-full items-center justify-center gap-2.5 rounded-xl px-4 py-3.5 text-[15px] font-semibold text-red-400 transition active:bg-red-500/10 disabled:opacity-50"
                >
                  <Trash2 className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                  {resolvedDeleteLabel}
                </button>
              </div>
            </div>

            <button
              type="button"
              disabled={deleting}
              onClick={() => setSheetOpen(false)}
              className="relative z-10 mx-3 mb-3 rounded-2xl bg-[#1c1c1c]/95 py-3.5 text-[15px] font-semibold text-white shadow-lg backdrop-blur-xl transition active:bg-white/10 disabled:opacity-50"
              style={{ marginBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
            >
              {t("common.cancel")}
            </button>
          </div>,
          document.body
        )
      : null;

  const toast =
    toastMessage && mounted
      ? createPortal(
          <div
            className="pointer-events-none fixed bottom-[max(5.5rem,env(safe-area-inset-bottom))] left-1/2 max-w-[min(92vw,22rem)] -translate-x-1/2"
            style={{ zIndex: TOAST_Z }}
            role="status"
            aria-live="polite"
          >
            <p className="rounded-full bg-white/95 px-4 py-2 text-center text-sm font-medium text-black shadow-lg">
              {toastMessage}
            </p>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <div ref={rootRef} className={`relative ${className}`}>
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setSheetOpen(true);
          }}
          disabled={disabled || deleting}
          className={`flex h-10 w-10 items-center justify-center rounded-full text-white/90 transition hover:bg-white/10 disabled:opacity-50 ${triggerClassName}`}
          aria-label={t("content.delete")}
          aria-haspopup="dialog"
          aria-expanded={sheetOpen}
        >
          <MoreVertical className="h-5 w-5" aria-hidden />
        </button>
      </div>

      {actionSheet}
      {toast}
    </>
  );
}
