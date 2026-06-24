"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import SpotOfflineDraftSavedScreen from "@/components/SpotOfflineDraftSavedScreen";
import SpotInstagramCamera from "@/components/SpotInstagramCamera";
import { useI18n } from "@/components/I18nProvider";
import SpotCapturePreviewScreen from "@/components/SpotCapturePreviewScreen";
import SpotPublishScreen from "@/components/SpotPublishScreen";
import SpotVideoEditorScreen from "@/components/SpotVideoEditorScreen";
import { loadUserCollections, type CollectionWithMeta } from "@/lib/collections";
import {
  findNearestDiscoveryPlace,
  loadDiscoveryPlacesForMatching,
} from "@/lib/spots";
import {
  requestDeviceLocation,
  requestDeviceLocationFast,
  spotLocationFromCoordinates,
  type PlaceSearchResult,
  type SpotGeoLocation,
} from "@/lib/spotLocation";
import type { DiscoveryPlace } from "@/lib/discoveryMap";
import { NOT_SIGNED_IN_UPLOAD_MESSAGE } from "@/lib/postMedia";
import {
  getSpotPublishBlockReason,
  hasSpotPublishLocation,
  resolveSpotName,
  type SpotPublishBlockReason,
} from "@/lib/spotPublish";
import {
  buildSpotDraftUpsertPayload,
  createSpotDraftId,
  getSpotDraftStorage,
  isDeviceOnline,
  isLikelyNetworkError,
  mediaEditorItemFromDraft,
  type SpotDraftUploadStatus,
} from "@/lib/spotDraft";
import {
  createMediaEditorItem,
  getActiveMediaEditorItem,
  revokeMediaEditorItems,
  type MediaEditorItem,
} from "@/lib/mediaEditor";
import {
  publishSpotWithProgress,
  type SpotUploadProgress,
} from "@/lib/spotUploadPipeline";
import { setImmersiveOverlayActive } from "@/lib/immersiveOverlay";
import { type SpotLocationSourceKind } from "@/components/SpotLocationPicker";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import type { TranslationKey } from "@/lib/i18n/messages";

function publishStatusKey(reason: SpotPublishBlockReason): TranslationKey | null {
  switch (reason) {
    case "media":
      return "spotPublish.mediaMissing";
    case "location_loading":
      return "spotPublish.locationLoading";
    case "location_required":
      return "spotPublish.locationRequired";
    default:
      return null;
  }
}

type CreateSpotFormProps = {
  userId: string;
  isOpen: boolean;
  draftId?: string | null;
  onClose: () => void;
  onCreated: () => void;
  onDraftChanged?: () => void;
};

type Step = "camera" | "preview" | "publish" | "offline_saved";

export default function CreateSpotForm({
  userId,
  isOpen,
  draftId,
  onClose,
  onCreated,
  onDraftChanged,
}: CreateSpotFormProps) {
  const router = useRouter();
  const { t } = useI18n();
  const [step, setStep] = useState<Step>("camera");
  const [spotName, setSpotName] = useState("");
  const [collectionId, setCollectionId] = useState("");
  const [collections, setCollections] = useState<CollectionWithMeta[]>([]);
  const [collectionsLoading, setCollectionsLoading] = useState(false);
  const [mediaItems, setMediaItems] = useState<MediaEditorItem[]>([]);
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [location, setLocation] = useState<SpotGeoLocation | null>(null);
  const [matchedPlaceName, setMatchedPlaceName] = useState<string | null>(null);
  const [places, setPlaces] = useState<DiscoveryPlace[]>([]);
  const [locationSource, setLocationSource] = useState<SpotLocationSourceKind>(null);
  const [needsLocationChoice, setNeedsLocationChoice] = useState(false);
  const [locationHint, setLocationHint] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<SpotUploadProgress | null>(null);
  const [uploadFailed, setUploadFailed] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [isOfflineCapture, setIsOfflineCapture] = useState(false);

  const currentDraftIdRef = useRef<string | null>(draftId ?? null);
  const saveTimeoutRef = useRef<number | null>(null);
  const skipSaveOnCloseRef = useRef(false);
  // Pre-warmed location captured while camera is open (fast lookup, low accuracy).
  // Used immediately after capture to avoid making the user wait for GPS.
  const cachedLocationRef = useRef<SpotGeoLocation | null>(null);
  const editorOpenedAtRef = useRef<number | null>(null);

  const activeMedia = getActiveMediaEditorItem(mediaItems, activeMediaIndex);

  const notifyDraftChanged = useCallback(() => {
    onDraftChanged?.();
  }, [onDraftChanged]);

  const saveDraftFromMedia = useCallback(
    async (
      mediaItem: MediaEditorItem,
      draftLocation: SpotGeoLocation | null,
      draftLocationSource: SpotLocationSourceKind,
      draftMatchedPlaceName: string | null,
      uploadStatus?: SpotDraftUploadStatus
    ) => {
      const payload = buildSpotDraftUpsertPayload({
        id: currentDraftIdRef.current ?? undefined,
        userId,
        spotName,
        collectionId,
        location: draftLocation,
        locationSource: draftLocationSource,
        matchedPlaceName: draftMatchedPlaceName,
        mediaItem,
        uploadStatus,
        uploadError: null,
      });

      const saved = await getSpotDraftStorage().upsertDraft(payload);
      currentDraftIdRef.current = saved.id;
      notifyDraftChanged();
      return saved;
    },
    [collectionId, notifyDraftChanged, spotName, userId]
  );

  const persistDraft = useCallback(
    async (options?: { uploadStatus?: SpotDraftUploadStatus; uploadError?: string | null }) => {
      if (!activeMedia || (step !== "preview" && step !== "publish")) {
        return null;
      }

      return saveDraftFromMedia(
        activeMedia,
        location,
        locationSource,
        matchedPlaceName,
        options?.uploadStatus
      );
    },
    [
      activeMedia,
      location,
      locationSource,
      matchedPlaceName,
      saveDraftFromMedia,
      step,
    ]
  );

  const scheduleDraftSave = useCallback(() => {
    if (saveTimeoutRef.current !== null) {
      window.clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = window.setTimeout(() => {
      void persistDraft();
    }, 800);
  }, [persistDraft]);

  const clearMedia = () => {
    setMediaItems((current) => {
      revokeMediaEditorItems(current);
      return [];
    });
    setActiveMediaIndex(0);
    setLocation(null);
    setMatchedPlaceName(null);
    setLocationSource(null);
    setNeedsLocationChoice(false);
    setLocationHint(null);
  };

  const resetAll = () => {
    if (saveTimeoutRef.current !== null) {
      window.clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    clearMedia();
    setStep("camera");
    setSpotName("");
    setCollectionId("");
    setLocating(false);
    setPublishing(false);
    setUploadProgress(null);
    setUploadFailed(false);
    setSavingDraft(false);
    setError(null);
    setLoadingDraft(false);
    setIsOfflineCapture(false);
    currentDraftIdRef.current = null;
  };

  const restoreDraft = useCallback(
    async (nextDraftId: string) => {
      setLoadingDraft(true);
      setError(null);

      try {
        const storage = getSpotDraftStorage();
        const draft = await storage.getDraft(nextDraftId);

        if (!draft || draft.userId !== userId) {
          setError(t("spotEditor.error.openDraft"));
          setStep("camera");
          return;
        }

        const mediaBlob = await storage.getDraftBlob(nextDraftId, "media");

        if (!mediaBlob) {
          setError(t("spotEditor.error.missingMedia"));
          setStep("camera");
          return;
        }

        const coverBlob =
          draft.media.mediaType === "video" ? await storage.getDraftBlob(nextDraftId, "cover") : null;
        const item = await mediaEditorItemFromDraft(draft, mediaBlob, coverBlob);

        setMediaItems([item]);
        setActiveMediaIndex(0);
        setSpotName(draft.spotName);
        setCollectionId(draft.collectionId ?? "");
        setLocation(draft.location);
        setLocationSource(draft.locationSource);
        setMatchedPlaceName(draft.matchedPlaceName);
        setNeedsLocationChoice(!hasSpotPublishLocation(draft.location));
        setLocationHint(null);
        setStep("preview");
        currentDraftIdRef.current = draft.id;
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : t("spotEditor.error.openDraft"));
        setStep("camera");
      } finally {
        setLoadingDraft(false);
      }
    },
    [userId]
  );

  useEffect(() => {
    if (!isOpen) {
      setImmersiveOverlayActive(false);
      return;
    }

    setImmersiveOverlayActive(true);
    skipSaveOnCloseRef.current = false;
    currentDraftIdRef.current = draftId ?? null;

    if (isDeviceOnline()) {
      void loadDiscoveryPlacesForMatching().then((loaded) => {
        setPlaces(loaded);
      });
    } else {
      setPlaces([]);
    }

    if (isDeviceOnline()) {
      setCollectionsLoading(true);
      void loadUserCollections(userId, userId).then((result) => {
        setCollections(result.collections);
        setCollectionsLoading(false);
      });
    } else {
      setCollections([]);
      setCollectionsLoading(false);
    }

    if (draftId) {
      void restoreDraft(draftId);
    } else {
      setStep("camera");
    }

    // Start a fast location lookup while the camera is open so the result is
    // already cached by the time the user finishes recording.
    cachedLocationRef.current = null;
    if (isDeviceOnline()) {
      void requestDeviceLocationFast()
        .then((loc) => {
          cachedLocationRef.current = loc;
        })
        .catch(() => {
          // Pre-warm failed — resolveLocationAfterCapture will retry.
        });
    }

    return () => {
      setImmersiveOverlayActive(false);
    };
  }, [draftId, isOpen, restoreDraft, userId]);

  useEffect(() => {
    if (!isOpen || (step !== "preview" && step !== "publish") || !activeMedia || loadingDraft) {
      return;
    }

    scheduleDraftSave();
  }, [
    activeMedia,
    collectionId,
    isOpen,
    loadingDraft,
    location,
    locationSource,
    matchedPlaceName,
    scheduleDraftSave,
    spotName,
    step,
  ]);

  const handleClose = () => {
    setImmersiveOverlayActive(false);
    resetAll();
    onClose();
  };

  const saveToDraftAndExit = async () => {
    if (!activeMedia || step !== "preview") {
      handleClose();
      return;
    }

    setSavingDraft(true);
    setError(null);

    try {
      await persistDraft();
      skipSaveOnCloseRef.current = true;
      handleClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("spotEditor.error.saveDraft"));
    } finally {
      setSavingDraft(false);
    }
  };

  const discardVideoAndReturnToCamera = async () => {
    skipSaveOnCloseRef.current = true;
    await backToCamera();
  };

  const backToCamera = async () => {
    if (currentDraftIdRef.current) {
      await getSpotDraftStorage().deleteDraft(currentDraftIdRef.current);
      currentDraftIdRef.current = null;
      notifyDraftChanged();
    }

    clearMedia();
    setStep("camera");
    setError(null);
  };

  const applyResolvedLocation = (
    latitude: number,
    longitude: number,
    source: SpotLocationSourceKind
  ) => {
    const coordsOnly: SpotGeoLocation = {
      latitude,
      longitude,
      address: null,
      city: null,
      country: null,
    };

    setLocation(coordsOnly);
    setLocationSource(source);
    setNeedsLocationChoice(false);
    setLocationHint(null);

    console.log("[Spot Editor] location ready", {
      phase: "coordinates",
      latitude,
      longitude,
      source,
      elapsedMs: editorOpenedAtRef.current ? Date.now() - editorOpenedAtRef.current : null,
    });

    void spotLocationFromCoordinates(latitude, longitude).then((resolved) => {
      const matched = findNearestDiscoveryPlace(resolved, places);
      setLocation(resolved);
      setMatchedPlaceName(matched?.name ?? null);
      console.log("[Spot Editor] location ready", {
        phase: "geocoded",
        latitude: resolved.latitude,
        longitude: resolved.longitude,
        city: resolved.city,
        country: resolved.country,
        elapsedMs: editorOpenedAtRef.current
          ? Date.now() - editorOpenedAtRef.current
          : null,
      });
    });
  };

  const resolveFromDevice = async () => {
    setLocating(true);
    setLocationHint(null);

    try {
      const detected = await requestDeviceLocation();
      applyResolvedLocation(detected.latitude, detected.longitude, "device");
    } catch (caught) {
      setNeedsLocationChoice(true);
      setLocationHint(
        caught instanceof Error ? caught.message : t("spotEditor.error.detectLocation")
      );
    } finally {
      setLocating(false);
    }
  };

  const applySearchPlace = async (place: PlaceSearchResult) => {
    setLocating(true);
    setLocationHint(null);

    try {
      applyResolvedLocation(place.latitude, place.longitude, "search");
    } catch (caught) {
      setLocationHint(
        caught instanceof Error ? caught.message : t("spotEditor.error.usePlace")
      );
      setNeedsLocationChoice(true);
    } finally {
      setLocating(false);
    }
  };

  const resolveLocationAfterCapture = async () => {
    setLocating(true);
    setLocation(null);
    setMatchedPlaceName(null);
    setLocationSource(null);
    setNeedsLocationChoice(false);
    setLocationHint(null);

    try {
      // Use the pre-warmed cached location if available — no wait, instant result.
      // Otherwise do a fast low-accuracy lookup (≤2 s) so the user is never blocked.
      const fast = cachedLocationRef.current ?? (await requestDeviceLocationFast());
      cachedLocationRef.current = null;
      applyResolvedLocation(fast.latitude, fast.longitude, "device");

      // Refine in background with high-accuracy GPS — updates location silently.
      void requestDeviceLocation()
        .then((precise) => {
          applyResolvedLocation(precise.latitude, precise.longitude, "device");
        })
        .catch(() => {
          // Background refinement failed — keep the fast result, no disruption.
        });
    } catch (caught) {
      // Fast lookup also failed — let user choose location manually.
      setNeedsLocationChoice(true);
      setLocationHint(
        caught instanceof Error ? caught.message : t("spotEditor.error.detectLocation")
      );
    } finally {
      setLocating(false);
    }
  };

  const handleMediaCaptured = async (file: File, nextType: "image" | "video") => {
    if (nextType === "video") {
      console.log("[Spot Editor] recording finished", {
        fileSize: file.size,
        fileType: file.type,
      });
    }

    const item = createMediaEditorItem(file, nextType);
    currentDraftIdRef.current = createSpotDraftId();

    setMediaItems((current) => {
      revokeMediaEditorItems(current);
      return [item];
    });
    setActiveMediaIndex(0);
    setError(null);
    setLocation(null);
    setMatchedPlaceName(null);
    setLocationSource(null);
    setNeedsLocationChoice(false);
    setLocationHint(null);

    if (!isDeviceOnline()) {
      setIsOfflineCapture(true);

      let capturedLocation: SpotGeoLocation | null = null;
      let capturedSource: SpotLocationSourceKind = null;

      try {
        capturedLocation = await requestDeviceLocation();
        capturedSource = "device";
      } catch {
        capturedLocation = null;
      }

      setLocation(capturedLocation);
      setLocationSource(capturedSource);

      await saveDraftFromMedia(
        item,
        capturedLocation,
        capturedSource,
        null,
        capturedLocation ? "ready" : "draft"
      );

      skipSaveOnCloseRef.current = true;
      setStep("offline_saved");
      return;
    }

    setIsOfflineCapture(false);
    editorOpenedAtRef.current = Date.now();
    setStep("preview");
    void resolveLocationAfterCapture();
  };

  const handleNext = () => {
    if (!activeMedia) {
      setError(t("spotEditor.error.addMediaFirst"));
      void backToCamera();
      return;
    }

    if (!offlineMode && !hasSpotPublishLocation(location)) {
      setError(t("spotPublish.locationRequired"));
      return;
    }

    if (publishBlockReason) {
      const key = publishStatusKey(publishBlockReason);
      setError(key ? t(key) : t("spotPublish.locationRequired"));
      return;
    }

    setError(null);
    setStep("publish");
  };

  const handlePublish = async () => {
    if (!userId) {
      setError(NOT_SIGNED_IN_UPLOAD_MESSAGE);
      return;
    }

    if (!activeMedia) {
      setError(t("spotEditor.error.addMediaFirst"));
      void backToCamera();
      return;
    }

    if (!hasSpotPublishLocation(location)) {
      setError(t("spotPublish.locationRequired"));
      return;
    }

    if (!isDeviceOnline()) {
      setPublishing(true);
      await persistDraft({ uploadStatus: "ready", uploadError: null });
      skipSaveOnCloseRef.current = true;
      setPublishing(false);
      setStep("offline_saved");
      return;
    }

    setPublishing(true);
    setUploadFailed(false);
    setError(null);
    setUploadProgress(null);

    try {
      const result = await publishSpotWithProgress({
        userId,
        mediaItem: activeMedia,
        spotName: resolveSpotName(spotName),
        location: location!,
        collectionId: collectionId || null,
        discoveryPlaces: places,
        onProgress: (progress) => {
          setUploadProgress(progress);
        },
      });

      if (currentDraftIdRef.current) {
        await getSpotDraftStorage().deleteDraft(currentDraftIdRef.current);
        notifyDraftChanged();
      }

      skipSaveOnCloseRef.current = true;
      const postId = result.postId;
      setPublishing(false);
      onCreated();

      if (postId) {
        router.push(`/posts?id=${encodeURIComponent(postId)}`);
      }

      void handleClose();

      if (currentDraftIdRef.current) {
        const draftId = currentDraftIdRef.current;
        void getSpotDraftStorage()
          .deleteDraft(draftId)
          .then(() => notifyDraftChanged());
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : t("spotEditor.error.publishFailed");
      setUploadFailed(true);

      if (isLikelyNetworkError(caught)) {
        await persistDraft({
          uploadStatus: "ready",
          uploadError: message,
        });
        setError(t("spotEditor.error.uploadFailedDraft"));
      } else {
        setError(localizeUserMessage(t, message) ?? message);
      }
    } finally {
      setPublishing(false);
    }
  };

  const updateActiveItem = useCallback(
    (patch: Partial<MediaEditorItem>) => {
      setMediaItems((current) =>
        current.map((item, index) => (index === activeMediaIndex ? { ...item, ...patch } : item))
      );
    },
    [activeMediaIndex]
  );

  const updateActiveItemTrim = useCallback(
    (trimStart: number, trimEnd: number) => {
      updateActiveItem({ trimStart, trimEnd, trimConfirmed: true });
    },
    [updateActiveItem]
  );

  const offlineMode = !isDeviceOnline() || isOfflineCapture;
  const publishBlockReason = offlineMode
    ? null
    : getSpotPublishBlockReason({
        hasMedia: mediaItems.length > 0,
        locating,
        location,
      });
  const publishStatusMessage = offlineMode
    ? t("spotEditor.offlineHint")
    : (() => {
        const key = publishStatusKey(publishBlockReason);
        return key ? t(key) : null;
      })();

  const renderSpotFlow = () => {
    if (loadingDraft) {
      return (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-[#050816] px-6 text-center">
          <p className="text-sm text-muted">{t("spotEditor.openingDraft")}</p>
        </div>
      );
    }

    if (step === "offline_saved" && activeMedia) {
      return (
        <SpotOfflineDraftSavedScreen
          item={activeMedia}
          onDone={() => void handleClose()}
        />
      );
    }

    if (step === "publish" && activeMedia) {
      return (
        <SpotPublishScreen
          item={activeMedia}
          collections={collections}
          collectionId={collectionId}
          collectionsLoading={collectionsLoading}
          publishing={publishing}
          uploadProgress={uploadProgress}
          uploadFailed={uploadFailed}
          offlineMode={offlineMode}
          error={error}
          onCollectionChange={setCollectionId}
          onBack={() => {
            setError(null);
            setStep("preview");
          }}
          onPublish={() => void handlePublish()}
        />
      );
    }

    if (step === "preview" && activeMedia?.mediaType === "video") {
      return (
        <SpotVideoEditorScreen
          item={activeMedia}
          spotName={spotName}
          locating={locating}
          location={location}
          locationSource={locationSource}
          matchedPlaceName={matchedPlaceName}
          needsLocationChoice={needsLocationChoice}
          locationHint={locationHint}
          publishStatusMessage={publishStatusMessage}
          offlineMode={offlineMode}
          error={error}
          onItemChange={updateActiveItem}
          onTrimChange={updateActiveItemTrim}
          onSpotNameChange={setSpotName}
          onUseCurrentLocation={() => void resolveFromDevice()}
          onSelectPlace={(place) => void applySearchPlace(place)}
          onSaveToDrafts={() => void saveToDraftAndExit()}
          onDiscardVideo={() => void discardVideoAndReturnToCamera()}
          onRetake={() => void backToCamera()}
          onNext={() => handleNext()}
          savingDraft={savingDraft}
        />
      );
    }

    if (step === "preview" && activeMedia?.mediaType === "image") {
      return (
        <SpotCapturePreviewScreen
          item={activeMedia}
          spotName={spotName}
          locating={locating}
          location={location}
          locationSource={locationSource}
          matchedPlaceName={matchedPlaceName}
          needsLocationChoice={needsLocationChoice}
          locationHint={locationHint}
          publishStatusMessage={publishStatusMessage}
          offlineMode={offlineMode}
          error={error}
          onSpotNameChange={setSpotName}
          onUseCurrentLocation={() => void resolveFromDevice()}
          onSelectPlace={(place) => void applySearchPlace(place)}
          onDismiss={() => void handleClose()}
          onRetake={() => void backToCamera()}
          onNext={() => handleNext()}
        />
      );
    }

    return null;
  };

  if (!isOpen) {
    return null;
  }

  if (step === "camera" && typeof document !== "undefined") {
    return createPortal(
      <SpotInstagramCamera
        onClose={() => void handleClose()}
        onCapture={(file, mediaType) => void handleMediaCaptured(file, mediaType)}
      />,
      document.body
    );
  }

  if (typeof document !== "undefined") {
    const flow = renderSpotFlow();

    if (flow) {
      return createPortal(flow, document.body);
    }
  }

  return null;
}
