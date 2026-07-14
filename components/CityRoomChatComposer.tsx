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

      <div className="flex items-end gap-2">
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
        <button
          type="submit"
          disabled={sendDisabled}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center self-end rounded-full bg-cyan-500 text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={t("rooms.composer.sendMessage")}
        >
          {sending ? (
            <span className="text-xs font-semibold">…</span>
          ) : (
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-current">
              <path d="M3.4 20.6 22 12 3.4 3.4l2.8 7.2L16 11l-9.8.8 2.8 7.2z" />
            </svg>
          )}
        </button>
      </div>

      {footer}
    </form>
  );
}
