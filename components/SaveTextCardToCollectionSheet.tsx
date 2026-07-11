"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, FolderPlus, Globe2, Loader2, Lock, UserPlus, Users, X } from "lucide-react";
import CollectionCardCover, { isMySpotsCollectionName } from "@/components/CollectionCardCover";
import { useI18n } from "@/components/I18nProvider";
import {
  createCollection,
  loadUserCollections,
  type CollectionVisibility,
  type CollectionWithMeta,
} from "@/lib/collections";
import { loadCollectionsPreviewMap } from "@/lib/collectionPreview";
import { savePrivateLocationCardToCollection } from "@/lib/createPrivateLocationCardPost";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import { dispatchMapSpotPublished } from "@/lib/mapSpotEvents";
import { dispatchProfileContentRefresh } from "@/lib/profileContentRefresh";
import { normalizePostId } from "@/lib/postIds";
import type { SpotLocationCardFontStyle } from "@/lib/spotLocationCardStyles";
import type { SpotGeoLocation } from "@/lib/spotLocation";
import { bottomSheetLayout, useBottomSheetScrollLock } from "@/lib/bottomSheetScrollLock";
import type { TranslationKey } from "@/lib/i18n/messages";

type SaveTextCardToCollectionSheetProps = {
  isOpen: boolean;
  userId: string;
  cardText: string;
  cardFontStyle: SpotLocationCardFontStyle;
  locationLabel: string;
  location: SpotGeoLocation;
  /** Map Create Text Card — publish as public map pin after save. */
  publishToMap?: boolean;
  onClose: () => void;
  onSaved?: (postId: string) => void;
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

export default function SaveTextCardToCollectionSheet({
  isOpen,
  userId,
  cardText,
  cardFontStyle,
  locationLabel,
  location,
  publishToMap = false,
  onClose,
  onSaved,
}: SaveTextCardToCollectionSheetProps) {
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);
  const [collections, setCollections] = useState<CollectionWithMeta[]>([]);
  const [previewMap, setPreviewMap] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [successCollectionName, setSuccessCollectionName] = useState<string | null>(null);

  useBottomSheetScrollLock(isOpen);

  useEffect(() => {
    setMounted(true);
  }, []);

  const loadCollections = useCallback(async () => {
    setLoading(true);
    setError(null);

    const result = await loadUserCollections(userId, userId);
    setCollections(result.collections);
    setError(result.error);

    if (result.collections.length > 0) {
      const previews = await loadCollectionsPreviewMap(result.collections.map((collection) => collection.id));
      setPreviewMap(previews);
    } else {
      setPreviewMap({});
    }

    setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (!isOpen) {
      setShowCreate(false);
      setNewName("");
      setSuccessCollectionName(null);
      setSavingId(null);
      return;
    }

    void loadCollections();
  }, [isOpen, loadCollections]);

  useEffect(() => {
    if (!successCollectionName) {
      return;
    }

    const timer = window.setTimeout(() => {
      setSuccessCollectionName(null);
      onClose();
    }, 1400);

    return () => {
      window.clearTimeout(timer);
    };
  }, [successCollectionName, onClose]);

  const saveToCollection = async (collection: CollectionWithMeta) => {
    if (savingId || creating || successCollectionName) {
      return;
    }

    setSavingId(collection.id);
    setError(null);

    try {
      const result = await savePrivateLocationCardToCollection({
        userId,
        cardText,
        fontStyle: cardFontStyle,
        locationLabel,
        location,
        collectionId: collection.id,
        publishToMap,
      });

      if (result.error || !result.postId) {
        setError(result.error ?? t("spotEditor.error.publishFailed"));
        return;
      }

      const postId = normalizePostId(result.postId) ?? String(result.postId);
      dispatchProfileContentRefresh();

      if (publishToMap) {
        dispatchMapSpotPublished(postId);
      }

      onSaved?.(postId);
      setSuccessCollectionName(collection.name);
    } catch {
      setError(t("spotEditor.error.publishFailed"));
    } finally {
      setSavingId(null);
    }
  };

  const handleCreateCollection = async () => {
    if (creating || savingId || successCollectionName) {
      return;
    }

    const trimmedName = newName.trim();

    if (!trimmedName) {
      setError(t("saveCollection.error.nameRequired"));
      return;
    }

    setCreating(true);
    setError(null);

    const result = await createCollection({
      userId,
      name: trimmedName,
      visibility: "private",
    });

    if (result.error || !result.collection) {
      setError(result.error ?? t("saveCollection.error.createFailed"));
      setCreating(false);
      return;
    }

    const created = {
      ...result.collection,
      spot_count: 0,
    } satisfies CollectionWithMeta;

    setCollections((current) => [created, ...current]);
    setNewName("");
    setShowCreate(false);
    setCreating(false);

    await saveToCollection(created);
  };

  if (!isOpen || !mounted || typeof document === "undefined") {
    return null;
  }

  const sheet = (
    <div className={bottomSheetLayout.overlay}>
      <button
        type="button"
        className={bottomSheetLayout.backdrop}
        aria-label={t("saveCollection.closeSheet")}
        onClick={onClose}
        disabled={Boolean(savingId) || creating}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-text-card-collection-title"
        data-bottom-sheet-panel
        className={bottomSheetLayout.panel}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-white/20 sm:hidden" />

        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h2 id="save-text-card-collection-title" className="text-base font-semibold text-white">
            {t("saveCollection.title")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={Boolean(savingId) || creating}
            className="rounded-full p-2 text-muted transition hover:bg-white/5 hover:text-white disabled:opacity-50"
            aria-label={t("common.close")}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {successCollectionName ? (
          <SaveSuccessState collectionName={successCollectionName} />
        ) : (
          <>
            <div data-bottom-sheet-scroll className={`${bottomSheetLayout.scroll} px-4 py-4`}>
              {loading ? (
                <div className="grid grid-cols-2 gap-3">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div
                      key={`collection-skeleton-${index}`}
                      className="aspect-[4/5] animate-pulse rounded-2xl bg-white/5"
                    />
                  ))}
                </div>
              ) : collections.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">{t("saveCollection.noCollections")}</p>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {collections.map((collection) => {
                    const Icon = visibilityIcon(collection.visibility);
                    const previews = previewMap[collection.id] ?? [];
                    const isMySpots = isMySpotsCollectionName(collection.name, t("spotEditor.mySpots"));
                    const isSaving = savingId === collection.id;

                    return (
                      <button
                        key={collection.id}
                        type="button"
                        disabled={Boolean(savingId) || creating}
                        onClick={() => void saveToCollection(collection)}
                        className="group overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0B1026] text-left transition hover:border-primary/25 disabled:opacity-60"
                      >
                        <div className="relative">
                          <CollectionCardCover
                            previews={previews}
                            visibilityIcon={Icon}
                            visibilityLabel={t(visibilityLabelKey(collection.visibility))}
                            fallbackCoverUrl={isMySpots ? null : collection.cover_image_url}
                          />
                          {isSaving ? (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/45">
                              <Loader2 className="h-7 w-7 animate-spin text-white" aria-hidden />
                            </div>
                          ) : null}
                        </div>
                        <div className="p-3">
                          <p className="line-clamp-2 text-sm font-semibold text-white">{collection.name}</p>
                          <p className="mt-1 text-[11px] text-muted">
                            {collection.spot_count === 1
                              ? t("collections.spotCountOne")
                              : t("collections.spotCountMany", { count: collection.spot_count })}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {error ? (
                <p className="mt-3 text-sm text-red-300">{localizeUserMessage(t, error) ?? error}</p>
              ) : null}
            </div>

            <div className={`${bottomSheetLayout.footer} space-y-3 px-4 py-3`}>
              {showCreate ? (
                <div className="space-y-2">
                  <label className="block">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      {t("saveCollection.newCollection")}
                    </span>
                    <input
                      type="text"
                      value={newName}
                      onChange={(event) => setNewName(event.target.value)}
                      placeholder={t("saveCollection.namePlaceholder")}
                      disabled={creating}
                      className="mt-2 w-full rounded-2xl border border-white/10 bg-[#050816] px-4 py-3 text-sm text-white outline-none transition focus:border-primary/45"
                    />
                  </label>
                  <p className="text-[11px] text-slate-500">{t("saveCollection.privateDefault")}</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={creating}
                      onClick={() => {
                        setShowCreate(false);
                        setNewName("");
                      }}
                      className="flex-1 rounded-full border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-white/5"
                    >
                      {t("common.cancel")}
                    </button>
                    <button
                      type="button"
                      disabled={creating || !newName.trim()}
                      onClick={() => void handleCreateCollection()}
                      className="flex-1 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-[#050816] transition hover:brightness-110 disabled:opacity-50"
                    >
                      {creating ? t("collections.creating") : t("collections.create")}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={Boolean(savingId) || creating}
                  onClick={() => setShowCreate(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-full border border-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/5 disabled:opacity-50"
                >
                  <FolderPlus className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  + {t("collections.new")}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}

function SaveSuccessState({ collectionName }: { collectionName: string }) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setVisible(true);
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="flex min-h-[16rem] flex-col items-center justify-center px-6 py-10 text-center">
      <div
        className={`flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30 transition-all duration-300 ease-out ${
          visible ? "scale-100 opacity-100" : "scale-75 opacity-0"
        }`}
      >
        <Check className="h-8 w-8" strokeWidth={2.5} aria-hidden />
      </div>
      <p className="mt-5 text-base font-semibold text-white">
        {t("spotLocationCard.savedToCollection", { name: collectionName })}
      </p>
    </div>
  );
}
