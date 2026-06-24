"use client";

import { ArrowLeft, ChevronRight, Globe, Lock } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import SpotUploadProgressOverlay from "@/components/SpotUploadProgressOverlay";
import type { CollectionWithMeta } from "@/lib/collections";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import type { MediaEditorItem } from "@/lib/mediaEditor";
import type { SpotUploadProgress } from "@/lib/spotUploadPipeline";

type SpotPublishScreenProps = {
  item: MediaEditorItem;
  collections: CollectionWithMeta[];
  collectionId: string;
  collectionsLoading?: boolean;
  publishing: boolean;
  uploadProgress?: SpotUploadProgress | null;
  uploadFailed?: boolean;
  offlineMode?: boolean;
  error: string | null;
  onCollectionChange: (collectionId: string) => void;
  onBack: () => void;
  onPublish: () => void;
};

export default function SpotPublishScreen({
  item,
  collections,
  collectionId,
  collectionsLoading = false,
  publishing,
  uploadProgress = null,
  uploadFailed = false,
  offlineMode = false,
  error,
  onCollectionChange,
  onBack,
  onPublish,
}: SpotPublishScreenProps) {
  const { t } = useI18n();
  const localizedError = localizeUserMessage(t, error);

  const mySpotsCollection =
    collections.find((c) => c.visibility === "private") ?? collections[0] ?? null;

  const previewSrc =
    item.mediaType === "video"
      ? item.coverPreviewUrl ?? item.previewUrl
      : item.previewUrl;

  return (
    <div
      className="fixed inset-0 z-[130] flex flex-col bg-[#050505] text-white"
      style={{ WebkitTapHighlightColor: "transparent" }}
    >
      <SpotUploadProgressOverlay
        visible={publishing}
        progress={uploadProgress}
        showDetailed={!offlineMode}
        offlineMode={offlineMode}
      />

      <div
        className="flex items-center justify-between border-b border-white/10 px-4 py-3"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <button
          type="button"
          onClick={onBack}
          disabled={publishing}
          className="flex h-10 w-10 items-center justify-center rounded-full text-white transition hover:bg-white/10 disabled:opacity-50"
          aria-label={t("spotEditor.back")}
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={2} aria-hidden />
        </button>

        <h1 className="text-sm font-semibold tracking-wide text-white/90">{t("spotEditor.shareTitle")}</h1>

        <div className="h-10 w-10" aria-hidden />
      </div>

      <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-4 py-6">
        <div className="mx-auto w-full max-w-xs overflow-hidden rounded-2xl bg-black ring-1 ring-white/10">
          {previewSrc ? (
            item.mediaType === "video" ? (
              <img src={previewSrc} alt="" className="aspect-[9/16] w-full object-cover" draggable={false} />
            ) : (
              <img src={previewSrc} alt="" className="aspect-[4/5] w-full object-cover" draggable={false} />
            )
          ) : (
            <div className="flex aspect-[4/5] w-full items-center justify-center text-sm text-white/40">
              {t("spotEditor.preview")}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wider text-white/45">{t("spotEditor.whereToShare")}</p>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onCollectionChange("")}
              disabled={publishing}
              className={`flex flex-1 items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-semibold transition disabled:opacity-50 ${
                collectionId === ""
                  ? "bg-white text-black"
                  : "bg-white/8 text-white ring-1 ring-white/12"
              }`}
            >
              <Globe className="h-4 w-4" aria-hidden />
              {t("spotEditor.publicSpot")}
            </button>

            <button
              type="button"
              onClick={() => {
                if (mySpotsCollection) onCollectionChange(mySpotsCollection.id);
              }}
              disabled={publishing || collectionsLoading || !mySpotsCollection}
              className={`flex flex-1 items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-semibold transition disabled:opacity-50 ${
                collectionId !== ""
                  ? "bg-white text-black"
                  : "bg-white/8 text-white ring-1 ring-white/12"
              }`}
            >
              <Lock className="h-4 w-4" aria-hidden />
              {t("spotEditor.mySpots")}
            </button>
          </div>
        </div>

        {offlineMode ? (
          <p className="text-center text-xs text-white/55">{t("spotEditor.offlineSavedHint")}</p>
        ) : null}
        {localizedError ? <p className="text-center text-xs text-red-400">{localizedError}</p> : null}
      </div>

      <div
        className="border-t border-white/10 px-4 pt-3"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <button
          type="button"
          onClick={onPublish}
          disabled={publishing}
          className="flex w-full items-center justify-center gap-1.5 rounded-full bg-primary py-3.5 text-sm font-bold text-background transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {publishing
            ? offlineMode
              ? t("spotEditor.saving")
              : t("spotEditor.publishing")
            : uploadFailed
              ? t("spotEditor.retryUpload")
              : offlineMode
                ? t("spotEditor.saveOfflineDraft")
                : t("spotEditor.shareSpot")}
          {!publishing ? <ChevronRight className="h-4 w-4" aria-hidden /> : null}
        </button>
      </div>
    </div>
  );
}
