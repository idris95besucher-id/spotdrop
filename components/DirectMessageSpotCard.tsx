"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2, MapPin, Play } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { usePostViewerOptional } from "@/components/PostViewerProvider";
import { formatChatMessageTime } from "@/lib/chatDates";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import { publicProfileUsername } from "@/lib/publicProfile";
import { loadSpotMessagePreview, type SpotMessagePreview } from "@/lib/spotMessagePreview";
import type { ViewerPostListItem } from "@/lib/postViewer";

type DirectMessageSpotCardProps = {
  postId: string;
  isOwnMessage: boolean;
  senderUsername: string;
  createdAt: string;
};

export default function DirectMessageSpotCard({
  postId,
  isOwnMessage,
  senderUsername,
  createdAt,
}: DirectMessageSpotCardProps) {
  const router = useRouter();
  const { t } = useI18n();
  const postViewer = usePostViewerOptional();
  const [preview, setPreview] = useState<SpotMessagePreview | null>(null);
  const [viewerItem, setViewerItem] = useState<ViewerPostListItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  const displaySender = publicProfileUsername(senderUsername);

  useEffect(() => {
    let cancelled = false;

    void loadSpotMessagePreview(postId).then((result) => {
      if (cancelled) {
        return;
      }

      setPreview(result.preview);
      setViewerItem(result.viewerItem);
      setError(result.error);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [postId]);

  const openSpot = async () => {
    if (opening) {
      return;
    }

    setOpening(true);

    let item = viewerItem;
    let nextPreview = preview;

    if (!item) {
      const result = await loadSpotMessagePreview(postId);
      item = result.viewerItem;
      nextPreview = result.preview;
      setViewerItem(item);
      setPreview(nextPreview);
      setError(result.error);
    }

    setOpening(false);

    if (!item) {
      setError(t("spotShare.spotUnavailable"));
      return;
    }

    if (postViewer) {
      postViewer.openPostViewer([item], {
        initialSpotId: item.id,
        initialMediaUrl: nextPreview?.thumbnailUrl ?? null,
      });
      return;
    }

    router.push(`/posts/${item.id}`);
  };

  const title = isOwnMessage
    ? t("spotShare.youSentSpot")
    : t("spotShare.sentYouSpot", { sender: displaySender });

  if (loading) {
    return (
      <div className="max-w-[85%] rounded-[22px] border border-white/10 bg-[#0B1026] px-4 py-3 text-sm text-muted">
        {t("spotShare.loadingSpot")}
      </div>
    );
  }

  if (!preview) {
    const displayError = localizeUserMessage(t, error) ?? error ?? t("spotShare.spotUnavailable");

    return (
      <div className="max-w-[85%] rounded-[22px] border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
        {displayError}
      </div>
    );
  }

  return (
    <div
      className={`max-w-[85%] overflow-hidden rounded-[22px] shadow-md shadow-black/20 ${
        isOwnMessage
          ? "rounded-br-md bg-primary/15 text-cyan-50"
          : "rounded-bl-md border border-white/10 bg-[#0B1026] text-slate-100"
      }`}
    >
      <button
        type="button"
        disabled={opening}
        onClick={() => void openSpot()}
        className="w-full text-left transition hover:brightness-[1.03] disabled:opacity-60"
      >
        <div className="px-4 pt-3">
          <p className="text-sm font-medium text-white">{title}</p>
        </div>

        <div className="mt-3 px-4">
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/40">
            {preview.thumbnailUrl ? (
              <img src={preview.thumbnailUrl} alt="" className="aspect-[4/5] w-full object-cover" />
            ) : (
              <div className="flex aspect-[4/5] w-full items-center justify-center bg-slate-900 text-xs text-muted">
                {t("map.noPreview")}
              </div>
            )}
            {preview.isVideo ? (
              <span className="absolute bottom-2 right-2 rounded-full bg-black/60 p-1.5 text-white">
                <Play className="h-3.5 w-3.5 fill-current" aria-hidden />
              </span>
            ) : null}
          </div>
        </div>

        <div className="space-y-1 px-4 py-3">
          {preview.spotName ? <p className="text-sm font-semibold text-white">{preview.spotName}</p> : null}
          {preview.locationLabel ? (
            <p className="flex items-start gap-1.5 text-xs text-slate-300">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
              <span>{preview.locationLabel}</span>
            </p>
          ) : null}
        </div>
      </button>

      <div className="px-4 pb-3">
        <button
          type="button"
          disabled={opening}
          onClick={() => void openSpot()}
          className="w-full rounded-xl bg-primary px-3 py-2.5 text-xs font-semibold text-[#050816] transition hover:brightness-110 disabled:opacity-60"
        >
          {opening ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              {t("spotShare.opening")}
            </span>
          ) : (
            t("spotShare.openSpot")
          )}
        </button>

        {error ? (
          <p className="mt-2 text-xs text-red-300">{localizeUserMessage(t, error) ?? error}</p>
        ) : null}

        <p className={`pt-2 text-[10px] ${isOwnMessage ? "text-primary/70" : "text-muted"}`}>
          {formatChatMessageTime(createdAt)}
        </p>
      </div>
    </div>
  );
}
