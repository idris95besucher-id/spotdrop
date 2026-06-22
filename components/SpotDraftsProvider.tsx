"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import SpotDraftsSheet from "@/components/SpotDraftsSheet";
import { getSafeAuthSession } from "@/lib/authSession";
import { dispatchProfileContentRefresh } from "@/lib/profileContentRefresh";
import {
  getSpotDraftStorage,
  isDeviceOnline,
  isSpotDraftUploadable,
  uploadSpotDraftById,
  type SpotDraftRecord,
} from "@/lib/spotDraft";
import { supabase } from "@/lib/supabaseClient";

type SpotDraftsContextValue = {
  drafts: SpotDraftRecord[];
  uploadableDrafts: SpotDraftRecord[];
  isOnline: boolean;
  loading: boolean;
  sheetOpen: boolean;
  uploadingDraftId: string | null;
  refreshDrafts: () => Promise<void>;
  openDraftSheet: () => void;
  closeDraftSheet: () => void;
  editDraft: (draftId: string) => void;
  deleteDraft: (draftId: string) => Promise<void>;
  uploadDraft: (draftId: string) => Promise<{ postId: string | null; error: string | null }>;
  uploadAllDrafts: () => Promise<void>;
};

const SpotDraftsContext = createContext<SpotDraftsContextValue | null>(null);

export function useSpotDrafts() {
  const context = useContext(SpotDraftsContext);

  if (!context) {
    throw new Error("useSpotDrafts must be used within SpotDraftsProvider");
  }

  return context;
}

type SpotDraftsProviderProps = {
  children: ReactNode;
  onEditDraft: (draftId: string) => void;
};

export default function SpotDraftsProvider({
  children,
  onEditDraft,
}: SpotDraftsProviderProps) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [drafts, setDrafts] = useState<SpotDraftRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [uploadingDraftId, setUploadingDraftId] = useState<string | null>(null);

  useEffect(() => {
    setIsOnline(isDeviceOnline());

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    let active = true;

    void getSafeAuthSession().then((result) => {
      if (active) {
        setSession(result.session);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user?.id ?? null;

  const refreshDrafts = useCallback(async () => {
    if (!userId) {
      setDrafts([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const nextDrafts = await getSpotDraftStorage().listDrafts(userId);
      setDrafts(nextDrafts);
    } catch {
      setDrafts([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refreshDrafts();
  }, [refreshDrafts]);

  useEffect(() => {
    if (!isOnline || !userId) {
      return;
    }

    void refreshDrafts();
  }, [isOnline, refreshDrafts, userId]);

  const uploadableDrafts = useMemo(
    () => drafts.filter((draft) => isSpotDraftUploadable(draft)),
    [drafts]
  );

  const uploadDraft = useCallback(
    async (draftId: string) => {
      if (!userId) {
        return { postId: null, error: "Sign in to upload Spot drafts." };
      }

      setUploadingDraftId(draftId);

      const result = await uploadSpotDraftById(draftId, userId);

      setUploadingDraftId(null);
      await refreshDrafts();

      if (result.postId) {
        dispatchProfileContentRefresh();

        if (uploadableDrafts.length <= 1) {
          setSheetOpen(false);
        }

        router.push(`/posts?id=${encodeURIComponent(result.postId)}`);
      }

      return result;
    },
    [refreshDrafts, router, uploadableDrafts.length, userId]
  );

  const uploadAllDrafts = useCallback(async () => {
    for (const draft of uploadableDrafts) {
      const result = await uploadDraft(draft.id);

      if (result.error) {
        break;
      }
    }
  }, [uploadDraft, uploadableDrafts]);

  const deleteDraft = useCallback(
    async (draftId: string) => {
      await getSpotDraftStorage().deleteDraft(draftId);
      await refreshDrafts();
    },
    [refreshDrafts]
  );

  const value = useMemo<SpotDraftsContextValue>(
    () => ({
      drafts,
      uploadableDrafts,
      isOnline,
      loading,
      sheetOpen,
      uploadingDraftId,
      refreshDrafts,
      openDraftSheet: () => setSheetOpen(true),
      closeDraftSheet: () => setSheetOpen(false),
      editDraft: onEditDraft,
      deleteDraft,
      uploadDraft,
      uploadAllDrafts,
    }),
    [
      deleteDraft,
      drafts,
      isOnline,
      loading,
      onEditDraft,
      refreshDrafts,
      sheetOpen,
      uploadAllDrafts,
      uploadDraft,
      uploadableDrafts,
      uploadingDraftId,
    ]
  );

  return (
    <SpotDraftsContext.Provider value={value}>
      {children}

      {sheetOpen ? (
        <SpotDraftsSheet
          drafts={drafts}
          uploadingDraftId={uploadingDraftId}
          onClose={() => setSheetOpen(false)}
          onUpload={(draftId) => void uploadDraft(draftId)}
          onEdit={(draftId) => {
            setSheetOpen(false);
            onEditDraft(draftId);
          }}
          onDelete={(draftId) => deleteDraft(draftId)}
        />
      ) : null}
    </SpotDraftsContext.Provider>
  );
}
