"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FolderPlus, Globe2, Lock, UserPlus, Users } from "lucide-react";
import CollectionCardCover, { isMySpotsCollectionName } from "@/components/CollectionCardCover";
import { useI18n } from "@/components/I18nProvider";
import {
  COLLECTION_VISIBILITY_OPTIONS,
  createCollection,
  loadUserCollections,
  type CollectionVisibility,
  type CollectionWithMeta,
} from "@/lib/collections";
import { loadCollectionsPreviewMap } from "@/lib/collectionPreview";
import { localizeError } from "@/lib/i18n/localizeError";
import type { TranslationKey } from "@/lib/i18n/messages";

type ProfileCollectionsTabProps = {
  userId: string;
  viewerId: string | null;
  isOwner: boolean;
};

function visibilityIcon(visibility: CollectionVisibility) {
  switch (visibility) {
    case "public":
      return Globe2;
    case "friends":
      return Users;
    case "invite":
      return UserPlus;
    default:
      return Lock;
  }
}

function visibilityLabelKey(visibility: CollectionVisibility): TranslationKey {
  switch (visibility) {
    case "public":
      return "collections.visibility.public";
    case "friends":
      return "collections.visibility.friends";
    case "invite":
      return "collections.visibility.invite";
    default:
      return "collections.visibility.private";
  }
}

export default function ProfileCollectionsTab({ userId, viewerId, isOwner }: ProfileCollectionsTabProps) {
  const { t } = useI18n();
  const [collections, setCollections] = useState<CollectionWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<CollectionVisibility>("private");
  const [creating, setCreating] = useState(false);
  const [previewMap, setPreviewMap] = useState<Record<string, string[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const result = await loadUserCollections(userId, viewerId);

    setCollections(result.collections);
    setError(result.error);

    if (result.collections.length > 0) {
      const previews = await loadCollectionsPreviewMap(result.collections.map((collection) => collection.id));
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

    const result = await createCollection({
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
          {showCreate ? t("collections.cancel") : t("collections.new")}
        </button>
      ) : null}

      {showCreate && isOwner ? (
        <div className="sd-card space-y-3 p-4">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("collections.namePlaceholder")}
            maxLength={80}
            className="sd-input"
          />
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t("collections.descriptionPlaceholder")}
            rows={2}
            className="sd-input resize-none"
          />
          <select
            value={visibility}
            onChange={(event) => setVisibility(event.target.value as CollectionVisibility)}
            className="sd-input"
          >
            {COLLECTION_VISIBILITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(visibilityLabelKey(option.value))}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={creating || !name.trim()}
            onClick={() => void handleCreate()}
            className="sd-btn-primary w-full"
          >
            {creating ? t("collections.creating") : t("collections.create")}
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
            <div key={`collection-skeleton-${index}`} className="aspect-[4/5] animate-pulse rounded-2xl bg-card" />
          ))}
        </div>
      ) : collections.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-[#050816] px-4 py-10 text-center">
          <p className="text-sm font-medium text-white">{t("collections.emptyTitle")}</p>
          <p className="mt-1.5 text-xs text-muted">
            {isOwner ? t("collections.emptyOwner") : t("collections.emptyViewer")}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {collections.map((collection) => {
            const Icon = visibilityIcon(collection.visibility);
            const previews = previewMap[collection.id] ?? [];
            const isMySpots = isMySpotsCollectionName(collection.name, t("spotEditor.mySpots"));

            return (
              <Link
                key={collection.id}
                href={`/collections?id=${collection.id}`}
                className="group overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0B1026] transition hover:border-primary/25"
              >
                <CollectionCardCover
                  previews={previews}
                  visibilityIcon={Icon}
                  visibilityLabel={t(visibilityLabelKey(collection.visibility))}
                  fallbackCoverUrl={isMySpots ? null : collection.cover_image_url}
                />
                <div className="p-3">
                  <p className="line-clamp-2 text-sm font-semibold text-white">{collection.name}</p>
                  <p className="mt-1 text-[11px] text-muted">
                    {collection.spot_count === 1
                      ? t("collections.spotCountOne")
                      : t("collections.spotCountMany", { count: collection.spot_count })}
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
