"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import {
  getEditablePublicationCaption,
  SPOT_CAPTION_MAX_LENGTH,
  updateOwnedPublication,
} from "@/lib/editPublication";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import { ensureTextareaCaretVisible } from "@/lib/ensureTextareaCaretVisible";

type EditPublicationScreenProps = {
  isOpen: boolean;
  userId: string;
  postId: string;
  post: {
    content?: string | null;
    spot_name?: string | null;
    content_kind?: string | null;
    media_type?: string | null;
    media_url?: string | null;
    image_url?: string | null;
    video_url?: string | null;
  };
  onClose: () => void;
  onSaved: (next: { content?: string | null; spot_name?: string | null }) => void;
};

export default function EditPublicationScreen({
  isOpen,
  userId,
  postId,
  post,
  onClose,
  onSaved,
}: EditPublicationScreenProps) {
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);
  const [caption, setCaption] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setCaption(getEditablePublicationCaption(post));
    setError(null);
    setSaving(false);
  }, [isOpen, post]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  if (!isOpen || !mounted) {
    return null;
  }

  const handleSave = async () => {
    if (saving) {
      return;
    }

    setSaving(true);
    setError(null);

    const result = await updateOwnedPublication(userId, postId, { caption });

    setSaving(false);

    if (!result.ok || !result.post) {
      setError(localizeUserMessage(t, result.error) ?? result.error ?? t("content.unableToSaveEdit"));
      return;
    }

    onSaved({
      content: result.post.content,
      spot_name: result.post.spot_name,
    });
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[310] flex flex-col bg-[#050816] text-white"
      style={{ WebkitTapHighlightColor: "transparent" }}
    >
      <div
        className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-2"
        style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
      >
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="flex h-11 w-11 items-center justify-center rounded-full text-white transition hover:bg-white/10 disabled:opacity-50"
          aria-label={t("common.back")}
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={2} aria-hidden />
        </button>

        <h1 className="text-sm font-semibold tracking-wide text-white">
          {t("content.editPublication")}
        </h1>

        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="min-w-[4.5rem] rounded-full bg-white px-3.5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-slate-200 disabled:opacity-50"
        >
          {saving ? t("content.savingChanges") : t("content.saveChanges")}
        </button>
      </div>

      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 py-5">
        <label htmlFor="edit-publication-caption" className="text-xs font-medium uppercase tracking-wide text-slate-400">
          {t("content.editCaptionLabel")}
        </label>
        <textarea
          id="edit-publication-caption"
          value={caption}
          maxLength={SPOT_CAPTION_MAX_LENGTH}
          disabled={saving}
          onChange={(event) => setCaption(event.target.value.slice(0, SPOT_CAPTION_MAX_LENGTH))}
          onFocus={(event) => ensureTextareaCaretVisible(event.currentTarget)}
          placeholder={t("content.editCaptionPlaceholder")}
          className="mt-3 min-h-[10rem] w-full resize-none rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-[15px] leading-relaxed text-white outline-none ring-0 placeholder:text-slate-500 focus:border-white/20"
        />
        <p className="mt-2 text-right text-xs text-slate-500">
          {caption.length}/{SPOT_CAPTION_MAX_LENGTH}
        </p>

        {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}
      </div>

      <div style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }} />
    </div>,
    document.body
  );
}
