"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
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
import { isDeviceOnline, isLikelyNetworkError } from "@/lib/deviceOnline";
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
  onClose: () => void;
  onCreated: () => void;
};

type Step = "camera" | "preview" | "publish";

export default function CreateSpotForm({
  userId,
  isOpen,
  onClose,
  onCreated,
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
  const [error, setError] = useState<string | null>(null);

  // Pre-warmed location captured while camera is open (fast lookup, low accuracy).
  // Used immediately after capture to avoid making the user wait for GPS.
  const cachedLocationRef = useRef<SpotGeoLocation | null>(null);
  const editorOpenedAtRef = useRef<number | null>(null);

  const activeMedia = getActiveMediaEditorItem(mediaItems, activeMediaIndex);

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
    clearMedia();
    setStep("camera");
    setSpotName("");
    setCollectionId("");
    setLocating(false);
    setPublishing(false);
    setUploadProgress(null);
    setUploadFailed(false);
    setError(null);
  };

  useEffect(() => {
    if (!isOpen) {
      setImmersiveOverlayActive(false);
      return;
    }

    setImmersiveOverlayActive(true);

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
  }, [isOpen, userId]);

  const handleClose = () => {
    setImmersiveOverlayActive(false);
    resetAll();
    onClose();
  };

  const discardVideoAndReturnToCamera = async () => {
    await backToCamera();
  };

  const backToCamera = async () => {
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
      setError(t("spotEditor.offlineHint"));
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

      const postId = result.postId;
      setPublishing(false);
      onCreated();

      if (postId) {
        router.push(`/posts?id=${encodeURIComponent(postId)}`);
      }

      void handleClose();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : t("spotEditor.error.publishFailed");
      setUploadFailed(true);

      if (isLikelyNetworkError(caught)) {
        setError(t("spotEditor.error.uploadFailed"));
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

  const offlineMode = !isDeviceOnline();
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
          onDiscardVideo={() => void discardVideoAndReturnToCamera()}
          onRetake={() => void backToCamera()}
          onNext={() => handleNext()}
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
          onDiscard={() => void discardVideoAndReturnToCamera()}
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
