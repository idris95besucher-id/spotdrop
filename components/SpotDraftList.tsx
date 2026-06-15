"use client";

import { Loader2, Trash2, Upload } from "lucide-react";
import SpotDraftPreview from "@/components/SpotDraftPreview";
import { useI18n } from "@/components/I18nProvider";
import { isSpotDraftUploadable, type SpotDraftRecord } from "@/lib/spotDraft";
import { formatPostTime } from "@/lib/posts";

type SpotDraftListProps = {
  drafts: SpotDraftRecord[];
  uploadingDraftId: string | null;
  onUpload: (draftId: string) => void;
  onDelete: (draftId: string) => Promise<void>;
};

export default function SpotDraftList({ drafts, uploadingDraftId, onUpload, onDelete }: SpotDraftListProps) {
  const { t } = useI18n();

  if (drafts.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 px-4 py-12 text-center">
        <p className="text-sm text-muted">{t("drafts.empty")}</p>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {drafts.map((draft) => {
        const uploading = uploadingDraftId === draft.id;
        const canUpload = isSpotDraftUploadable(draft);
        const title = draft.spotName.trim() || t("drafts.untitled");

        return (
          <li key={draft.id} className="rounded-2xl border border-white/[0.08] bg-card p-4">
            <div className="flex gap-3">
              <SpotDraftPreview draft={draft} className="h-[4.5rem] w-[4.5rem]" />

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{title}</p>
                <time className="mt-1 block text-xs text-muted" dateTime={draft.createdAt}>
                  {t("drafts.created", { date: formatPostTime(draft.createdAt) })}
                </time>
                {draft.uploadStatus === "failed" && draft.uploadError ? (
                  <p className="mt-1 text-[11px] text-red-300">{draft.uploadError}</p>
                ) : null}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={!canUpload || uploading}
                onClick={() => onUpload(draft.id)}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2.5 text-xs font-semibold text-background transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {uploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <Upload className="h-3.5 w-3.5" aria-hidden />
                )}
                {uploading ? t("drafts.uploading") : t("drafts.upload")}
              </button>
              <button
                type="button"
                disabled={uploading}
                onClick={() => {
                  if (window.confirm(t("drafts.deleteConfirm"))) {
                    void onDelete(draft.id);
                  }
                }}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2.5 text-xs font-semibold text-red-200 transition hover:bg-red-500/15 disabled:opacity-45"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                {t("drafts.delete")}
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
