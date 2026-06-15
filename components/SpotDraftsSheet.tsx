"use client";

import { useEffect, useState } from "react";
import { MapPin, PencilLine, Trash2, Upload, X } from "lucide-react";
import {
  getSpotDraftStorage,
  spotDraftLocationLabel,
  type SpotDraftRecord,
} from "@/lib/spotDraft";

type SpotDraftsSheetProps = {
  drafts: SpotDraftRecord[];
  uploadingDraftId: string | null;
  onClose: () => void;
  onUpload: (draftId: string) => void;
  onEdit: (draftId: string) => void;
  onDelete: (draftId: string) => Promise<void>;
};

function draftStatusLabel(draft: SpotDraftRecord) {
  switch (draft.uploadStatus) {
    case "ready":
      return "Ready to upload";
    case "failed":
      return draft.uploadError ?? "Upload failed";
    case "uploading":
      return "Uploading…";
    default:
      return "Draft";
  }
}

function DraftPreview({ draft }: { draft: SpotDraftRecord }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    void (async () => {
      const storage = getSpotDraftStorage();
      const coverBlob =
        draft.media.mediaType === "video" ? await storage.getDraftBlob(draft.id, "cover") : null;
      const mediaBlob = coverBlob ?? (await storage.getDraftBlob(draft.id, "media"));

      if (!active || !mediaBlob) {
        return;
      }

      objectUrl = URL.createObjectURL(mediaBlob);
      setPreviewUrl(objectUrl);
    })();

    return () => {
      active = false;

      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [draft.id, draft.media.mediaType]);

  return (
    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-[#050816]">
      {previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={previewUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted">
          <MapPin className="h-5 w-5 opacity-50" aria-hidden />
        </div>
      )}
      {draft.media.mediaType === "video" ? (
        <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 py-0.5 text-[9px] font-semibold uppercase text-white">
          Video
        </span>
      ) : null}
    </div>
  );
}

export default function SpotDraftsSheet({
  drafts,
  uploadingDraftId,
  onClose,
  onUpload,
  onEdit,
  onDelete,
}: SpotDraftsSheetProps) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-label="Close draft list"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="spot-drafts-title"
        className="relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-[#0B1026] shadow-2xl shadow-black/50 sm:rounded-3xl"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <h2 id="spot-drafts-title" className="text-base font-semibold text-white">
              Spot drafts
            </h2>
            <p className="mt-0.5 text-xs text-muted">Saved locally on this device.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="overflow-y-auto p-3">
          {drafts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center">
              <p className="text-sm text-muted">No Spot drafts on this device.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {drafts.map((draft) => {
                const uploading = uploadingDraftId === draft.id;
                const canUpload = draft.uploadStatus === "ready" || draft.uploadStatus === "failed";

                return (
                  <li
                    key={draft.id}
                    className="rounded-2xl border border-white/[0.08] bg-[#050816] p-3"
                  >
                    <div className="flex gap-3">
                      <DraftPreview draft={draft} />

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white">
                          {draft.spotName.trim() || "Untitled spot"}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted">
                          {spotDraftLocationLabel(draft)}
                        </p>
                        <p className="mt-1 text-[11px] text-muted">{draftStatusLabel(draft)}</p>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        disabled={!canUpload || uploading}
                        onClick={() => onUpload(draft.id)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-2 py-2 text-[11px] font-semibold text-background transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <Upload className="h-3.5 w-3.5" aria-hidden />
                        Upload
                      </button>
                      <button
                        type="button"
                        onClick={() => onEdit(draft.id)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/15 px-2 py-2 text-[11px] font-semibold text-white transition hover:bg-white/5"
                      >
                        <PencilLine className="h-3.5 w-3.5" aria-hidden />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm("Delete this Spot draft from this device?")) {
                            void onDelete(draft.id);
                          }
                        }}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-red-500/25 bg-red-500/10 px-2 py-2 text-[11px] font-semibold text-red-200 transition hover:bg-red-500/15"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        Delete
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
