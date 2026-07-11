"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, MapPin, Search, Send, UserRound, X } from "lucide-react";
import SendLocationCardCityRoomFlow from "@/components/SendLocationCardCityRoomFlow";
import { useI18n } from "@/components/I18nProvider";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import type { SpotLocationCardFontStyle } from "@/lib/spotLocationCardStyles";
import type { SpotGeoLocation } from "@/lib/spotLocation";
import { sendLocationCardToRecipient } from "@/lib/sendLocationCardShare";
import {
  loadSendSpotFriends,
  loadSendSpotRecentChats,
  searchSendSpotRecipients,
  type SendSpotRecipient,
} from "@/lib/sendSpotRecipients";
import { bottomSheetLayout, useBottomSheetScrollLock } from "@/lib/bottomSheetScrollLock";

type SendLocationCardSheetProps = {
  isOpen: boolean;
  userId: string | null;
  cardText: string;
  cardFontStyle: SpotLocationCardFontStyle;
  locationLabel: string;
  location: SpotGeoLocation;
  onClose: () => void;
  onSent?: () => void;
};

function RecipientRow({
  recipient,
  sending,
  onSend,
  sendingLabel,
  sendLabel,
}: {
  recipient: SendSpotRecipient;
  sending: boolean;
  onSend: () => void;
  sendingLabel: string;
  sendLabel: string;
}) {
  return (
    <div className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-[#050816]/80 px-3 py-2.5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-slate-900">
        {recipient.avatar_url ? (
          <img src={recipient.avatar_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <UserRound className="h-4 w-4 text-slate-400" strokeWidth={1.5} aria-hidden />
        )}
      </div>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">@{recipient.username}</span>
      <button
        type="button"
        disabled={sending}
        onClick={onSend}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-[#050816] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {sending ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            {sendingLabel}
          </>
        ) : (
          <>
            <Send className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            {sendLabel}
          </>
        )}
      </button>
    </div>
  );
}

export default function SendLocationCardSheet({
  isOpen,
  userId,
  cardText,
  cardFontStyle,
  locationLabel,
  location,
  onClose,
  onSent,
}: SendLocationCardSheetProps) {
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);
  const [friends, setFriends] = useState<SendSpotRecipient[]>([]);
  const [recent, setRecent] = useState<SendSpotRecipient[]>([]);
  const [searchResults, setSearchResults] = useState<SendSpotRecipient[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [sendingRecipientId, setSendingRecipientId] = useState<string | null>(null);
  const [cityRoomFlowOpen, setCityRoomFlowOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentToast, setSentToast] = useState(false);

  useBottomSheetScrollLock(isOpen);

  useEffect(() => {
    setMounted(true);
  }, []);

  const loadRecipients = useCallback(async () => {
    if (!userId) {
      setFriends([]);
      setRecent([]);
      return;
    }

    setLoading(true);
    setError(null);

    const [friendsResult, recentResult] = await Promise.all([
      loadSendSpotFriends(userId),
      loadSendSpotRecentChats(userId),
    ]);

    setFriends(friendsResult.recipients);
    setRecent(recentResult.recipients);
    setError(friendsResult.error ?? recentResult.error);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery("");
      setSearchResults([]);
      setSendingRecipientId(null);
      setCityRoomFlowOpen(false);
      setError(null);
      setSentToast(false);
      setPreparing(false);
      return;
    }

    void loadRecipients();
  }, [isOpen, loadRecipients]);

  useEffect(() => {
    if (!isOpen || !userId) {
      return;
    }

    const trimmed = searchQuery.trim();

    if (!trimmed) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);

    const timer = window.setTimeout(() => {
      void searchSendSpotRecipients(trimmed, userId).then((result) => {
        setSearchResults(result.recipients);
        setSearching(false);

        if (result.error) {
          setError(result.error);
        }
      });
    }, 250);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isOpen, searchQuery, userId]);

  const friendIds = useMemo(() => new Set(friends.map((friend) => friend.id)), [friends]);

  const recentWithoutFriends = useMemo(
    () => recent.filter((recipient) => !friendIds.has(recipient.id)),
    [friendIds, recent]
  );

  const searchWithoutSelectedSections = useMemo(() => {
    const hidden = new Set([...friendIds, ...recent.map((recipient) => recipient.id)]);

    return searchResults.filter((recipient) => !hidden.has(recipient.id));
  }, [friendIds, recent, searchResults]);

  const handleSent = () => {
    setSentToast(true);
    onSent?.();

    window.setTimeout(() => {
      setSentToast(false);
      onClose();
    }, 1200);
  };

  const handleSendToRecipient = async (recipientId: string) => {
    if (!userId || sendingRecipientId || preparing) {
      return;
    }

    setSendingRecipientId(recipientId);
    setPreparing(true);
    setError(null);

    try {
      const result = await sendLocationCardToRecipient({
        senderId: userId,
        recipientId,
        cardText,
        fontStyle: cardFontStyle,
        locationLabel,
        location,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      handleSent();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : t("spotLocationCard.sendFailed");
      setError(message);
    } finally {
      setSendingRecipientId(null);
      setPreparing(false);
    }
  };

  if (!isOpen || !mounted) {
    return null;
  }

  const sheet = (
    <div className={bottomSheetLayout.overlay}>
      <button
        type="button"
        className={bottomSheetLayout.backdrop}
        aria-label={t("common.close")}
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="send-location-card-title"
        data-bottom-sheet-panel
        className={bottomSheetLayout.panel}
        onClick={(event) => event.stopPropagation()}
      >
        {cityRoomFlowOpen ? (
          <SendLocationCardCityRoomFlow
            userId={userId}
            cardText={cardText}
            cardFontStyle={cardFontStyle}
            locationLabel={locationLabel}
            location={location}
            onBack={() => setCityRoomFlowOpen(false)}
            onSent={handleSent}
          />
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <h2 id="send-location-card-title" className="text-base font-semibold text-white">
                {t("spotLocationCard.sendToTitle")}
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full p-2 text-muted transition hover:bg-white/5 hover:text-white"
                aria-label={t("common.close")}
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>

            <div className="border-b border-white/10 px-4 py-3">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder={t("spotShare.searchUsers")}
                  className="w-full rounded-2xl border border-white/10 bg-[#050816] py-2.5 pl-10 pr-4 text-sm text-white outline-none transition focus:border-primary/45"
                />
              </label>
            </div>

            <div data-bottom-sheet-scroll className={`${bottomSheetLayout.scroll} space-y-5 px-4 py-4`}>
              {preparing ? (
                <div className="flex items-center justify-center py-4 text-sm text-muted">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  {t("spotLocationCard.preparingCard")}
                </div>
              ) : null}

              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {t("spotLocationCard.cityRooms")}
                </h3>
                <button
                  type="button"
                  disabled={!userId || preparing || Boolean(sendingRecipientId)}
                  onClick={() => setCityRoomFlowOpen(true)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-[#050816]/80 px-3 py-3 text-left transition hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-slate-900 text-cyan-300">
                    <MapPin className="h-4 w-4" strokeWidth={2} aria-hidden />
                  </div>
                  <span className="min-w-0 flex-1 text-sm font-medium text-white">
                    {t("spotLocationCard.shareToCityRooms")}
                  </span>
                </button>
              </section>

              {!userId ? (
                <p className="rounded-2xl border border-dashed border-white/10 px-3 py-4 text-sm text-muted">
                  {t("spotShare.signIn")}
                </p>
              ) : loading ? (
                <div className="flex items-center justify-center py-6 text-sm text-muted">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  {t("spotShare.loadingRecipients")}
                </div>
              ) : (
                <>
                  <section className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                      {t("spotShare.friends")}
                    </h3>
                    {friends.length === 0 ? (
                      <p className="rounded-2xl border border-dashed border-white/10 px-3 py-4 text-sm text-muted">
                        {t("spotShare.noFriends")}
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {friends.map((recipient) => (
                          <RecipientRow
                            key={recipient.id}
                            recipient={recipient}
                            sending={sendingRecipientId === recipient.id || preparing}
                            onSend={() => void handleSendToRecipient(recipient.id)}
                            sendingLabel={t("common.sending")}
                            sendLabel={t("common.send")}
                          />
                        ))}
                      </div>
                    )}
                  </section>

                  <section className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                      {t("spotShare.recentChats")}
                    </h3>
                    {recentWithoutFriends.length === 0 ? (
                      <p className="rounded-2xl border border-dashed border-white/10 px-3 py-4 text-sm text-muted">
                        {t("spotShare.noRecentChats")}
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {recentWithoutFriends.map((recipient) => (
                          <RecipientRow
                            key={recipient.id}
                            recipient={recipient}
                            sending={sendingRecipientId === recipient.id || preparing}
                            onSend={() => void handleSendToRecipient(recipient.id)}
                            sendingLabel={t("common.sending")}
                            sendLabel={t("common.send")}
                          />
                        ))}
                      </div>
                    )}
                  </section>

                  {searchQuery.trim() ? (
                    <section className="space-y-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                        {t("spotShare.search")}
                      </h3>
                      {searchWithoutSelectedSections.length === 0 ? (
                        <p className="rounded-2xl border border-dashed border-white/10 px-3 py-4 text-sm text-muted">
                          {searching ? t("spotShare.searching") : t("spotShare.noUsersFound")}
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {searchWithoutSelectedSections.map((recipient) => (
                            <RecipientRow
                              key={recipient.id}
                              recipient={recipient}
                              sending={sendingRecipientId === recipient.id || preparing}
                              onSend={() => void handleSendToRecipient(recipient.id)}
                              sendingLabel={t("common.sending")}
                              sendLabel={t("common.send")}
                            />
                          ))}
                        </div>
                      )}
                    </section>
                  ) : null}
                </>
              )}

              {error ? (
                <p className="text-sm text-red-300">{localizeUserMessage(t, error) ?? error}</p>
              ) : null}
            </div>
          </>
        )}

        {sentToast ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center px-4">
            <div className="rounded-full bg-[#050816]/95 px-4 py-2 text-sm font-medium text-white shadow-lg ring-1 ring-white/10">
              {t("spotLocationCard.sent")}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}
