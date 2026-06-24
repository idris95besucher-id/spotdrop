import { createSpotDraftId } from "@/lib/spotDraft/helpers";
import type {
  SpotDraftBlobField,
  SpotDraftRecord,
  SpotDraftStorageAdapter,
  SpotDraftUpsertPayload,
} from "@/lib/spotDraft/types";

const DB_NAME = "spotdrop_spot_drafts";
const DB_VERSION = 1;
const DRAFTS_STORE = "drafts";
const BLOBS_STORE = "blobs";

function blobKey(draftId: string, field: SpotDraftBlobField) {
  return `${draftId}:${field}`;
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function waitForTransaction(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
  });
}

function openSpotDraftDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available on this device."));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(request.error ?? new Error("Unable to open Spot draft storage."));
    };

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(DRAFTS_STORE)) {
        const store = db.createObjectStore(DRAFTS_STORE, { keyPath: "id" });
        store.createIndex("userId", "userId", { unique: false });
        store.createIndex("uploadStatus", "uploadStatus", { unique: false });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }

      if (!db.objectStoreNames.contains(BLOBS_STORE)) {
        db.createObjectStore(BLOBS_STORE);
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };
  });
}

function recordFromPayload(payload: SpotDraftUpsertPayload, existing: SpotDraftRecord | null): SpotDraftRecord {
  const now = new Date().toISOString();
  const id = payload.id ?? existing?.id ?? createSpotDraftId();

  return {
    id,
    userId: payload.userId,
    spotName: payload.spotName,
    collectionId: payload.collectionId,
    location: payload.location,
    locationSource: payload.locationSource,
    matchedPlaceName: payload.matchedPlaceName,
    media: {
      id: payload.media.id,
      mediaType: payload.media.mediaType,
      fileName: payload.media.file.name || `${payload.media.mediaType}-${id}`,
      mimeType: payload.media.file.type || (payload.media.mediaType === "video" ? "video/mp4" : "image/jpeg"),
      sourceDuration: payload.media.sourceDuration,
      trimStart: payload.media.trimStart,
      trimEnd: payload.media.trimEnd,
      trimConfirmed: payload.media.trimConfirmed,
      coverFileName: payload.media.coverFile?.name ?? existing?.media.coverFileName ?? null,
      coverMimeType: payload.media.coverFile?.type ?? existing?.media.coverMimeType ?? null,
      musicTrackId: payload.media.musicTrackId ?? existing?.media.musicTrackId ?? null,
      musicTrackTitle: payload.media.musicTrackTitle ?? existing?.media.musicTrackTitle ?? null,
      musicTrackArtist: payload.media.musicTrackArtist ?? existing?.media.musicTrackArtist ?? null,
      musicTrackCoverUrl: payload.media.musicTrackCoverUrl ?? existing?.media.musicTrackCoverUrl ?? null,
      musicTrackAudioUrl: payload.media.musicTrackAudioUrl ?? existing?.media.musicTrackAudioUrl ?? null,
      musicTrackDurationSeconds:
        payload.media.musicTrackDurationSeconds ?? existing?.media.musicTrackDurationSeconds ?? null,
    },
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    uploadStatus: payload.uploadStatus,
    uploadError: payload.uploadError ?? null,
  };
}

export function createIndexedDbSpotDraftStorage(): SpotDraftStorageAdapter {
  return {
    async listDrafts(userId) {
      const db = await openSpotDraftDatabase();

      try {
        const transaction = db.transaction(DRAFTS_STORE, "readonly");
        const store = transaction.objectStore(DRAFTS_STORE);
        const index = store.index("userId");
        const drafts = await requestToPromise(index.getAll(userId));
        await waitForTransaction(transaction);

        return (drafts as SpotDraftRecord[]).sort(
          (left, right) => right.updatedAt.localeCompare(left.updatedAt)
        );
      } finally {
        db.close();
      }
    },

    async getDraft(draftId) {
      const db = await openSpotDraftDatabase();

      try {
        const transaction = db.transaction(DRAFTS_STORE, "readonly");
        const store = transaction.objectStore(DRAFTS_STORE);
        const draft = await requestToPromise(store.get(draftId));
        await waitForTransaction(transaction);
        return (draft as SpotDraftRecord | undefined) ?? null;
      } finally {
        db.close();
      }
    },

    async getDraftBlob(draftId, field) {
      const db = await openSpotDraftDatabase();

      try {
        const transaction = db.transaction(BLOBS_STORE, "readonly");
        const store = transaction.objectStore(BLOBS_STORE);
        const blob = await requestToPromise(store.get(blobKey(draftId, field)));
        await waitForTransaction(transaction);
        return (blob as Blob | undefined) ?? null;
      } finally {
        db.close();
      }
    },

    async upsertDraft(payload) {
      const db = await openSpotDraftDatabase();

      try {
        const readTransaction = db.transaction(DRAFTS_STORE, "readonly");
        const readStore = readTransaction.objectStore(DRAFTS_STORE);
        const existing = payload.id
          ? ((await requestToPromise(readStore.get(payload.id))) as SpotDraftRecord | undefined) ?? null
          : null;
        await waitForTransaction(readTransaction);

        const record = recordFromPayload(payload, existing);
        const writeTransaction = db.transaction([DRAFTS_STORE, BLOBS_STORE], "readwrite");
        const draftsStore = writeTransaction.objectStore(DRAFTS_STORE);
        const blobsStore = writeTransaction.objectStore(BLOBS_STORE);

        draftsStore.put(record);
        blobsStore.put(payload.media.file, blobKey(record.id, "media"));

        if (payload.media.coverFile) {
          blobsStore.put(payload.media.coverFile, blobKey(record.id, "cover"));
        } else if (existing?.media.coverFileName) {
          blobsStore.delete(blobKey(record.id, "cover"));
        }

        await waitForTransaction(writeTransaction);
        return record;
      } finally {
        db.close();
      }
    },

    async updateDraft(draftId, patch) {
      const db = await openSpotDraftDatabase();

      try {
        const transaction = db.transaction(DRAFTS_STORE, "readwrite");
        const store = transaction.objectStore(DRAFTS_STORE);
        const existing = (await requestToPromise(store.get(draftId))) as SpotDraftRecord | undefined;

        if (!existing) {
          throw new Error("Spot draft not found.");
        }

        const next: SpotDraftRecord = {
          ...existing,
          ...patch,
          media: patch.media ? { ...existing.media, ...patch.media } : existing.media,
          updatedAt: new Date().toISOString(),
        };

        store.put(next);
        await waitForTransaction(transaction);
        return next;
      } finally {
        db.close();
      }
    },

    async deleteDraft(draftId) {
      const db = await openSpotDraftDatabase();

      try {
        const transaction = db.transaction([DRAFTS_STORE, BLOBS_STORE], "readwrite");
        const draftsStore = transaction.objectStore(DRAFTS_STORE);
        const blobsStore = transaction.objectStore(BLOBS_STORE);

        draftsStore.delete(draftId);
        blobsStore.delete(blobKey(draftId, "media"));
        blobsStore.delete(blobKey(draftId, "cover"));
        await waitForTransaction(transaction);
      } finally {
        db.close();
      }
    },
  };
}

let activeAdapter: SpotDraftStorageAdapter | null = null;

export function getSpotDraftStorage(): SpotDraftStorageAdapter {
  if (!activeAdapter) {
    activeAdapter = createIndexedDbSpotDraftStorage();
  }

  return activeAdapter;
}

export function setSpotDraftStorage(adapter: SpotDraftStorageAdapter) {
  activeAdapter = adapter;
}
