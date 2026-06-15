"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import SpotOfflineDraftSavedScreen from "@/components/SpotOfflineDraftSavedScreen";
import SpotInstagramCamera from "@/components/SpotInstagramCamera";
import SpotCapturePreviewScreen from "@/components/SpotCapturePreviewScreen";
import SpotVideoEditorScreen from "@/components/SpotVideoEditorScreen";
import { loadUserCollections, type CollectionWithMeta } from "@/lib/collections";
import {
  createGeoSpot,
  findNearestDiscoveryPlace,
  loadDiscoveryPlacesForMatching,
} from "@/lib/spots";
import {
  requestDeviceLocation,
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
  SPOT_LOCATION_REQUIRED_MESSAGE,
  spotPublishStatusMessage,
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
  prepareMediaFileForPublish,
  revokeMediaEditorItems,
  type MediaEditorItem,
} from "@/lib/mediaEditor";
import { setImmersiveOverlayActive } from "@/lib/immersiveOverlay";
import { type SpotLocationSourceKind } from "@/components/SpotLocationPicker";

type CreateSpotFormProps = {
  userId: string;
  isOpen: boolean;
  draftId?: string | null;
  onClose: () => void;
  onCreated: () => void;
  onDraftChanged?: () => void;
};

type Step = "camera" | "preview" | "offline_saved";

export default function CreateSpotForm({
  userId,
  isOpen,
  draftId,
  onClose,
  onCreated,
  onDraftChanged,
}: CreateSpotFormProps) {
  const router = useRouter();
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
  const [error, setError] = useState<string | null>(null);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [isOfflineCapture, setIsOfflineCapture] = useState(false);

  const currentDraftIdRef = useRef<string | null>(draftId ?? null);
  const saveTimeoutRef = useRef<number | null>(null);
  const skipSaveOnCloseRef = useRef(false);

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
      if (!activeMedia || step !== "preview") {
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
          setError("Unable to open this Spot draft.");
          setStep("camera");
          return;
        }

        const mediaBlob = await storage.getDraftBlob(nextDraftId, "media");

        if (!mediaBlob) {
          setError("This Spot draft is missing its media file.");
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
        setError(caught instanceof Error ? caught.message : "Unable to open Spot draft.");
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

    return () => {
      setImmersiveOverlayActive(false);
    };
  }, [draftId, isOpen, restoreDraft, userId]);

  useEffect(() => {
    if (!isOpen || step !== "preview" || !activeMedia || loadingDraft) {
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

  const handleClose = async () => {
    if (!skipSaveOnCloseRef.current && activeMedia && step === "preview") {
      await persistDraft();
    }

    setImmersiveOverlayActive(false);
    resetAll();
    onClose();
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

  const applyResolvedLocation = async (
    latitude: number,
    longitude: number,
    source: SpotLocationSourceKind
  ) => {
    const resolved = await spotLocationFromCoordinates(latitude, longitude);
    const matched = findNearestDiscoveryPlace(resolved, places);

    setLocation(resolved);
    setLocationSource(source);
    setNeedsLocationChoice(false);
    setLocationHint(null);
    setMatchedPlaceName(matched?.name ?? null);
  };

  const resolveFromDevice = async () => {
    setLocating(true);
    setLocationHint(null);

    try {
      const detected = await requestDeviceLocation();
      await applyResolvedLocation(detected.latitude, detected.longitude, "device");
    } catch (caught) {
      setNeedsLocationChoice(true);
      setLocationHint(
        caught instanceof Error ? caught.message : "Unable to detect your location."
      );
    } finally {
      setLocating(false);
    }
  };

  const applySearchPlace = async (place: PlaceSearchResult) => {
    setLocating(true);
    setLocationHint(null);

    try {
      await applyResolvedLocation(place.latitude, place.longitude, "search");
    } catch (caught) {
      setLocationHint(
        caught instanceof Error ? caught.message : "Unable to use the selected place."
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
      const detected = await requestDeviceLocation();
      await applyResolvedLocation(detected.latitude, detected.longitude, "device");
    } catch (caught) {
      setNeedsLocationChoice(true);
      setLocationHint(
        caught instanceof Error ? caught.message : "Unable to detect your location."
      );
    } finally {
      setLocating(false);
    }
  };

  const handleMediaCaptured = async (file: File, nextType: "image" | "video") => {
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
    setStep("preview");
    void resolveLocationAfterCapture();
  };

  const handlePublish = async () => {
    if (!userId) {
      setError(NOT_SIGNED_IN_UPLOAD_MESSAGE);
      return;
    }

    if (!activeMedia) {
      setError("Add a photo or video first.");
      void backToCamera();
      return;
    }

    if (!hasSpotPublishLocation(location)) {
      setError(SPOT_LOCATION_REQUIRED_MESSAGE);
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
    setError(null);

    try {
      const publishFile = await prepareMediaFileForPublish(activeMedia);

      const result = await createGeoSpot({
        userId,
        file: publishFile,
        mediaType: activeMedia.mediaType,
        spotName: resolveSpotName(spotName),
        location: location!,
        collectionId: collectionId || null,
        manualPlaceId: null,
        coverFile: activeMedia.mediaType === "video" ? activeMedia.coverFile : null,
      });

      if (result.error) {
        if (isLikelyNetworkError(new Error(result.error))) {
          await persistDraft({ uploadStatus: "ready", uploadError: result.error });
          setError("Upload failed. Your Spot was saved as a draft on this device.");
        } else {
          setError(result.error);
        }

        setPublishing(false);
        return;
      }

      if (currentDraftIdRef.current) {
        await getSpotDraftStorage().deleteDraft(currentDraftIdRef.current);
        notifyDraftChanged();
      }

      skipSaveOnCloseRef.current = true;
      const postId = result.postId;
      await handleClose();
      onCreated();

      if (postId) {
        router.push(`/posts/${encodeURIComponent(postId)}`);
      }
    } catch (caught) {
      if (isLikelyNetworkError(caught)) {
        await persistDraft({
          uploadStatus: "ready",
          uploadError: caught instanceof Error ? caught.message : null,
        });
        setError("Upload failed. Your Spot was saved as a draft on this device.");
      } else {
        setError(caught instanceof Error ? caught.message : "Unable to publish spot.");
      }
    }

    setPublishing(false);
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
    ? "You're offline. This Spot will stay on your device until you upload it."
    : spotPublishStatusMessage(publishBlockReason);

  const renderSpotFlow = () => {
    if (loadingDraft) {
      return (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-[#050816] px-6 text-center">
          <p className="text-sm text-muted">Opening Spot draft…</p>
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

    if (step === "preview" && activeMedia?.mediaType === "video") {
      return (
        <SpotVideoEditorScreen
          item={activeMedia}
          spotName={spotName}
          collections={collections}
          collectionId={collectionId}
          collectionsLoading={collectionsLoading}
          locating={locating}
          location={location}
          locationSource={locationSource}
          matchedPlaceName={matchedPlaceName}
          needsLocationChoice={needsLocationChoice}
          locationHint={locationHint}
          publishing={publishing}
          publishStatusMessage={publishStatusMessage}
          offlineMode={offlineMode}
          error={error}
          onItemChange={updateActiveItem}
          onTrimChange={updateActiveItemTrim}
          onSpotNameChange={setSpotName}
          onCollectionChange={setCollectionId}
          onUseCurrentLocation={() => void resolveFromDevice()}
          onSelectPlace={(place) => void applySearchPlace(place)}
          onDismiss={() => void handleClose()}
          onRetake={() => void backToCamera()}
          onPublish={() => void handlePublish()}
        />
      );
    }

    if (step === "preview" && activeMedia?.mediaType === "image") {
      return (
        <SpotCapturePreviewScreen
          item={activeMedia}
          spotName={spotName}
          collections={collections}
          collectionId={collectionId}
          collectionsLoading={collectionsLoading}
          locating={locating}
          location={location}
          locationSource={locationSource}
          matchedPlaceName={matchedPlaceName}
          needsLocationChoice={needsLocationChoice}
          locationHint={locationHint}
          publishing={publishing}
          publishStatusMessage={publishStatusMessage}
          offlineMode={offlineMode}
          error={error}
          onSpotNameChange={setSpotName}
          onCollectionChange={setCollectionId}
          onUseCurrentLocation={() => void resolveFromDevice()}
          onSelectPlace={(place) => void applySearchPlace(place)}
          onDismiss={() => void handleClose()}
          onRetake={() => void backToCamera()}
          onPublish={() => void handlePublish()}
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
