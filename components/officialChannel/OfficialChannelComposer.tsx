"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ImagePlus, Loader2, X } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import {
  deleteOfficialChannelMedia,
  OFFICIAL_CHANNEL_MAX_PHOTOS,
  publishOfficialChannelPost,
  uploadOfficialChannelMedia,
  type OfficialChannelPostRow,
} from "@/lib/officialChannel";
import {
  composerPaddingBottom,
  useChromeNavHidden,
  useEnsureFocusedInputVisible,
  useKeyboard,
  useKeyboardViewportFrame,
} from "@/lib/keyboardSystem";
import { MOBILE_WIDTH_SAFE_CLASS } from "@/lib/mobileLayout";

type ComposerState = {
  title: string;
  body: string;
  linkUrl: string;
  linkLabel: string;
  /** 1-10 photos, in display order. */
  imagePaths: string[];
};

const EMPTY_STATE: ComposerState = {
  title: "",
  body: "",
  linkUrl: "",
  linkLabel: "",
  imagePaths: [],
};

const inputClassName =
  "w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus:border-primary/40";

export default function OfficialChannelComposer({
  open,
  onClose,
  onPublished,
}: {
  open: boolean;
  onClose: () => void;
  onPublished: (post: OfficialChannelPostRow) => void;
}) {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeFieldRef = useRef<HTMLElement | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [form, setForm] = useState<ComposerState>(EMPTY_STATE);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientRequestId, setClientRequestId] = useState(() => crypto.randomUUID());
  const { overlayStyle } = useKeyboardViewportFrame();
  const { isKeyboardOpen } = useKeyboard();

  useChromeNavHidden("sheet-input", open);
  useEnsureFocusedInputVisible(activeFieldRef, open);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    setPreviewOpen(false);
    setConfirmOpen(false);
    setError(null);
    setPublishing(false);
    setUploading(false);
  }, [open]);

  const update = <K extends keyof ComposerState>(key: K, value: ComposerState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setError(null);
  };

  const resetComposer = () => {
    setForm(EMPTY_STATE);
    setPreviewOpen(false);
    setConfirmOpen(false);
    setClientRequestId(crypto.randomUUID());
    setError(null);
  };

  const handleClose = () => {
    if (publishing) {
      return;
    }

    resetComposer();
    onClose();
  };

  /** Maps one upload failure to the same localized messages as before. */
  const uploadErrorMessage = (result: Awaited<ReturnType<typeof uploadOfficialChannelMedia>>) =>
    result.code === "unauthorized"
      ? t("officialChannel.error.unauthorized")
      : result.code === "invalid_image"
        ? t("officialChannel.error.invalidImage")
        : result.code === "upload_timed_out" || result.status === 504
          ? t("officialChannel.error.uploadTimeout")
          : result.code === "storage_upload_failed"
            ? t("officialChannel.error.storageUploadFailed")
            : result.code === "network_connection_failed" ||
                /load failed|failed to fetch|network connection failed/i.test(result.error ?? "")
              ? t("officialChannel.error.networkFailed")
              : (result.error ?? t("officialChannel.error.uploadFailed"));

  /**
   * Uploads each picked file in turn (sequential — the existing single-file
   * endpoint is reused unchanged, just called once per photo) and appends
   * successful paths to the composer's photo list, up to
   * OFFICIAL_CHANNEL_MAX_PHOTOS total. Stops and surfaces the error on the
   * first failure, keeping whatever already succeeded.
   */
  const handleImagesPick = async (files: File[]) => {
    if (files.length === 0) {
      return;
    }

    const remainingSlots = OFFICIAL_CHANNEL_MAX_PHOTOS - form.imagePaths.length;
    const toUpload = files.slice(0, Math.max(0, remainingSlots));

    if (toUpload.length === 0) {
      setError(t("officialChannel.error.tooManyPhotos"));
      return;
    }

    setUploading(true);
    setError(null);

    try {
      for (const file of toUpload) {
        console.info(
          `[official-channel-composer] upload pick mime=${file.type || "(empty)"} size=${file.size}`
        );

        const result = await uploadOfficialChannelMedia(file);

        if (result.error || !result.imagePath) {
          if (result.requestId) {
            console.info(
              `[official-channel-composer] upload error code=${result.code ?? "unknown"} requestId=${result.requestId}`
            );
          }

          setError(uploadErrorMessage(result));
          return;
        }

        setForm((current) => ({
          ...current,
          imagePaths: [...current.imagePaths, result.imagePath as string],
        }));
      }
    } catch (caught) {
      console.error(
        "[official-channel-composer] upload threw",
        caught instanceof Error ? caught.name : "unknown"
      );
      setError(
        caught instanceof Error ? caught.message : t("officialChannel.error.uploadFailed")
      );
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveImage = async (path: string) => {
    setForm((current) => ({
      ...current,
      imagePaths: current.imagePaths.filter((existing) => existing !== path),
    }));
    await deleteOfficialChannelMedia(path);
  };

  const handlePublish = async () => {
    if (publishing) {
      return;
    }

    if (!form.body.trim()) {
      setError(t("officialChannel.error.bodyRequired"));
      setConfirmOpen(false);
      return;
    }

    setPublishing(true);
    setError(null);

    const result = await publishOfficialChannelPost({
      clientRequestId,
      title: form.title,
      body: form.body,
      imagePaths: form.imagePaths,
      linkUrl: form.linkUrl,
      linkLabel: form.linkLabel,
    });

    setPublishing(false);

    if (result.error || !result.post) {
      setError(result.error ?? t("officialChannel.error.publishFailed"));
      setConfirmOpen(false);
      return;
    }

    const post = result.post;
    resetComposer();
    onPublished(post);
    onClose();
  };

  const bindFocus = (element: HTMLElement | null) => {
    activeFieldRef.current = element;
  };

  if (!open || !mounted || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className={`fixed inset-x-0 z-[210] flex flex-col overflow-hidden bg-[#050816] text-white ${MOBILE_WIDTH_SAFE_CLASS}`}
      style={overlayStyle}
      role="dialog"
      aria-modal="true"
      aria-label={t("officialChannel.composerTitle")}
    >
      <header className="sticky top-0 z-10 flex shrink-0 items-center gap-2 border-b border-white/[0.08] bg-[#050816] px-3 pb-2.5 pt-[calc(env(safe-area-inset-top,0px)+12px)]">
        <button
          type="button"
          onClick={handleClose}
          disabled={publishing}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white transition hover:bg-white/10 disabled:opacity-50"
          aria-label={t("common.close")}
        >
          <X className="h-5 w-5" strokeWidth={2} aria-hidden />
        </button>
        <div className="min-w-0 flex-1 py-0.5">
          <h2 className="text-base font-semibold leading-snug text-white">
            {t("officialChannel.composerTitle")}
          </h2>
          <p className="mt-0.5 text-[11px] leading-snug text-muted">
            {t("officialChannel.officialOnly")}
          </p>
        </div>
      </header>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]"
      >
        <div className="mx-auto w-full max-w-lg space-y-4 px-4 py-4 pb-6">
          <p className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-[12px] leading-relaxed text-muted">
            {t("officialChannel.autoTranslateNote")}
          </p>

          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-muted">
              {t("officialChannel.field.title")} · {t("officialChannel.optional")}
            </span>
            <input
              value={form.title}
              onChange={(event) => update("title", event.target.value)}
              onFocus={(event) => bindFocus(event.currentTarget)}
              className={inputClassName}
            />
          </label>

          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-muted">
              {t("officialChannel.field.body")} *
            </span>
            <textarea
              value={form.body}
              onChange={(event) => update("body", event.target.value)}
              onFocus={(event) => bindFocus(event.currentTarget)}
              rows={6}
              className={`${inputClassName} resize-none`}
            />
          </label>

          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-muted">
              {t("officialChannel.field.linkLabel")} · {t("officialChannel.optional")}
            </span>
            <input
              value={form.linkLabel}
              onChange={(event) => update("linkLabel", event.target.value)}
              onFocus={(event) => bindFocus(event.currentTarget)}
              className={inputClassName}
            />
          </label>

          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-muted">
              {t("officialChannel.field.linkUrl")} · {t("officialChannel.optional")}
            </span>
            <input
              value={form.linkUrl}
              onChange={(event) => update("linkUrl", event.target.value)}
              onFocus={(event) => bindFocus(event.currentTarget)}
              placeholder="https://"
              inputMode="url"
              className={inputClassName}
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="sr-only"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = "";
                void handleImagesPick(files);
              }}
            />
            <button
              type="button"
              disabled={uploading || publishing || form.imagePaths.length >= OFFICIAL_CHANNEL_MAX_PHOTOS}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/5 disabled:opacity-50"
            >
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <ImagePlus className="h-3.5 w-3.5" aria-hidden />
              )}
              {t("officialChannel.uploadImage")}
              {form.imagePaths.length > 0
                ? ` (${form.imagePaths.length}/${OFFICIAL_CHANNEL_MAX_PHOTOS})`
                : ""}
            </button>
          </div>

          {form.imagePaths.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {form.imagePaths.map((path, index) => (
                <span
                  key={path}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white"
                >
                  {t("officialChannel.photoLabel", { number: index + 1 })}
                  <button
                    type="button"
                    onClick={() => void handleRemoveImage(path)}
                    className="text-muted transition hover:text-white"
                    aria-label={t("officialChannel.removeImage")}
                  >
                    <X className="h-3 w-3" aria-hidden />
                  </button>
                </span>
              ))}
            </div>
          ) : null}

          {error ? <p className="text-sm text-red-300">{error}</p> : null}

          <div aria-hidden className="h-8" />
        </div>
      </div>

      <div
        className="shrink-0 border-t border-white/[0.08] bg-[#050816]/98 px-4 pt-4 backdrop-blur-xl"
        style={{
          paddingBottom: isKeyboardOpen
            ? composerPaddingBottom("sheet", true)
            : "calc(env(safe-area-inset-bottom, 0px) + 18px)",
        }}
      >
        <div className="mx-auto flex w-full max-w-lg gap-2">
          <button
            type="button"
            disabled={!form.body.trim() || publishing}
            onClick={() => setPreviewOpen(true)}
            className="flex-1 rounded-full border border-white/15 py-3 text-sm font-semibold text-white transition hover:bg-white/5 disabled:opacity-50"
          >
            {t("officialChannel.preview")}
          </button>
          <button
            type="button"
            disabled={!form.body.trim() || publishing || uploading}
            onClick={() => setConfirmOpen(true)}
            className="flex-1 rounded-full bg-primary py-3 text-sm font-semibold text-background transition hover:brightness-110 disabled:opacity-50"
          >
            {publishing ? t("officialChannel.publishing") : t("officialChannel.publish")}
          </button>
        </div>
      </div>

      {previewOpen ? (
        <div className="absolute inset-0 z-20 flex items-end justify-center bg-black/70 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-[28px] border border-white/10 bg-[#0B1026] p-5">
            <p className="text-sm font-semibold text-white">{t("officialChannel.preview")}</p>
            <p className="mt-1 text-[11px] text-muted">{t("officialChannel.previewSourceNote")}</p>
            {form.title ? (
              <p className="mt-3 text-base font-semibold text-white">{form.title}</p>
            ) : null}
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-200">{form.body}</p>
            {form.imagePaths.length > 0 ? (
              <p className="mt-3 text-xs text-muted">
                {t("officialChannel.previewHasImage", { count: form.imagePaths.length })}
              </p>
            ) : null}
            {form.linkLabel ? (
              <p className="mt-2 text-xs text-muted">{form.linkLabel}</p>
            ) : null}
            {form.linkUrl ? (
              <p className="mt-1 break-all text-xs text-primary">{form.linkUrl}</p>
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
        <div className="absolute inset-0 z-30 flex items-end justify-center bg-black/70 p-4 sm:items-center">
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
    </div>,
    document.body
  );
}
