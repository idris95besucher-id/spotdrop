"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import {
  deleteOfficialChannelMedia,
  publishOfficialChannelPost,
  uploadOfficialChannelMedia,
  type OfficialChannelPostRow,
} from "@/lib/officialChannel";

type ComposerState = {
  titleEn: string;
  bodyEn: string;
  titleRu: string;
  bodyRu: string;
  titleDe: string;
  bodyDe: string;
  linkUrl: string;
  linkLabelEn: string;
  linkLabelRu: string;
  linkLabelDe: string;
  imagePath: string | null;
};

const EMPTY_STATE: ComposerState = {
  titleEn: "",
  bodyEn: "",
  titleRu: "",
  bodyRu: "",
  titleDe: "",
  bodyDe: "",
  linkUrl: "",
  linkLabelEn: "",
  linkLabelRu: "",
  linkLabelDe: "",
  imagePath: null,
};

export default function OfficialChannelComposer({
  onPublished,
}: {
  onPublished: (post: OfficialChannelPostRow) => void;
}) {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<ComposerState>(EMPTY_STATE);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientRequestId, setClientRequestId] = useState(() => crypto.randomUUID());
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const update = <K extends keyof ComposerState>(key: K, value: ComposerState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setError(null);
    setSuccessMessage(null);
  };

  const resetComposer = () => {
    setForm(EMPTY_STATE);
    setPreviewOpen(false);
    setConfirmOpen(false);
    setClientRequestId(crypto.randomUUID());
    setError(null);
  };

  const handleImagePick = async (file: File | null) => {
    if (!file) {
      return;
    }

    setUploading(true);
    setError(null);

    if (form.imagePath) {
      await deleteOfficialChannelMedia(form.imagePath);
    }

    const result = await uploadOfficialChannelMedia(file);
    setUploading(false);

    if (result.error || !result.imagePath) {
      setError(result.error ?? t("officialChannel.error.uploadFailed"));
      return;
    }

    update("imagePath", result.imagePath);
  };

  const handleRemoveImage = async () => {
    if (!form.imagePath) {
      return;
    }

    const path = form.imagePath;
    update("imagePath", null);
    await deleteOfficialChannelMedia(path);
  };

  const handlePublish = async () => {
    if (publishing) {
      return;
    }

    if (!form.bodyEn.trim()) {
      setError(t("officialChannel.error.englishRequired"));
      setConfirmOpen(false);
      return;
    }

    setPublishing(true);
    setError(null);

    const result = await publishOfficialChannelPost({
      clientRequestId,
      titleEn: form.titleEn,
      bodyEn: form.bodyEn,
      titleRu: form.titleRu,
      bodyRu: form.bodyRu,
      titleDe: form.titleDe,
      bodyDe: form.bodyDe,
      imagePath: form.imagePath,
      linkUrl: form.linkUrl,
      linkLabelEn: form.linkLabelEn,
      linkLabelRu: form.linkLabelRu,
      linkLabelDe: form.linkLabelDe,
    });

    setPublishing(false);

    if (result.error || !result.post) {
      setError(result.error ?? t("officialChannel.error.publishFailed"));
      setConfirmOpen(false);
      return;
    }

    onPublished(result.post);
    setSuccessMessage(t("officialChannel.published"));
    resetComposer();
  };

  return (
    <section className="mb-6 rounded-[28px] border border-primary/20 bg-slate-900/70 p-4 text-left">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-white">{t("officialChannel.composerTitle")}</p>
        <span className="rounded-full bg-primary/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
          {t("officialChannel.officialOnly")}
        </span>
      </div>

      <div className="mt-4 space-y-3">
        <label className="block space-y-1">
          <span className="text-[11px] font-medium text-muted">{t("officialChannel.field.titleEn")}</span>
          <input
            value={form.titleEn}
            onChange={(event) => update("titleEn", event.target.value)}
            className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus:border-primary/40"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-[11px] font-medium text-muted">{t("officialChannel.field.bodyEn")} *</span>
          <textarea
            value={form.bodyEn}
            onChange={(event) => update("bodyEn", event.target.value)}
            rows={4}
            className="w-full resize-none rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus:border-primary/40"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-muted">{t("officialChannel.field.titleRu")}</span>
            <input
              value={form.titleRu}
              onChange={(event) => update("titleRu", event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus:border-primary/40"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-muted">{t("officialChannel.field.bodyRu")}</span>
            <textarea
              value={form.bodyRu}
              onChange={(event) => update("bodyRu", event.target.value)}
              rows={2}
              className="w-full resize-none rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus:border-primary/40"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-muted">{t("officialChannel.field.titleDe")}</span>
            <input
              value={form.titleDe}
              onChange={(event) => update("titleDe", event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus:border-primary/40"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-muted">{t("officialChannel.field.bodyDe")}</span>
            <textarea
              value={form.bodyDe}
              onChange={(event) => update("bodyDe", event.target.value)}
              rows={2}
              className="w-full resize-none rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus:border-primary/40"
            />
          </label>
        </div>

        <label className="block space-y-1">
          <span className="text-[11px] font-medium text-muted">{t("officialChannel.field.linkUrl")}</span>
          <input
            value={form.linkUrl}
            onChange={(event) => update("linkUrl", event.target.value)}
            placeholder="https://"
            className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus:border-primary/40"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-muted">{t("officialChannel.field.linkLabelEn")}</span>
            <input
              value={form.linkLabelEn}
              onChange={(event) => update("linkLabelEn", event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus:border-primary/40"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-muted">{t("officialChannel.field.linkLabelRu")}</span>
            <input
              value={form.linkLabelRu}
              onChange={(event) => update("linkLabelRu", event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus:border-primary/40"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-muted">{t("officialChannel.field.linkLabelDe")}</span>
            <input
              value={form.linkLabelDe}
              onChange={(event) => update("linkLabelDe", event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus:border-primary/40"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              event.target.value = "";
              void handleImagePick(file);
            }}
          />
          <button
            type="button"
            disabled={uploading || publishing}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/5 disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <ImagePlus className="h-3.5 w-3.5" aria-hidden />
            )}
            {t("officialChannel.uploadImage")}
          </button>
          {form.imagePath ? (
            <button
              type="button"
              onClick={() => void handleRemoveImage()}
              className="inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-2 text-xs text-muted"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
              {t("officialChannel.removeImage")}
            </button>
          ) : null}
        </div>
      </div>

      {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
      {successMessage ? <p className="mt-3 text-sm text-emerald-300">{successMessage}</p> : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!form.bodyEn.trim() || publishing}
          onClick={() => setPreviewOpen(true)}
          className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/5 disabled:opacity-50"
        >
          {t("officialChannel.preview")}
        </button>
        <button
          type="button"
          disabled={!form.bodyEn.trim() || publishing || uploading}
          onClick={() => setConfirmOpen(true)}
          className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-background transition hover:brightness-110 disabled:opacity-50"
        >
          {publishing ? t("officialChannel.publishing") : t("officialChannel.publish")}
        </button>
      </div>

      {previewOpen ? (
        <div className="fixed inset-0 z-[140] flex items-end justify-center bg-black/70 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-[28px] border border-white/10 bg-[#0B1026] p-5">
            <p className="text-sm font-semibold text-white">{t("officialChannel.preview")}</p>
            {form.titleEn ? <p className="mt-3 text-base font-semibold text-white">{form.titleEn}</p> : null}
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-200">{form.bodyEn}</p>
            {form.imagePath ? (
              <p className="mt-3 text-xs text-muted">{t("officialChannel.previewHasImage")}</p>
            ) : null}
            {form.linkUrl ? (
              <p className="mt-2 break-all text-xs text-primary">{form.linkUrl}</p>
            ) : null}
            <button
              type="button"
              onClick={() => setPreviewOpen(false)}
              className="mt-5 w-full rounded-full border border-white/15 py-2.5 text-sm font-semibold text-white"
            >
              {t("common.close")}
            </button>
          </div>
        </div>
      ) : null}

      {confirmOpen ? (
        <div className="fixed inset-0 z-[150] flex items-end justify-center bg-black/70 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-[28px] border border-white/10 bg-[#0B1026] p-5">
            <p className="text-sm font-semibold text-white">{t("officialChannel.confirmTitle")}</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              {t("officialChannel.confirmBody")}
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={publishing}
                onClick={() => setConfirmOpen(false)}
                className="rounded-full border border-white/15 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                disabled={publishing}
                onClick={() => void handlePublish()}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-primary py-2.5 text-sm font-semibold text-background disabled:opacity-50"
              >
                {publishing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                {publishing ? t("officialChannel.publishing") : t("officialChannel.publish")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
