"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Search, UserRound, X } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import {
  loadSendSpotFriends,
  loadSendSpotRecentChats,
  searchSendSpotRecipients,
  type SendSpotRecipient,
} from "@/lib/sendSpotRecipients";

type GroupMemberPickerProps = {
  userId: string;
  /** User ids to hide entirely (e.g. members already in the group). */
  excludeUserIds?: string[];
  selected: Map<string, SendSpotRecipient>;
  onChange: (next: Map<string, SendSpotRecipient>) => void;
  searchPlaceholder?: string;
  /** Render nothing but the search/list — chips are shown by a parent instead. */
  hideChips?: boolean;
  /** Single-tap mode (e.g. "New message" user search) — tapping a row calls this instead of toggling a checkmark. */
  onSelectSingle?: (recipient: SendSpotRecipient) => void;
};

function RecipientRow({
  recipient,
  selected,
  showCheckmark,
  onToggle,
}: {
  recipient: SendSpotRecipient;
  selected: boolean;
  showCheckmark: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition ${
        selected ? "border-cyan-400/35 bg-cyan-400/10" : "border-white/10 bg-[#050816]/80 hover:bg-white/[0.04]"
      }`}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-slate-900">
        {recipient.avatar_url ? (
          <img src={recipient.avatar_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <UserRound className="h-4 w-4 text-slate-400" strokeWidth={1.5} aria-hidden />
        )}
      </div>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">@{recipient.username}</span>
      {showCheckmark ? (
        <span
          className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
            selected ? "border-cyan-300 bg-cyan-400 text-slate-950" : "border-white/20 bg-transparent"
          }`}
          aria-hidden
        >
          {selected ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : null}
        </span>
      ) : null}
    </button>
  );
}

export default function GroupMemberPicker({
  userId,
  excludeUserIds,
  selected,
  onChange,
  searchPlaceholder,
  hideChips,
  onSelectSingle,
}: GroupMemberPickerProps) {
  const { t } = useI18n();
  const [friends, setFriends] = useState<SendSpotRecipient[]>([]);
  const [recent, setRecent] = useState<SendSpotRecipient[]>([]);
  const [searchResults, setSearchResults] = useState<SendSpotRecipient[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const excludeSet = useMemo(() => new Set(excludeUserIds ?? []), [excludeUserIds]);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    void Promise.all([loadSendSpotFriends(userId), loadSendSpotRecentChats(userId)]).then(
      ([friendsResult, recentResult]) => {
        setFriends(friendsResult.recipients);
        setRecent(recentResult.recipients);
        setError(friendsResult.error ?? recentResult.error);
        setLoading(false);
      }
    );
  }, [userId]);

  useEffect(() => {
    const trimmed = searchQuery.trim();

    if (!userId || trimmed.length < 2) {
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
  }, [searchQuery, userId]);

  const visibleRecipients = useMemo(() => {
    const trimmed = searchQuery.trim();
    const source = trimmed.length >= 2 ? searchResults : (() => {
      const merged = new Map<string, SendSpotRecipient>();
      for (const recipient of [...recent, ...friends]) {
        merged.set(recipient.id, recipient);
      }
      return Array.from(merged.values());
    })();

    return source.filter((recipient) => !excludeSet.has(recipient.id));
  }, [excludeSet, friends, recent, searchQuery, searchResults]);

  const toggleRecipient = (recipient: SendSpotRecipient) => {
    if (onSelectSingle) {
      onSelectSingle(recipient);
      return;
    }

    const next = new Map(selected);

    if (next.has(recipient.id)) {
      next.delete(recipient.id);
    } else {
      next.set(recipient.id, recipient);
    }

    onChange(next);
  };

  const localizedError = localizeUserMessage(t, error);
  const selectedList = Array.from(selected.values());

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!hideChips && selectedList.length > 0 ? (
        <div className="flex shrink-0 flex-wrap gap-2 px-4 pb-3">
          {selectedList.map((recipient) => (
            <button
              key={recipient.id}
              type="button"
              onClick={() => toggleRecipient(recipient)}
              className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1.5 text-xs font-medium text-cyan-100 transition hover:bg-cyan-400/15"
            >
              @{recipient.username}
              <X className="h-3 w-3" strokeWidth={2.5} aria-hidden />
            </button>
          ))}
        </div>
      ) : null}

      <div className="shrink-0 px-4 pb-3">
        <label className="relative block">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={searchPlaceholder ?? t("newMessage.searchPlaceholder")}
            className="w-full rounded-2xl border border-white/10 bg-[#050816] py-2.5 pl-10 pr-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-primary/45"
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 pb-4">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            {t("newMessage.loadingUsers")}
          </div>
        ) : visibleRecipients.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">{t("newMessage.noUsersFound")}</p>
        ) : (
          visibleRecipients.map((recipient) => (
            <RecipientRow
              key={recipient.id}
              recipient={recipient}
              selected={selected.has(recipient.id)}
              showCheckmark={!onSelectSingle}
              onToggle={() => toggleRecipient(recipient)}
            />
          ))
        )}

        {searching ? (
          <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            {t("spotShare.searching")}
          </div>
        ) : null}

        {localizedError ? <p className="pt-2 text-xs text-red-300">{localizedError}</p> : null}
      </div>
    </div>
  );
}
