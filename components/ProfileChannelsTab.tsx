"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FolderPlus, Globe2, Lock } from "lucide-react";
import CollectionCardCover from "@/components/CollectionCardCover";
import { useI18n } from "@/components/I18nProvider";
import { loadChannelsPreviewMap } from "@/lib/channelPreview";
import {
  CHANNEL_VISIBILITY_OPTIONS,
  createChannel,
  loadUserChannels,
  type ChannelVisibility,
  type ChannelWithMeta,
} from "@/lib/channels";
import { localizeError } from "@/lib/i18n/localizeError";
import type { TranslationKey } from "@/lib/i18n/messages";

type ProfileChannelsTabProps = {
  userId: string;
  viewerId: string | null;
  isOwner: boolean;
};

function visibilityIcon(visibility: ChannelVisibility) {
  return visibility === "public" ? Globe2 : Lock;
}

function visibilityLabelKey(visibility: ChannelVisibility): TranslationKey {
  return visibility === "public" ? "channels.visibility.public" : "channels.visibility.private";
}

export default function ProfileChannelsTab({ userId, viewerId, isOwner }: ProfileChannelsTabProps) {
  const { t } = useI18n();
  const [channels, setChannels] = useState<ChannelWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<ChannelVisibility>("private");
  const [creating, setCreating] = useState(false);
  const [previewMap, setPreviewMap] = useState<Record<string, string[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const result = await loadUserChannels(userId, viewerId);

    setChannels(result.channels);
    setError(result.error);

    if (result.channels.length > 0) {
      const previews = await loadChannelsPreviewMap(result.channels.map((channel) => channel.id));
      setPreviewMap(previews);
    } else {
      setPreviewMap({});
    }

    setLoading(false);
  }, [userId, viewerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async () => {
    if (!isOwner || !viewerId) {
      return;
    }

    setCreating(true);
    setError(null);

    const result = await createChannel({
      userId: viewerId,
      name,
      description,
      visibility,
    });

    if (result.error) {
      setError(result.error);
      setCreating(false);
      return;
    }

    setName("");
    setDescription("");
    setVisibility("private");
    setShowCreate(false);
    setCreating(false);
    void load();
  };

  return (
    <div className="space-y-4 px-1 py-2">
      {isOwner ? (
        <button
          type="button"
          onClick={() => setShowCreate((current) => !current)}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-primary/25 bg-primary/10 px-4 py-3 text-sm font-semibold text-primary transition hover:bg-primary/15"
        >
          <FolderPlus className="h-4 w-4" aria-hidden />
          {showCreate ? t("common.cancel") : t("channels.new")}
        </button>
      ) : null}

      {showCreate && isOwner ? (
        <div className="space-y-3 rounded-2xl border border-white/10 bg-card p-4">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("channels.namePlaceholder")}
            maxLength={80}
            className="w-full rounded-2xl border border-white/10 bg-[#050816] px-4 py-3 text-sm text-white outline-none transition focus:border-primary/45"
          />
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t("channels.descriptionPlaceholder")}
            rows={2}
            className="w-full resize-none rounded-2xl border border-white/10 bg-[#050816] px-4 py-3 text-sm text-white outline-none transition focus:border-primary/45"
          />
          <select
            value={visibility}
            onChange={(event) => setVisibility(event.target.value as ChannelVisibility)}
            className="w-full rounded-2xl border border-white/10 bg-[#050816] px-4 py-3 text-sm text-white outline-none transition focus:border-primary/45"
          >
            {CHANNEL_VISIBILITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(visibilityLabelKey(option.value))}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={creating || !name.trim()}
            onClick={() => void handleCreate()}
            className="w-full rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-[#050816] transition hover:brightness-110 disabled:opacity-50"
          >
            {creating ? t("channels.creating") : t("channels.create")}
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {localizeError(t, error) ?? error}
        </p>
      ) : null}

      {loading ? (
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={`channel-skeleton-${index}`} className="aspect-[4/5] animate-pulse rounded-2xl bg-card" />
          ))}
        </div>
      ) : channels.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-[#050816] px-4 py-10 text-center">
          <p className="text-sm font-medium text-white">{t("channels.emptyTitle")}</p>
          <p className="mt-1.5 text-xs text-muted">
            {isOwner ? t("channels.emptyOwner") : t("channels.emptyViewer")}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {channels.map((channel) => {
            const Icon = visibilityIcon(channel.visibility);
            const previews = previewMap[channel.id] ?? [];

            return (
              <Link
                key={channel.id}
                href={`/channels?id=${channel.id}`}
                className="group overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0B1026] transition hover:border-primary/25"
              >
                <CollectionCardCover
                  previews={previews}
                  visibilityIcon={Icon}
                  visibilityLabel={t(visibilityLabelKey(channel.visibility))}
                  fallbackCoverUrl={channel.cover_image_url}
                />
                <div className="p-3">
                  <p className="line-clamp-2 text-sm font-semibold text-white">{channel.name}</p>
                  {channel.description ? (
                    <p className="mt-1 line-clamp-2 text-[11px] text-slate-400">{channel.description}</p>
                  ) : null}
                  <p className="mt-1 text-[11px] text-muted">
                    {channel.item_count === 1
                      ? t("channels.itemCountOne")
                      : t("channels.itemCountMany", { count: channel.item_count })}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
