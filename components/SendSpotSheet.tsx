"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Bookmark, Check, Copy, Loader2, Search, Send, Share2, X } from "lucide-react";
import ProfileAvatar from "@/components/ProfileAvatar";
import UsernameWithVerification from "@/components/UsernameWithVerification";
import { useI18n } from "@/components/I18nProvider";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import {
  loadSendSpotFriends,
  loadSendSpotRecentChats,
  searchSendSpotRecipients,
  type SendSpotRecipient,
} from "@/lib/sendSpotRecipients";
import { sendSpotToRecipient } from "@/lib/sendSpotMessage";
import { isSpotSavedByUser, toggleSpotSave } from "@/lib/savedSpots";
import { bottomSheetLayout, useBottomSheetScrollLock } from "@/lib/bottomSheetScrollLock";

type SendSpotSheetProps = {
  postId: string;
  userId: string | null;
  shareUrl: string;
  isOpen: boolean;
  onClose: () => void;
  onRequireAuth?: () => void;
  onSent?: () => void;
  /** Known save state from the viewer; refreshed from the server when the sheet opens. */
  isSaved?: boolean;
  onSavedChange?: (saved: boolean, savedCount?: number) => void;
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
      <ProfileAvatar
        src={recipient.avatar_url}
        sizeClassName="h-10 w-10"
        iconClassName="h-4 w-4"
        className="border border-white/10"
      />
      <UsernameWithVerification
        username={`@${recipient.username}`}
        isVerified={recipient.is_verified}
        className="min-w-0 flex-1 text-sm font-medium text-white"
        iconSize={14}
      />
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

function RecipientSection({
  title,
  recipients,
  sendingRecipientId,
  onSend,
  emptyLabel,
  sendingLabel,
  sendLabel,
}: {
  title: string;
  recipients: SendSpotRecipient[];
  sendingRecipientId: string | null;
  onSend: (recipientId: string) => void;
  emptyLabel?: string;
  sendingLabel: string;
  sendLabel: string;
}) {
  if (recipients.length === 0 && !emptyLabel) {
    return null;
  }

  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      {recipients.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-white/10 px-3 py-4 text-sm text-muted">{emptyLabel}</p>
      ) : (
        <div className="space-y-2">
          {recipients.map((recipient) => (
            <RecipientRow
              key={recipient.id}
              recipient={recipient}
              sending={sendingRecipientId === recipient.id}
              onSend={() => onSend(recipient.id)}
              sendingLabel={sendingLabel}
              sendLabel={sendLabel}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default function SendSpotSheet({
  postId,
  userId,
  shareUrl,
  isOpen,
  onClose,
  onRequireAuth,
  onSent,
  isSaved = false,
  onSavedChange,
}: SendSpotSheetProps) {
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);
  const [friends, setFriends] = useState<SendSpotRecipient[]>([]);
  const [recent, setRecent] = useState<SendSpotRecipient[]>([]);
  const [searchResults, setSearchResults] = useState<SendSpotRecipient[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [sendingRecipientId, setSendingRecipientId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sentToast, setSentToast] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);
  const [spotSaved, setSpotSaved] = useState(isSaved);
  const [savePending, setSavePending] = useState(false);

  useBottomSheetScrollLock(isOpen);

  useEffect(() => {
    setMounted(true);
    setCanNativeShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      setError(t("share.errorCopy"));
    }
  };

  const handleNativeShare = async () => {
    if (!navigator.share) {
      return;
    }

    try {
      await navigator.share({
        url: shareUrl,
        title: "SpotDrop",
      });
    } catch (shareError) {
      if (shareError instanceof Error && shareError.name === "AbortError") {
        return;
      }

      setError(t("share.errorShare"));
    }
  };

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
      setError(null);
      setSentToast(false);
      setLinkCopied(false);
      setSavePending(false);
      return;
    }

    setSpotSaved(isSaved);
    void loadRecipients();
  }, [isOpen, isSaved, loadRecipients]);

  useEffect(() => {
    if (!isOpen || !userId || !postId) {
      return;
    }

    let cancelled = false;

    void isSpotSavedByUser(userId, postId).then((result) => {
      if (cancelled || result.error) {
        return;
      }

      setSpotSaved(result.saved);
    });

    return () => {
      cancelled = true;
    };
  }, [isOpen, postId, userId]);

  const handleToggleSave = async () => {
    if (!userId) {
      onRequireAuth?.();
      return;
    }

    if (savePending || sendingRecipientId) {
      return;
    }

    setSavePending(true);
    setError(null);

    const result = await toggleSpotSave(userId, postId);

    setSavePending(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setSpotSaved(result.saved);
    onSavedChange?.(result.saved, result.savedCount);
    onClose();
  };

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

  const handleSendToRecipient = async (recipientId: string) => {
    if (!userId) {
      onRequireAuth?.();
      return;
    }

    if (sendingRecipientId) {
      return;
    }

    setSendingRecipientId(recipientId);
    setError(null);

    const result = await sendSpotToRecipient({
      senderId: userId,
      postId,
      recipientId,
    });

    setSendingRecipientId(null);

    if (result.error) {
      setError(result.error);
      return;
    }

    setSentToast(true);
    onSent?.();

    window.setTimeout(() => {
      setSentToast(false);
      onClose();
    }, 1200);
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
        aria-labelledby="send-spot-title"
        data-bottom-sheet-panel
        className={bottomSheetLayout.panel}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h2 id="send-spot-title" className="text-base font-semibold text-white">
            {t("spotShare.title")}
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

        <div className="space-y-2 border-b border-white/10 px-4 py-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void handleCopyLink()}
              className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-[#050816] px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-white/5"
            >
              {linkCopied ? (
                <Check className="h-4 w-4 text-primary" aria-hidden />
              ) : (
                <Copy className="h-4 w-4" aria-hidden />
              )}
              {linkCopied ? t("share.copied") : t("share.copyLink")}
            </button>
            {canNativeShare ? (
              <button
                type="button"
                onClick={() => void handleNativeShare()}
                className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-[#050816] px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-white/5"
              >
                <Share2 className="h-4 w-4" aria-hidden />
                {t("share.share")}
              </button>
            ) : null}
          </div>

          <button
            type="button"
            disabled={savePending}
            onClick={() => void handleToggleSave()}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-[#050816] px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
            aria-label={spotSaved ? t("spotShare.removeFromSaved") : t("spotShare.saveToSaved")}
          >
            {savePending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Bookmark
                className={`h-4 w-4 shrink-0 ${spotSaved ? "fill-white text-white" : ""}`}
                strokeWidth={spotSaved ? 0 : 1.75}
                aria-hidden
              />
            )}
            {spotSaved ? t("spotShare.removeFromSaved") : t("spotShare.saveToSaved")}
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
          {!userId ? (
            <p className="rounded-2xl border border-dashed border-white/10 px-3 py-4 text-sm text-muted">
              {t("spotShare.signIn")}
            </p>
          ) : loading ? (
            <div className="flex items-center justify-center py-10 text-sm text-muted">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              {t("spotShare.loadingRecipients")}
            </div>
          ) : (
            <>
              <RecipientSection
                title={t("spotShare.friends")}
                recipients={friends}
                sendingRecipientId={sendingRecipientId}
                onSend={(recipientId) => void handleSendToRecipient(recipientId)}
                emptyLabel={t("spotShare.noFriends")}
                sendingLabel={t("common.sending")}
                sendLabel={t("common.send")}
              />

              <RecipientSection
                title={t("spotShare.recentChats")}
                recipients={recentWithoutFriends}
                sendingRecipientId={sendingRecipientId}
                onSend={(recipientId) => void handleSendToRecipient(recipientId)}
                emptyLabel={t("spotShare.noRecentChats")}
                sendingLabel={t("common.sending")}
                sendLabel={t("common.send")}
              />

              {searchQuery.trim() ? (
                <RecipientSection
                  title={t("spotShare.search")}
                  recipients={searchWithoutSelectedSections}
                  sendingRecipientId={sendingRecipientId}
                  onSend={(recipientId) => void handleSendToRecipient(recipientId)}
                  emptyLabel={searching ? t("spotShare.searching") : t("spotShare.noUsersFound")}
                  sendingLabel={t("common.sending")}
                  sendLabel={t("common.send")}
                />
              ) : null}
            </>
          )}

          {error ? (
            <p className="text-sm text-red-300">{localizeUserMessage(t, error) ?? error}</p>
          ) : null}
        </div>

        {sentToast ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center px-4">
            <div className="rounded-full bg-[#050816]/95 px-4 py-2 text-sm font-medium text-white shadow-lg ring-1 ring-white/10">
              {t("spotShare.sent")}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}
