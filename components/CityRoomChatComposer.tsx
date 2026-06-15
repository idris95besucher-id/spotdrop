"use client";

import { useMemo, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { Plus } from "lucide-react";
import CityRoomCreateActionSheet from "@/components/CityRoomCreateActionSheet";
import CityRoomPlacesSheet from "@/components/CityRoomPlacesSheet";
import { useI18n } from "@/components/I18nProvider";
import { uploadCityRoomChatImage } from "@/lib/cityRoomChatMedia";
import { encodeCityRoomImageMessage } from "@/lib/cityRoomImageMessage";
import { encodeCityRoomPlaceMessage, placeSearchHitToPayload } from "@/lib/cityRoomPlaceMessage";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import { pickImageFromGallery } from "@/lib/pickMediaFromGallery";
import type { CityRoomPlaceSearchRequest } from "@/lib/placeSearchApi";
import type { PlaceSearchHit } from "@/lib/placeSearchApi";

type CityRoomChatComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onSendPlaceContent: (content: string) => Promise<void>;
  placeSearchScope: Omit<CityRoomPlaceSearchRequest, "query" | "limit">;
  userId?: string | null;
  sending: boolean;
  sendDisabled: boolean;
  sendError?: string | null;
  inputDisabled?: boolean;
  placeholder?: string;
  footer?: ReactNode;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
};

export default function CityRoomChatComposer({
  value,
  onChange,
  onSubmit,
  onSendPlaceContent,
  placeSearchScope,
  userId = null,
  sending,
  sendDisabled,
  sendError = null,
  inputDisabled = false,
  placeholder,
  footer = null,
  textareaRef,
}: CityRoomChatComposerProps) {
  const { t } = useI18n();
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [placeSearchOpen, setPlaceSearchOpen] = useState(false);
  const [sendingAttachment, setSendingAttachment] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  const isBusy = sending || sendingAttachment;
  const composerDisabled = inputDisabled || isBusy;
  const messagePlaceholder = placeholder ?? t("rooms.messagePlaceholder");

  const handleSendPlace = async (hit: PlaceSearchHit) => {
    setSendingAttachment(true);
    setAttachmentError(null);

    try {
      const content = encodeCityRoomPlaceMessage(placeSearchHitToPayload(hit));
      await onSendPlaceContent(content);
    } finally {
      setSendingAttachment(false);
    }
  };

  const handleAddPhoto = async () => {
    if (!userId) {
      setAttachmentError("Sign in to send photos.");
      return;
    }

    const file = await pickImageFromGallery();

    if (!file) {
      return;
    }

    setSendingAttachment(true);
    setAttachmentError(null);

    try {
      const imageUrl = await uploadCityRoomChatImage(userId, file);
      const content = encodeCityRoomImageMessage({ imageUrl, alt: null });
      await onSendPlaceContent(content);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to send photo.";
      setAttachmentError(message);
    } finally {
      setSendingAttachment(false);
    }
  };

  const displayError = useMemo(() => {
    const rawError = attachmentError ?? sendError;
    return rawError ? localizeUserMessage(t, rawError) ?? rawError : null;
  }, [attachmentError, sendError, t]);

  return (
    <>
      <form
        onSubmit={onSubmit}
        className="absolute inset-x-0 bottom-0 z-20 border-t border-white/10 bg-slate-950/90 p-3 backdrop-blur-xl sm:p-4"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        {displayError ? <p className="mb-2 text-xs text-red-300">{displayError}</p> : null}

        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => setCreateMenuOpen(true)}
            disabled={composerDisabled}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-slate-900/95 text-slate-200 transition hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={t("rooms.create.title")}
          >
            <Plus className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </button>
          <textarea
            ref={textareaRef}
            name="spotdrop-room-message"
            autoComplete="off"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            disabled={inputDisabled}
            placeholder={messagePlaceholder}
            rows={1}
            className="max-h-28 min-h-11 flex-1 resize-none rounded-3xl border border-white/10 bg-slate-900/95 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={sendDisabled || sendingAttachment}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cyan-500 text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
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

      <CityRoomCreateActionSheet
        isOpen={createMenuOpen}
        onClose={() => setCreateMenuOpen(false)}
        onSelectPhoto={() => void handleAddPhoto()}
        onSelectSpot={() => setPlaceSearchOpen(true)}
        disabled={composerDisabled}
      />

      <CityRoomPlacesSheet
        isOpen={placeSearchOpen}
        onClose={() => setPlaceSearchOpen(false)}
        onSendPlace={handleSendPlace}
        scope={placeSearchScope}
        sending={sendingAttachment}
      />
    </>
  );
}
