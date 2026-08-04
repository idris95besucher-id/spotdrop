"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ImagePlus, Loader2, X } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import {
  deleteOfficialChannelMedia,
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
import { MOBILE_SAFE_AREA_INSET_TOP, MOBILE_WIDTH_SAFE_CLASS } from "@/lib/mobileLayout";

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

type LocaleTab = "en" | "ru" | "de";

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
  const [localeTab, setLocaleTab] = useState<LocaleTab>("en");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientRequestId, setClientRequestId] = useState(() => crypto.randomUUID());
  const { overlayStyle, footerPadding } = useKeyboardViewportFrame();
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

    setLocaleTab("en");
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
    setLocaleTab("en");
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
      setLocaleTab("en");
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

  const tabs: { id: LocaleTab; label: string; optional: boolean }[] = [
    { id: "en", label: t("officialChannel.tab.en"), optional: false },
    { id: "ru", label: t("officialChannel.tab.ru"), optional: true },
    { id: "de", label: t("officialChannel.tab.de"), optional: true },
  ];

  const titleValue =
    localeTab === "en" ? form.titleEn : localeTab === "ru" ? form.titleRu : form.titleDe;
  const bodyValue =
    localeTab === "en" ? form.bodyEn : localeTab === "ru" ? form.bodyRu : form.bodyDe;
  const linkLabelValue =
    localeTab === "en"
      ? form.linkLabelEn
      : localeTab === "ru"
        ? form.linkLabelRu
        : form.linkLabelDe;

  const setTitleValue = (value: string) => {
    if (localeTab === "en") update("titleEn", value);
    else if (localeTab === "ru") update("titleRu", value);
    else update("titleDe", value);
  };

  const setBodyValue = (value: string) => {
    if (localeTab === "en") update("bodyEn", value);
    else if (localeTab === "ru") update("bodyRu", value);
    else update("bodyDe", value);
  };

  const setLinkLabelValue = (value: string) => {
    if (localeTab === "en") update("linkLabelEn", value);
    else if (localeTab === "ru") update("linkLabelRu", value);
    else update("linkLabelDe", value);
  };

  return createPortal(
    <div
      className={`fixed inset-x-0 z-[210] flex flex-col bg-[#050816] text-white ${MOBILE_WIDTH_SAFE_CLASS}`}
      style={overlayStyle}
      role="dialog"
      aria-modal="true"
      aria-label={t("officialChannel.composerTitle")}
    >
      <header
        className={`flex shrink-0 items-center gap-2 border-b border-white/[0.08] bg-[#050816] px-3 pb-2.5 ${MOBILE_SAFE_AREA_INSET_TOP}`}
      >
        <button
          type="button"
          onClick={handleClose}
          disabled={publishing}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full text-white transition hover:bg-white/10 disabled:opacity-50"
          aria-label={t("common.close")}
        >
          <X className="h-5 w-5" strokeWidth={2} aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-white">
            {t("officialChannel.composerTitle")}
          </h2>
          <p className="truncate text-[11px] text-muted">{t("officialChannel.officialOnly")}</p>
        </div>
      </header>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]"
      >
        <div className="mx-auto w-full max-w-lg space-y-4 px-4 py-4 pb-6">
          <div className="flex rounded-2xl border border-white/10 bg-black/25 p-1">
            {tabs.map((tab) => {
              const active = localeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setLocaleTab(tab.id)}
                  className={`flex min-w-0 flex-1 flex-col items-center rounded-xl px-2 py-2 transition ${
                    active ? "bg-primary text-background" : "text-muted hover:text-white"
                  }`}
                >
                  <span className="truncate text-xs font-semibold">{tab.label}</span>
                  {tab.optional ? (
                    <span
                      className={`text-[10px] ${active ? "text-background/80" : "text-muted"}`}
                    >
                      {t("officialChannel.optional")}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-muted">
              {t("officialChannel.field.title")}
              {localeTab !== "en" ? ` · ${t("officialChannel.optional")}` : ""}
            </span>
            <input
              value={titleValue}
              onChange={(event) => setTitleValue(event.target.value)}
              onFocus={(event) => bindFocus(event.currentTarget)}
              className={inputClassName}
            />
          </label>

          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-muted">
              {t("officialChannel.field.body")}
              {localeTab === "en" ? " *" : ` · ${t("officialChannel.optional")}`}
            </span>
            <textarea
              value={bodyValue}
              onChange={(event) => setBodyValue(event.target.value)}
              onFocus={(event) => bindFocus(event.currentTarget)}
              rows={6}
              className={`${inputClassName} resize-none`}
            />
          </label>

          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-muted">
              {t("officialChannel.field.linkLabel")}
              {localeTab !== "en" ? ` · ${t("officialChannel.optional")}` : ""}
            </span>
            <input
              value={linkLabelValue}
              onChange={(event) => setLinkLabelValue(event.target.value)}
              onFocus={(event) => bindFocus(event.currentTarget)}
              className={inputClassName}
            />
          </label>

          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-muted">
              {t("officialChannel.field.linkUrl")}
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

          {error ? <p className="text-sm text-red-300">{error}</p> : null}

          {/* Extra scroll room so last fields clear sticky footer + keyboard */}
          <div aria-hidden className="h-8" />
        </div>
      </div>

      <div
        className="shrink-0 border-t border-white/[0.08] bg-[#050816]/98 px-4 pt-3 backdrop-blur-xl"
        style={{
          paddingBottom: isKeyboardOpen
            ? composerPaddingBottom("sheet", true)
            : footerPadding,
        }}
      >
        <div className="mx-auto flex w-full max-w-lg gap-2">
          <button
            type="button"
            disabled={!form.bodyEn.trim() || publishing}
            onClick={() => setPreviewOpen(true)}
            className="flex-1 rounded-full border border-white/15 py-3 text-sm font-semibold text-white transition hover:bg-white/5 disabled:opacity-50"
          >
            {t("officialChannel.preview")}
          </button>
          <button
            type="button"
            disabled={!form.bodyEn.trim() || publishing || uploading}
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
            {form.titleEn ? (
              <p className="mt-3 text-base font-semibold text-white">{form.titleEn}</p>
            ) : null}
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
