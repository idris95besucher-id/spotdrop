"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, FolderPlus, Loader2, Lock } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import {
  addSpotToCollection,
  createCollection,
  loadSpotCollectionSaveState,
  removeSpotFromCollection,
  type CollectionWithMeta,
  type CollectionVisibility,
} from "@/lib/collections";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import { bottomSheetLayout, useBottomSheetScrollLock } from "@/lib/bottomSheetScrollLock";
import type { TranslationKey } from "@/lib/i18n/messages";

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

type SaveToCollectionSheetProps = {
  postId: string;
  userId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSavedChange?: (savedCollectionIds: string[]) => void;
  onRequireAuth?: () => void;
};

export default function SaveToCollectionSheet({
  postId,
  userId,
  isOpen,
  onClose,
  onSavedChange,
  onRequireAuth,
}: SaveToCollectionSheetProps) {
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);
  const [collections, setCollections] = useState<CollectionWithMeta[]>([]);
  const [savedCollectionIds, setSavedCollectionIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  useBottomSheetScrollLock(isOpen);

  useEffect(() => {
    setMounted(true);
  }, []);

  const loadState = useCallback(async () => {
    if (!postId) {
      console.warn("[SaveToCollectionSheet] loadState skipped: missing postId");
      return;
    }

    if (!userId) {
      setCollections([]);
      setSavedCollectionIds([]);
      setLoading(false);
      setError(null);
      console.log("COLLECTIONS LOADED", { count: 0, reason: "not_signed_in", postId });
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await loadSpotCollectionSaveState(userId, postId);

      setCollections(result.collections);
      setSavedCollectionIds(result.savedCollectionIds);
      setError(result.error);

      console.log("COLLECTIONS LOADED", {
        count: result.collections.length,
        savedCount: result.savedCollectionIds.length,
        postId,
        userId,
        error: result.error,
      });

      if (result.error) {
        console.error("[SaveToCollectionSheet] collections query failed:", result.error);
      }
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : String(loadError);
      setCollections([]);
      setSavedCollectionIds([]);
      setError(message);
      console.error("[SaveToCollectionSheet] collections query threw:", loadError);
      console.log("COLLECTIONS LOADED", { count: 0, postId, userId, error: message });
    } finally {
      setLoading(false);
    }
  }, [postId, userId]);

  useEffect(() => {
    if (!isOpen) {
      setShowCreate(false);
      setNewName("");
      return;
    }

    console.log("OPEN COLLECTION SHEET", {
      postId,
      userId: userId ?? "guest",
      mounted,
    });

    void loadState();
  }, [isOpen, loadState, mounted, postId, userId]);

  useEffect(() => {
    onSavedChange?.(savedCollectionIds);
  }, [onSavedChange, savedCollectionIds]);

  const handleSaveToCollection = async (collectionId: string) => {
    if (!userId || savingId) {
      if (!userId) {
        onRequireAuth?.();
      }
      return;
    }

    if (savedCollectionIds.includes(collectionId)) {
      return;
    }

    setSavingId(collectionId);
    setError(null);

    const result = await addSpotToCollection(collectionId, postId, userId);

    if (result.error) {
      console.error("[SaveToCollectionSheet] addSpotToCollection failed:", result.error);
      setError(result.error);
      setSavingId(null);
      return;
    }

    setSavedCollectionIds((current) => [...current, collectionId]);
    setSavingId(null);
  };

  const handleUnsaveFromCollection = async (collectionId: string) => {
    if (!userId || savingId) {
      if (!userId) {
        onRequireAuth?.();
      }
      return;
    }

    if (!savedCollectionIds.includes(collectionId)) {
      return;
    }

    setSavingId(collectionId);
    setError(null);

    const result = await removeSpotFromCollection(collectionId, postId, userId);

    if (result.error) {
      console.error("[SaveToCollectionSheet] removeSpotFromCollection failed:", result.error);
      setError(result.error);
      setSavingId(null);
      return;
    }

    setSavedCollectionIds((current) => current.filter((id) => id !== collectionId));
    setSavingId(null);
  };

  const handleToggleCollection = (collectionId: string) => {
    if (savedCollectionIds.includes(collectionId)) {
      void handleUnsaveFromCollection(collectionId);
      return;
    }

    void handleSaveToCollection(collectionId);
  };

  const handleCreateCollection = async () => {
    if (!userId) {
      onRequireAuth?.();
      return;
    }

    if (creating) {
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
      console.error("[SaveToCollectionSheet] createCollection failed:", result.error);
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

    await handleSaveToCollection(created.id);
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
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-to-collection-title"
        data-bottom-sheet-panel
        className={bottomSheetLayout.panel}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-white/20 sm:hidden" />

        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h2 id="save-to-collection-title" className="text-sm font-semibold text-white">
            {t("saveCollection.title")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-3 py-1.5 text-sm font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            {t("common.close")}
          </button>
        </div>

        <div data-bottom-sheet-scroll className={`${bottomSheetLayout.scroll} px-4 py-3`}>
          {!userId ? (
            <div className="space-y-4 py-6 text-center">
              <p className="text-sm text-slate-400">{t("saveCollection.signInPrompt")}</p>
              <button
                type="button"
                onClick={() => onRequireAuth?.()}
                className="rounded-full bg-cyan-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
              >
                {t("auth.signIn")}
              </button>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" aria-hidden />
            </div>
          ) : collections.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">{t("saveCollection.noCollections")}</p>
          ) : (
            <ul className="space-y-1">
              {collections.map((collection) => {
                const isSaved = savedCollectionIds.includes(collection.id);
                const isSaving = savingId === collection.id;

                return (
                  <li key={collection.id}>
                    <button
                      type="button"
                      disabled={isSaving || Boolean(savingId)}
                      onClick={() => handleToggleCollection(collection.id)}
                      className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition hover:bg-white/5 disabled:cursor-default disabled:opacity-80"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5 text-slate-300">
                        {isSaving ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        ) : isSaved ? (
                          <Check className="h-4 w-4 text-cyan-300" aria-hidden />
                        ) : (
                          <Lock className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-white">{collection.name}</span>
                        <span className="mt-0.5 block text-xs text-slate-500">
                          {t(visibilityLabelKey(collection.visibility))}
                          {collection.spot_count > 0
                            ? ` · ${
                                collection.spot_count === 1
                                  ? t("collections.spotCountOne")
                                  : t("collections.spotCountMany", { count: collection.spot_count })
                              }`
                            : ""}
                        </span>
                      </span>
                      {isSaved ? <span className="text-xs font-semibold text-cyan-300">{t("postDetail.saved")}</span> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {userId ? (
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
                    className="sd-input mt-2"
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
                    className="flex-1 rounded-full bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:opacity-50"
                  >
                    {creating ? t("collections.creating") : t("collections.create")}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="flex w-full items-center justify-center gap-2 rounded-full border border-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/5"
              >
                <FolderPlus className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                {t("saveCollection.createNew")}
              </button>
            )}

            {error ? <p className="text-xs text-red-300">{localizeUserMessage(t, error) ?? error}</p> : null}
          </div>
        ) : null}
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}
