"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { Loader2, Lock, Plus, Users, X } from "lucide-react";
import MobileSecondaryHeader from "@/components/MobileSecondaryHeader";
import NavigationStackScreen from "@/components/NavigationStackScreen";
import ProfileGalleryAddSheet from "@/components/profile/ProfileGalleryAddSheet";
import ProfileGalleryDeleteConfirmSheet from "@/components/profile/ProfileGalleryDeleteConfirmSheet";
import ProfileGalleryDescriptionSheet from "@/components/profile/ProfileGalleryDescriptionSheet";
import ProfileGalleryGrid from "@/components/ProfileGalleryGrid";
import ProfileGalleryItemActionSheet from "@/components/profile/ProfileGalleryItemActionSheet";
import ProfileGalleryViewer from "@/components/ProfileGalleryViewer";
import Shell from "@/components/Shell";
import { useI18n } from "@/components/I18nProvider";
import { getSafeAuthSession } from "@/lib/authSession";
import { localizeError } from "@/lib/i18n/localizeError";
import { MOBILE_WIDTH_SAFE_CLASS } from "@/lib/mobileLayout";
import { pickSpotGalleryPhoto } from "@/lib/pickMediaFromGallery";
import { loadOwnProfileContent, type ProfileContentPost } from "@/lib/profileContent";
import {
  createProfileGalleryMedia,
  deleteProfileGalleryItem,
  getProfileGalleryDescription,
  getProfileGalleryStats,
  setProfilePhotoFromGalleryItem,
  updateProfileGalleryDescription,
} from "@/lib/profileGallery";
import {
  resolveProfileGalleryAccess,
  type ProfileGalleryAccess,
} from "@/lib/profileGalleryVisibility";
import { PROFILE_CONTENT_REFRESH_EVENT, dispatchProfileContentRefresh } from "@/lib/profileContentRefresh";
import { publicProfileUsername } from "@/lib/publicProfile";
import { supabase } from "@/lib/supabaseClient";

type ProfileGalleryScreenProps = {
  ownerUserId: string;
  backHref: string;
  requireAuth?: boolean;
};

type OwnerProfile = {
  username: string;
  avatar_url: string | null;
};

export default function ProfileGalleryScreen({
  ownerUserId,
  backHref,
  requireAuth = false,
}: ProfileGalleryScreenProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [loadingAccess, setLoadingAccess] = useState(true);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [access, setAccess] = useState<ProfileGalleryAccess>("private");
  const [ownerProfile, setOwnerProfile] = useState<OwnerProfile | null>(null);
  const [personalPosts, setPersonalPosts] = useState<ProfileContentPost[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [actionItem, setActionItem] = useState<ProfileContentPost | null>(null);
  const [descriptionItem, setDescriptionItem] = useState<ProfileContentPost | null>(null);
  const [deleteItem, setDeleteItem] = useState<ProfileContentPost | null>(null);
  const [uploading, setUploading] = useState(false);
  const [savingDescription, setSavingDescription] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const viewerUserId = session?.user?.id ?? null;
  const isOwner = Boolean(viewerUserId && viewerUserId === ownerUserId);
  const canViewGallery = access === "allowed";

  useEffect(() => {
    void getSafeAuthSession().then((result) => {
      setSession(result.session);
      setLoadingSession(false);

      if (requireAuth && !result.session?.user) {
        router.replace("/auth/login");
      }
    });
  }, [requireAuth, router]);

  useEffect(() => {
    let cancelled = false;

    const loadAccess = async () => {
      setLoadingAccess(true);

      const [accessResult, ownerResult] = await Promise.all([
        resolveProfileGalleryAccess(viewerUserId, ownerUserId),
        supabase.from("profiles").select("username, avatar_url").eq("id", ownerUserId).maybeSingle(),
      ]);

      if (cancelled) {
        return;
      }

      setAccess(accessResult.access);

      if (ownerResult.data?.username) {
        setOwnerProfile({
          username: publicProfileUsername(ownerResult.data.username),
          avatar_url: ownerResult.data.avatar_url ?? null,
        });
      }

      setLoadingAccess(false);
    };

    if (!loadingSession) {
      void loadAccess();
    }

    return () => {
      cancelled = true;
    };
  }, [loadingSession, ownerUserId, viewerUserId]);

  const loadGallery = useCallback(async () => {
    if (!canViewGallery) {
      setPersonalPosts([]);
      setLoadingPosts(false);
      return;
    }

    setLoadingPosts(true);
    setError(null);

    const contentResult = await loadOwnProfileContent(ownerUserId);

    if (contentResult.error) {
      setError(contentResult.error);
      setPersonalPosts([]);
    } else {
      setPersonalPosts(contentResult.personal);
    }

    setLoadingPosts(false);
  }, [canViewGallery, ownerUserId]);

  useEffect(() => {
    if (loadingAccess) {
      return;
    }

    void loadGallery();
  }, [loadGallery, loadingAccess]);

  useEffect(() => {
    if (!isOwner) {
      return;
    }

    const handleRefresh = () => {
      void loadGallery();
    };

    window.addEventListener(PROFILE_CONTENT_REFRESH_EVENT, handleRefresh);

    return () => {
      window.removeEventListener(PROFILE_CONTENT_REFRESH_EVENT, handleRefresh);
    };
  }, [isOwner, loadGallery]);

  useEffect(() => {
    if (!successMessage) {
      return;
    }

    const timer = window.setTimeout(() => setSuccessMessage(null), 2400);

    return () => {
      window.clearTimeout(timer);
    };
  }, [successMessage]);

  const stats = useMemo(() => getProfileGalleryStats(personalPosts), [personalPosts]);

  const statsLabel = useMemo(() => {
    const photoPart =
      stats.photos === 1
        ? t("profile.galleryStatPhotoOne")
        : t("profile.galleryStatPhotoMany", { count: stats.photos });
    const videoPart =
      stats.videos === 1
        ? t("profile.galleryStatVideoOne")
        : t("profile.galleryStatVideoMany", { count: stats.videos });

    return `${photoPart} · ${videoPart}`;
  }, [stats.photos, stats.videos, t]);

  const openItemMenu = useCallback(
    (index: number) => {
      const post = personalPosts[index];

      if (post) {
        setActionItem(post);
      }
    },
    [personalPosts]
  );

  const uploadPhoto = async () => {
    if (!isOwner || uploading) {
      return;
    }

    setAddSheetOpen(false);
    setError(null);

    const file = await pickSpotGalleryPhoto();

    if (!file) {
      return;
    }

    setUploading(true);

    const result = await createProfileGalleryMedia(ownerUserId, file);

    if (result.error || !result.post) {
      setError(result.error ?? t("profile.galleryUploadFailed"));
      setUploading(false);
      return;
    }

    setPersonalPosts((current) => [result.post!, ...current]);
    dispatchProfileContentRefresh();
    setUploading(false);
  };

  const handleSetProfilePhoto = async (post: ProfileContentPost) => {
    setError(null);

    const result = await setProfilePhotoFromGalleryItem(ownerUserId, post.id);

    if (!result.ok) {
      setError(result.error ?? t("profile.unableToLoad"));
      return;
    }

    setOwnerProfile((current) =>
      current ? { ...current, avatar_url: result.avatarUrl } : current
    );
    setSuccessMessage(t("profile.photoUpdated"));
  };

  const handleSaveDescription = async (description: string) => {
    if (!descriptionItem) {
      return;
    }

    setSavingDescription(true);
    setError(null);

    const result = await updateProfileGalleryDescription(ownerUserId, descriptionItem.id, description);

    if (result.error || !result.post) {
      setError(result.error ?? t("profile.unableToLoad"));
      setSavingDescription(false);
      return;
    }

    setPersonalPosts((current) =>
      current.map((post) => (post.id === result.post!.id ? result.post! : post))
    );
    setDescriptionItem(null);
    setSavingDescription(false);
    setSuccessMessage(t("profile.galleryDescriptionSaved"));
  };

  const handleConfirmDelete = async () => {
    if (!deleteItem) {
      return;
    }

    setDeleting(true);
    setError(null);

    const deletedId = deleteItem.id;
    const result = await deleteProfileGalleryItem(ownerUserId, deletedId);

    if (!result.ok) {
      setError(result.error ?? t("content.unableToDelete"));
      setDeleting(false);
      return;
    }

    setPersonalPosts((current) => {
      const next = current.filter((post) => post.id !== deletedId);

      if (viewerIndex != null) {
        const deletedIndex = current.findIndex((post) => post.id === deletedId);

        if (deletedIndex === viewerIndex) {
          if (next.length === 0) {
            setViewerIndex(null);
          } else {
            setViewerIndex(Math.min(viewerIndex, next.length - 1));
          }
        } else if (deletedIndex >= 0 && deletedIndex < viewerIndex) {
          setViewerIndex(viewerIndex - 1);
        }
      }

      return next;
    });

    setDeleteItem(null);
    setDeleting(false);
    dispatchProfileContentRefresh();
    setSuccessMessage(t("profile.galleryDeleted"));
  };

  const title = isOwner
    ? t("profile.galleryTitle")
    : ownerProfile?.username
      ? t("profile.galleryTitleUser", { user: ownerProfile.username })
      : t("profile.galleryTitle");

  const lockedMessage =
    access === "friends_only" ? t("profile.galleryFriendsOnly") : t("profile.galleryPrivate");

  const LockedIcon = access === "friends_only" ? Users : Lock;

  const viewerActiveItem = viewerIndex != null ? personalPosts[viewerIndex] ?? null : null;

  if (loadingSession || loadingAccess) {
    return (
      <Shell showHeader={false} flushTop>
        <div className="px-4 py-12 text-center text-sm text-muted">{t("common.loading")}</div>
      </Shell>
    );
  }

  if (requireAuth && !session?.user) {
    return null;
  }

  return (
    <Shell showHeader={false} flushTop fixedLayout>
      <NavigationStackScreen fallbackHref={backHref}>
        <MobileSecondaryHeader
          title={title}
          backHref={backHref}
          preferFallback
          trailing={
            isOwner && canViewGallery ? (
              <button
                type="button"
                onClick={() => setAddSheetOpen(true)}
                disabled={uploading}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white transition hover:bg-white/10 disabled:opacity-50"
                aria-label={t("profile.galleryAdd")}
              >
                {uploading ? (
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                ) : (
                  <Plus className="h-5 w-5" strokeWidth={2} aria-hidden />
                )}
              </button>
            ) : undefined
          }
        />

        {!canViewGallery ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-8 py-16 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full border border-cyan-400/25 bg-cyan-400/10 text-cyan-300 shadow-[0_0_24px_rgba(34,211,238,0.16)]">
              <LockedIcon className="h-6 w-6" strokeWidth={1.75} aria-hidden />
            </span>
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-slate-300">{lockedMessage}</p>
          </div>
        ) : (
          <div
            data-mobile-main-scroll=""
            className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${MOBILE_WIDTH_SAFE_CLASS}`}
          >
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <p className="text-sm font-medium text-slate-300">{statsLabel}</p>
              {uploading ? (
                <p className="text-xs text-slate-500">{t("profile.galleryUploading")}</p>
              ) : null}
            </div>

            {successMessage ? (
              <div className="mx-4 mb-3 rounded-2xl border border-cyan-400/25 bg-cyan-400/10 px-3 py-2.5 text-xs text-cyan-100">
                {successMessage}
              </div>
            ) : null}

            {error ? (
              <div className="mx-4 mb-3 flex items-start gap-2 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-3 py-3 text-xs text-amber-100">
                <p className="min-w-0 flex-1">{localizeError(t, error) ?? error}</p>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="shrink-0 rounded-full p-1 text-amber-100/80 transition hover:bg-white/10"
                  aria-label={t("common.close")}
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            ) : null}

            <ProfileGalleryGrid
              items={personalPosts}
              loading={loadingPosts}
              isOwner={isOwner}
              onSelectItem={setViewerIndex}
              onOpenItemMenu={isOwner ? openItemMenu : undefined}
            />
          </div>
        )}
      </NavigationStackScreen>

      <ProfileGalleryAddSheet
        isOpen={addSheetOpen}
        uploading={uploading}
        onClose={() => setAddSheetOpen(false)}
        onAddPhoto={() => void uploadPhoto()}
      />

      <ProfileGalleryItemActionSheet
        item={actionItem}
        onClose={() => setActionItem(null)}
        onSetProfilePhoto={() => {
          if (actionItem) {
            void handleSetProfilePhoto(actionItem);
          }
        }}
        onEditDescription={() => {
          if (actionItem) {
            setDescriptionItem(actionItem);
          }
        }}
        onDelete={() => {
          if (actionItem) {
            setDeleteItem(actionItem);
          }
        }}
      />

      <ProfileGalleryDescriptionSheet
        isOpen={Boolean(descriptionItem)}
        initialDescription={descriptionItem ? getProfileGalleryDescription(descriptionItem) : ""}
        saving={savingDescription}
        onClose={() => setDescriptionItem(null)}
        onSave={(description) => void handleSaveDescription(description)}
      />

      <ProfileGalleryDeleteConfirmSheet
        isOpen={Boolean(deleteItem)}
        deleting={deleting}
        onClose={() => setDeleteItem(null)}
        onConfirm={() => void handleConfirmDelete()}
      />

      {canViewGallery && viewerIndex != null && viewerUserId && viewerActiveItem ? (
        <ProfileGalleryViewer
          items={personalPosts}
          activeIndex={viewerIndex}
          userId={viewerUserId}
          isOwner={isOwner}
          onClose={() => setViewerIndex(null)}
          onActiveIndexChange={setViewerIndex}
          onOpenItemMenu={isOwner ? () => setActionItem(viewerActiveItem) : undefined}
        />
      ) : null}
    </Shell>
  );
}
