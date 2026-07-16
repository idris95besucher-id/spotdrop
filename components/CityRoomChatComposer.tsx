"use client";

import { useMemo, type FormEvent, type ReactNode, type RefObject } from "react";
import { useI18n } from "@/components/I18nProvider";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import { composerPaddingBottom, useComposerKeyboardStyle } from "@/lib/keyboardSystem";

type CityRoomChatComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  sending: boolean;
  sendDisabled: boolean;
  sendError?: string | null;
  inputDisabled?: boolean;
  placeholder?: string;
  footer?: ReactNode;
  preview?: ReactNode;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  /** Rendered in place of the send button while the textarea is empty (e.g. a voice-message mic button). */
  emptyInputAction?: ReactNode;
  /** Rendered to the left of the textarea (e.g. the "+" attachment button). */
  leadingAction?: ReactNode;
};

export default function CityRoomChatComposer({
  value,
  onChange,
  onSubmit,
  sending,
  sendDisabled,
  sendError = null,
  inputDisabled = false,
  placeholder,
  footer = null,
  preview = null,
  textareaRef,
  emptyInputAction,
  leadingAction,
}: CityRoomChatComposerProps) {
  const { t } = useI18n();
  const { isKeyboardOpen, composerStyle } = useComposerKeyboardStyle();
  const messagePlaceholder = placeholder ?? t("rooms.messagePlaceholder");

  const displayError = useMemo(() => {
    return sendError ? localizeUserMessage(t, sendError) ?? sendError : null;
  }, [sendError, t]);

  const formClassName =
    "shrink-0 border-t border-white/10 bg-slate-950/95 px-3 pt-2.5 backdrop-blur-xl sm:px-4 md:pb-3";

  return (
    <form
      onSubmit={onSubmit}
      className={formClassName}
      style={{
        ...composerStyle,
        paddingBottom: composerPaddingBottom("cityRoom", isKeyboardOpen),
      }}
    >
      {displayError ? <p className="mb-2 text-xs text-red-300">{displayError}</p> : null}

      {preview ? <div className="mb-2.5">{preview}</div> : null}

      <div className="relative flex items-end gap-2">
        {leadingAction}
        <textarea
          ref={textareaRef}
          name="spotdrop-room-message"
          autoComplete="off"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={inputDisabled}
          placeholder={messagePlaceholder}
          rows={1}
          className="max-h-28 min-h-11 flex-1 resize-none rounded-3xl border border-white/10 bg-slate-900/95 px-4 py-2.5 text-sm leading-5 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
        />
        {!value.trim() && emptyInputAction ? (
          emptyInputAction
        ) : (
          <button
            type="submit"
            disabled={sendDisabled}
            className="shrink-0 rounded-2xl bg-primary px-4 py-3 text-xs font-semibold text-[#050816] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {sending ? "…" : t("common.send")}
          </button>
        )}
      </div>

      {footer}
    </form>
  );
}
