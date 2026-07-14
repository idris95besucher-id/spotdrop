"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { toUserFacingError } from "@/lib/userFacingError";

const DELETE_TIMEOUT_MS = 10_000;
const SHEET_Z = 300;
const TOAST_Z = 320;

type OwnContentMenuProps = {
  onDelete: () => Promise<{ ok: boolean; error: string | null }>;
  onDeleted?: () => void;
  onEdit?: () => void;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  deleteMenuLabel?: string;
  editMenuLabel?: string;
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
  onEdit,
  disabled = false,
  className = "",
  triggerClassName = "",
  deleteMenuLabel,
  editMenuLabel,
  confirmTitle,
  confirmBody,
  deletedToast = null,
}: OwnContentMenuProps) {
  const { t } = useI18n();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const resolvedDeleteLabel = deleteMenuLabel ?? t("content.deletePublication");
  const resolvedEditLabel = editMenuLabel ?? t("content.editPublication");
  const resolvedConfirmTitle = confirmTitle ?? t("content.deletePublicationTitle");
  const resolvedConfirmBody = confirmBody ?? t("content.deletePublicationBody");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!sheetOpen) {
      setConfirmDelete(false);
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [sheetOpen]);

  const handleConfirmDelete = async () => {
    setConfirmDelete(false);
    setSheetOpen(false);
    setDeleting(true);

    try {
      const result = await runWithTimeout(
        onDelete(),
        DELETE_TIMEOUT_MS,
        "Delete timed out. Check your connection and try again."
      );

      if (!result.ok) {
        window.alert(toUserFacingError(result.error, t("content.unableToDelete")));
        return;
      }

      onDeleted?.();

      if (deletedToast) {
        setToastMessage(deletedToast);
        window.setTimeout(() => setToastMessage(null), 2200);
      }
    } catch (err) {
      window.alert(toUserFacingError(err, t("content.unableToDelete")));
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

            {confirmDelete ? (
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="own-content-delete-title"
                className="relative z-10 mx-3 overflow-hidden rounded-2xl border border-white/10 bg-[#121212]/95 shadow-2xl shadow-black/60 backdrop-blur-xl"
                style={{ marginBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="border-b border-white/10 px-5 py-4">
                  <h2 id="own-content-delete-title" className="text-[15px] font-semibold text-white">
                    {resolvedConfirmTitle}
                  </h2>
                  {resolvedConfirmBody ? (
                    <p className="mt-2 text-sm leading-relaxed text-slate-400">{resolvedConfirmBody}</p>
                  ) : null}
                </div>
                <div className="p-2">
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={() => void handleConfirmDelete()}
                    className="flex w-full items-center justify-center gap-2.5 rounded-xl px-4 py-3.5 text-[15px] font-semibold text-red-400 transition active:bg-red-500/10 disabled:opacity-50"
                  >
                    <Trash2 className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                    {resolvedDeleteLabel}
                  </button>
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={() => setConfirmDelete(false)}
                    className="mt-1 flex w-full items-center justify-center rounded-xl px-4 py-3.5 text-[15px] font-semibold text-white transition active:bg-white/10 disabled:opacity-50"
                  >
                    {t("common.cancel")}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-label={t("content.publicationActions")}
                  className="relative z-10 mx-3 overflow-hidden rounded-2xl border border-white/10 bg-[#121212]/95 shadow-2xl shadow-black/60 backdrop-blur-xl"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="p-2">
                    {onEdit ? (
                      <button
                        type="button"
                        disabled={deleting}
                        onClick={() => {
                          setSheetOpen(false);
                          onEdit();
                        }}
                        className="flex w-full items-center justify-center gap-2.5 rounded-xl px-4 py-3.5 text-[15px] font-semibold text-white transition active:bg-white/10 disabled:opacity-50"
                      >
                        <Pencil className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                        {resolvedEditLabel}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={deleting}
                      onClick={() => setConfirmDelete(true)}
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
                  className="relative z-10 mx-3 mt-2 rounded-2xl bg-[#1c1c1c]/95 py-3.5 text-[15px] font-semibold text-white shadow-lg backdrop-blur-xl transition active:bg-white/10 disabled:opacity-50"
                  style={{ marginBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
                >
                  {t("common.cancel")}
                </button>
              </>
            )}
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
          className={`flex h-11 w-11 items-center justify-center rounded-full text-white/90 transition active:scale-95 active:bg-white/15 hover:bg-white/10 disabled:opacity-50 ${triggerClassName}`}
          aria-label={t("content.publicationActions")}
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
