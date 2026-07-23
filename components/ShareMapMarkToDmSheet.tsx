"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronLeft, Loader2, Search, Send, Users } from "lucide-react";
import ProfileAvatar from "@/components/ProfileAvatar";
import { useI18n } from "@/components/I18nProvider";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import type { CityRoomMapMarkPayload } from "@/lib/cityRoomMapMarkMessage";
import { sendMapMarkToRecipientsAndGroups } from "@/lib/sendMapMarkMessage";
import {
  loadSendSpotFriends,
  loadSendSpotRecentChats,
  searchSendSpotRecipients,
  type SendSpotRecipient,
} from "@/lib/sendSpotRecipients";
import { loadGroupInbox, type GroupChatSummary } from "@/lib/groupChats";
import { formatGroupChatPreview } from "@/lib/i18n/chatPreview";
import { bottomSheetLayout, useBottomSheetScrollLock } from "@/lib/bottomSheetScrollLock";

type ShareMapMarkToDmSheetProps = {
  mark: CityRoomMapMarkPayload;
  userId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onBack: () => void;
  onSent?: () => void;
};

/** Same "user:<id>" / "group:<id>" namespacing as ShareMapPlaceToDmSheet — see that file for why. */
const USER_KEY_PREFIX = "user:";
const GROUP_KEY_PREFIX = "group:";

function RecipientSelectRow({
  recipient,
  selected,
  disabled,
  onToggle,
}: {
  recipient: SendSpotRecipient;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
        selected
          ? "border-cyan-400/35 bg-cyan-400/10"
          : "border-white/10 bg-[#050816]/80 hover:bg-white/[0.04]"
      }`}
    >
      <ProfileAvatar
        src={recipient.avatar_url}
        sizeClassName="h-10 w-10"
        iconClassName="h-4 w-4"
        className="border border-white/10"
      />
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">@{recipient.username}</span>
      <span
        className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
          selected ? "border-cyan-300 bg-cyan-400 text-slate-950" : "border-white/20 bg-transparent"
        }`}
        aria-hidden
      >
        {selected ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : null}
      </span>
    </button>
  );
}

function GroupSelectRow({
  group,
  selected,
  disabled,
  onToggle,
}: {
  group: GroupChatSummary;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  const preview = formatGroupChatPreview(group.lastMessage, group.lastMessageType, t, 60);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
        selected
          ? "border-cyan-400/35 bg-cyan-400/10"
          : "border-white/10 bg-[#050816]/80 hover:bg-white/[0.04]"
      }`}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-slate-900">
        {group.photoUrl ? (
          <img src={group.photoUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <Users className="h-4 w-4 text-slate-400" strokeWidth={1.5} aria-hidden />
        )}
      </div>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-white">{group.name}</span>
        <span className="block truncate text-xs text-slate-400">{preview}</span>
      </span>
      <span
        className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
          selected ? "border-cyan-300 bg-cyan-400 text-slate-950" : "border-white/20 bg-transparent"
        }`}
        aria-hidden
      >
        {selected ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : null}
      </span>
    </button>
  );
}

export default function ShareMapMarkToDmSheet({
  mark,
  userId,
  isOpen,
  onClose,
  onBack,
  onSent,
}: ShareMapMarkToDmSheetProps) {
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);
  const [friends, setFriends] = useState<SendSpotRecipient[]>([]);
  const [recent, setRecent] = useState<SendSpotRecipient[]>([]);
  const [groups, setGroups] = useState<GroupChatSummary[]>([]);
  const [searchResults, setSearchResults] = useState<SendSpotRecipient[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useBottomSheetScrollLock(isOpen);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery("");
      setSearchResults([]);
      setError(null);
      setSelectedIds(new Set());
      return;
    }

    if (!userId) {
      setFriends([]);
      setRecent([]);
      setGroups([]);
      return;
    }

    setLoading(true);
    setError(null);

    void Promise.all([
      loadSendSpotFriends(userId),
      loadSendSpotRecentChats(userId),
      loadGroupInbox(userId),
    ]).then(([friendsResult, recentResult, groupsResult]) => {
      setFriends(friendsResult.recipients);
      setRecent(recentResult.recipients);
      setGroups(groupsResult.groups);
      setError(friendsResult.error ?? recentResult.error ?? groupsResult.error);
      setLoading(false);
    });
  }, [isOpen, userId]);

  useEffect(() => {
    const trimmed = searchQuery.trim();

    if (!isOpen || !userId || trimmed.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);

    const timer = window.setTimeout(() => {
      void searchSendSpotRecipients(trimmed, userId).then((result) => {
        setSearchResults(result.recipients);
        setSearching(false);
        setError(result.error);
      });
    }, 250);

    return () => window.clearTimeout(timer);
  }, [isOpen, searchQuery, userId]);

  const visibleRecipients = useMemo(() => {
    const trimmed = searchQuery.trim();

    if (trimmed.length >= 2) {
      return searchResults;
    }

    const merged = new Map<string, SendSpotRecipient>();

    for (const recipient of [...recent, ...friends]) {
      merged.set(recipient.id, recipient);
    }

    return Array.from(merged.values());
  }, [friends, recent, searchQuery, searchResults]);

  const visibleGroups = useMemo(() => {
    const trimmed = searchQuery.trim().toLowerCase();

    if (trimmed.length < 2) {
      return groups;
    }

    return groups.filter((group) => group.name.toLowerCase().includes(trimmed));
  }, [groups, searchQuery]);

  const toggleUser = useCallback((recipientId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      const key = `${USER_KEY_PREFIX}${recipientId}`;

      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }

      return next;
    });
  }, []);

  const toggleGroup = useCallback((groupId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      const key = `${GROUP_KEY_PREFIX}${groupId}`;

      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }

      return next;
    });
  }, []);

  const handleSend = async () => {
    if (!userId || sending || selectedIds.size === 0) {
      return;
    }

    setSending(true);
    setError(null);

    const recipientIds: string[] = [];
    const groupIds: string[] = [];

    for (const key of selectedIds) {
      if (key.startsWith(USER_KEY_PREFIX)) {
        recipientIds.push(key.slice(USER_KEY_PREFIX.length));
      } else if (key.startsWith(GROUP_KEY_PREFIX)) {
        groupIds.push(key.slice(GROUP_KEY_PREFIX.length));
      }
    }

    const result = await sendMapMarkToRecipientsAndGroups({
      senderId: userId,
      recipientIds,
      groupIds,
      mark,
    });

    setSending(false);

    if (result.sentCount === 0) {
      setError(result.error ?? t("map.shareMark.error.sendFailed"));
      return;
    }

    onSent?.();
    onClose();
  };

  const localizedError = localizeUserMessage(t, error);
  const hasAnyResults = visibleRecipients.length > 0 || visibleGroups.length > 0;

  if (!isOpen || !mounted) {
    return null;
  }

  return createPortal(
    <div className={`${bottomSheetLayout.overlay} z-[220]`}>
      <button type="button" className={bottomSheetLayout.backdrop} aria-label={t("common.close")} onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-map-mark-dm-title"
        data-bottom-sheet-panel
        className={`${bottomSheetLayout.panel} max-w-lg sd-modal-panel`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-white/20 sm:hidden" />

        <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-4 py-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-white"
            aria-label={t("common.back")}
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <div className="min-w-0 flex-1">
            <h2 id="share-map-mark-dm-title" className="truncate text-base font-semibold text-white">
              {t("map.sharePlace.sendInDm")}
            </h2>
            <p className="truncate text-xs text-slate-400">{mark.text}</p>
          </div>
        </div>

        <div className="shrink-0 px-4 py-3">
          <label className="relative block">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
              aria-hidden
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t("spotShare.searchUsers")}
              className="w-full rounded-2xl border border-white/10 bg-[#050816] py-2.5 pl-10 pr-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-primary/45"
            />
          </label>
        </div>

        <div data-bottom-sheet-scroll className={`${bottomSheetLayout.scroll} space-y-2 px-4 pb-2`}>
          {!userId ? (
            <p className="py-8 text-center text-sm text-muted">{t("spotShare.signIn")}</p>
          ) : loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              {t("spotShare.loadingRecipients")}
            </div>
          ) : !hasAnyResults ? (
            <p className="py-8 text-center text-sm text-muted">
              {searchQuery.trim().length >= 2 ? t("spotShare.noUsersFound") : t("spotShare.noFriends")}
            </p>
          ) : (
            <>
              {visibleRecipients.length > 0 ? (
                <div className="space-y-2">
                  <p className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {t("map.sharePlace.sectionPeople")}
                  </p>
                  {visibleRecipients.map((recipient) => (
                    <RecipientSelectRow
                      key={`user-${recipient.id}`}
                      recipient={recipient}
                      selected={selectedIds.has(`${USER_KEY_PREFIX}${recipient.id}`)}
                      disabled={sending}
                      onToggle={() => toggleUser(recipient.id)}
                    />
                  ))}
                </div>
              ) : null}

              {visibleGroups.length > 0 ? (
                <div className="space-y-2 pt-1">
                  <p className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {t("map.sharePlace.sectionGroups")}
                  </p>
                  {visibleGroups.map((group) => (
                    <GroupSelectRow
                      key={`group-${group.id}`}
                      group={group}
                      selected={selectedIds.has(`${GROUP_KEY_PREFIX}${group.id}`)}
                      disabled={sending}
                      onToggle={() => toggleGroup(group.id)}
                    />
                  ))}
                </div>
              ) : null}
            </>
          )}

          {searching ? (
            <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              {t("spotShare.searching")}
            </div>
          ) : null}

          {localizedError ? <p className="pt-2 text-xs text-red-300">{localizedError}</p> : null}
        </div>

        <div className={`${bottomSheetLayout.footer} px-4 py-3`}>
          <button
            type="button"
            disabled={!userId || sending || selectedIds.size === 0}
            onClick={() => void handleSend()}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-semibold text-background transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-55"
          >
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                {t("common.sending")}
              </>
            ) : (
              <>
                <Send className="h-4 w-4" aria-hidden />
                {t("map.sharePlace.sendToCount", { count: selectedIds.size })}
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
