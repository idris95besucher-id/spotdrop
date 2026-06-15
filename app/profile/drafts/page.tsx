"use client";

import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import SpotDraftList from "@/components/SpotDraftList";
import { useSpotDrafts } from "@/components/SpotDraftsProvider";
import Shell from "@/components/Shell";
import { useI18n } from "@/components/I18nProvider";

export default function SpotDraftsPage() {
  const router = useRouter();
  const { t } = useI18n();
  const { drafts, loading, uploadingDraftId, uploadDraft, deleteDraft } = useSpotDrafts();

  return (
    <Shell showHeader={false}>
      <div className="mx-auto w-full max-w-lg px-4 pb-10 pt-1 sm:max-w-xl">
        <header className="flex items-center gap-2 border-b border-white/[0.08] pb-4 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <button
            type="button"
            onClick={() => router.push("/profile")}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition hover:bg-white/10 active:opacity-80"
            aria-label={t("drafts.backToProfile")}
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={2} aria-hidden />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold text-white">{t("menu.spotDrafts")}</h1>
            <p className="truncate text-xs text-muted">{t("menu.spotDraftsDescEmpty")}</p>
          </div>
        </header>

        <div className="mt-5">
          {loading ? (
            <div className="rounded-2xl border border-white/[0.08] bg-card px-4 py-12 text-center text-sm text-muted">
              {t("common.loading")}
            </div>
          ) : (
            <SpotDraftList
              drafts={drafts}
              uploadingDraftId={uploadingDraftId}
              onUpload={(draftId) => void uploadDraft(draftId)}
              onDelete={deleteDraft}
            />
          )}
        </div>
      </div>
    </Shell>
  );
}
