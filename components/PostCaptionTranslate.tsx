"use client";

import { useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import { translatePostCaption } from "@/lib/postCaptionTranslation";

type PostCaptionTranslateProps = {
  postId: string;
  caption: string;
  className?: string;
};

type TranslateState =
  | { mode: "original" }
  | { mode: "loading" }
  | { mode: "translated"; text: string }
  | { mode: "error" };

/**
 * Drop-in caption renderer: shows the canonical (always-English) caption,
 * and — only when the viewer's app language isn't English — a small
 * Translate/Show original toggle beneath it. The first tap fetches and
 * caches the translation in local state; toggling back and forth after that
 * never re-fetches.
 */
export default function PostCaptionTranslate({ postId, caption, className = "" }: PostCaptionTranslateProps) {
  const { t, locale } = useI18n();
  const [state, setState] = useState<TranslateState>({ mode: "original" });
  const [resetKey, setResetKey] = useState(postId);

  // A different post in the same mounted component (e.g. a recycled list
  // row) must never keep showing a stale translation. Adjusted during
  // render rather than an effect — see https://react.dev/learn/you-might-not-need-an-effect.
  if (postId !== resetKey) {
    setResetKey(postId);
    setState({ mode: "original" });
  }

  if (!caption.trim()) {
    return null;
  }

  const paragraphClassName = `whitespace-pre-wrap text-[15px] leading-relaxed text-white ${className}`;

  if (locale === "en") {
    return <p className={paragraphClassName}>{caption}</p>;
  }

  const handleToggle = async () => {
    if (state.mode === "translated") {
      setState({ mode: "original" });
      return;
    }

    if (state.mode === "loading") {
      return;
    }

    setState({ mode: "loading" });

    const result = await translatePostCaption(postId, locale);

    if (result.translatedText) {
      setState({ mode: "translated", text: result.translatedText });
    } else {
      setState({ mode: "error" });
    }
  };

  const displayedText = state.mode === "translated" ? state.text : caption;

  return (
    <div>
      <p className={paragraphClassName}>{displayedText}</p>
      {state.mode !== "error" ? (
        <button
          type="button"
          onClick={() => void handleToggle()}
          disabled={state.mode === "loading"}
          className="mt-1 text-xs font-semibold text-cyan-300/90 transition hover:text-cyan-200 disabled:opacity-60"
        >
          {state.mode === "loading"
            ? t("post.translating")
            : state.mode === "translated"
              ? t("post.showOriginal")
              : t("post.translate")}
        </button>
      ) : null}
    </div>
  );
}
