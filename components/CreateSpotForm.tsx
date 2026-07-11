"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import SpotInstagramCamera from "@/components/SpotInstagramCamera";
import { useI18n } from "@/components/I18nProvider";
import SpotLocationSavedChoiceScreen from "@/components/SpotLocationSavedChoiceScreen";
import SpotLocationTextCardEditorScreen from "@/components/SpotLocationTextCardEditorScreen";
import SendLocationCardSheet from "@/components/SendLocationCardSheet";
import SaveTextCardToCollectionSheet from "@/components/SaveTextCardToCollectionSheet";
import SpotPublishScreen from "@/components/SpotPublishScreen";
import { loadUserCollections, type CollectionWithMeta } from "@/lib/collections";
import {
  captureDeviceSpotLocation,
  SPOT_GPS_CAPTURE_FAILED_MESSAGE,
} from "@/lib/captureDeviceSpotLocation";
import { findNearestDiscoveryPlace, loadDiscoveryPlacesForMatching } from "@/lib/spots";
import type { DiscoveryPlace } from "@/lib/discoveryMap";
import { NOT_SIGNED_IN_UPLOAD_MESSAGE } from "@/lib/postMedia";
import { resolveSpotName } from "@/lib/spotPublish";
import { normalizeSpotCaption } from "@/lib/spotCaption";
import { isDeviceOnline, isLikelyNetworkError } from "@/lib/deviceOnline";
import {
  createGalleryMediaEditorItem,
  createMediaEditorItem,
  revokeMediaEditorItem,
  revokeMediaEditorItems,
  type MediaEditorItem,
} from "@/lib/mediaEditor";
import { publishSpotWithProgress, type SpotUploadProgress } from "@/lib/spotUploadPipeline";
import { setImmersiveOverlayActive } from "@/lib/immersiveOverlay";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import { hasVerifiedSpotCaptureLocation } from "@/lib/spotCaptureLocation";
import type { SpotGeoLocation } from "@/lib/spotLocation";
import { formatSpotGeoLocationShortLabel } from "@/lib/spotLocationDisplay";
import { pickSpotGalleryPhoto, pickSpotGalleryVideo } from "@/lib/pickMediaFromGallery";
import type { SpotCreateLaunch } from "@/lib/createSpotLaunch";
import { DEFAULT_SPOT_CREATE_LAUNCH } from "@/lib/createSpotLaunch";
import type { SpotLocationCardFontStyle } from "@/lib/spotLocationCardStyles";
import {
  logSpotMediaAddPhotoSelected,
  logSpotMediaAddVideoSelected,
  logSpotPublishMediaItemsPayload,
} from "@/lib/spotMediaLog";

type CreateSpotFormProps = {
  userId: string;
  isOpen: boolean;
  launch?: SpotCreateLaunch;
  onClose: () => void;
  onCreated: () => void;
};

type Step = "locating" | "choice" | "text-card" | "publish";
type CreationMode = "text" | "media" | null;

export default function CreateSpotForm({
  userId,
  isOpen,
  launch = DEFAULT_SPOT_CREATE_LAUNCH,
  onClose,
  onCreated,
}: CreateSpotFormProps) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const [step, setStep] = useState<Step>("locating");
  const [creationMode, setCreationMode] = useState<CreationMode>(null);
  const [cardText, setCardText] = useState("");
  const [caption, setCaption] = useState("");
  const [cardFontStyle, setCardFontStyle] = useState<SpotLocationCardFontStyle>("classic");
  const [collectionId, setCollectionId] = useState("");
  const [collections, setCollections] = useState<CollectionWithMeta[]>([]);
  const [collectionsLoading, setCollectionsLoading] = useState(false);
  const [publishPreviewItems, setPublishPreviewItems] = useState<MediaEditorItem[]>([]);
  const [location, setLocation] = useState<SpotGeoLocation | null>(null);
  const [places, setPlaces] = useState<DiscoveryPlace[]>([]);
  const [locating, setLocating] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [pickingMedia, setPickingMedia] = useState(false);
  const [saveCollectionSheetOpen, setSaveCollectionSheetOpen] = useState(false);
  const [sendToSheetOpen, setSendToSheetOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<SpotUploadProgress | null>(null);
  const [uploadFailed, setUploadFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const publishPreviewItemsRef = useRef<MediaEditorItem[]>([]);
  const placesRef = useRef<DiscoveryPlace[]>([]);

  placesRef.current = places;
  publishPreviewItemsRef.current = publishPreviewItems;

  const offlineMode = !isDeviceOnline();
  const shortLocationLabel = location
    ? formatSpotGeoLocationShortLabel(location, locale)
    : "";

  const clearPublishPreview = useCallback(() => {
    setPublishPreviewItems((current) => {
      revokeMediaEditorItems(current);
      return [];
    });
  }, []);

  const resetAll = useCallback(() => {
    clearPublishPreview();
    setStep("locating");
    setCreationMode(null);
    setCardText("");
    setCaption("");
    setCardFontStyle("classic");
    setLocation(null);
    setLocating(false);
    setShowCamera(false);
    setPickingMedia(false);
    setSaveCollectionSheetOpen(false);

    setSendToSheetOpen(false);
    setPublishing(false);
    setUploadProgress(null);
    setUploadFailed(false);
    setError(null);
  }, [clearPublishPreview]);

  const startLocationCapture = useCallback(async () => {
    setLocating(true);
    setError(null);
    setStep("locating");

    try {
      const captured = await captureDeviceSpotLocation();
      setLocation(captured);
      setStep("choice");
    } catch {
      setError(SPOT_GPS_CAPTURE_FAILED_MESSAGE);
      setStep("locating");
    } finally {
      setLocating(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setImmersiveOverlayActive(false);
      return;
    }

    setImmersiveOverlayActive(true);
    resetAll();

    if (launch.kind === "map-text-card") {
      setLocation(launch.location);
      setCreationMode("text");
      setStep("text-card");
      setLocating(false);
      setError(null);
    } else {
      void startLocationCapture();
    }

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

    return () => {
      setImmersiveOverlayActive(false);
    };
  }, [isOpen, launch, resetAll, startLocationCapture, userId]);

  const handleClose = () => {
    setImmersiveOverlayActive(false);
    resetAll();
    onClose();
  };

  const handleRetryLocation = () => {
    void startLocationCapture();
  };

  const goToPublish = useCallback((items: MediaEditorItem[], mode: CreationMode) => {
    clearPublishPreview();
    setPublishPreviewItems(items);
    setCreationMode(mode);
    setError(null);
    setStep("publish");
  }, [clearPublishPreview]);

  const handleCameraCapture = (
    file: File,
    mediaType: "image" | "video",
    captureLocation: SpotGeoLocation | null
  ) => {
    setShowCamera(false);

    if (mediaType !== "image") {
      setError(t("spotLocationCard.cameraPhotoOnly"));
      setStep("choice");
      return;
    }

    if (captureLocation && hasVerifiedSpotCaptureLocation(captureLocation)) {
      setLocation(captureLocation);
    }

    const item = createMediaEditorItem(file, "image");
    goToPublish([item], "media");
  };

  const handleChoosePhoto = async () => {
    setPickingMedia(true);
    setError(null);

    try {
      const file = await pickSpotGalleryPhoto();

      if (!file) {
        return;
      }

      logSpotMediaAddPhotoSelected({
        fileName: file.name,
        size: file.size,
        type: file.type,
      });

      const item = await createGalleryMediaEditorItem(file);

      if (!item) {
        setError(t("spotEditor.error.addMediaFirst"));
        return;
      }

      goToPublish([item], "media");
    } finally {
      setPickingMedia(false);
    }
  };

  const handleChooseVideo = async () => {
    setPickingMedia(true);
    setError(null);

    try {
      const file = await pickSpotGalleryVideo();

      if (!file) {
        return;
      }

      logSpotMediaAddVideoSelected({
        fileName: file.name,
        size: file.size,
        type: file.type,
      });

      const item = await createGalleryMediaEditorItem(file);

      if (!item) {
        setError(t("spotEditor.error.addMediaFirst"));
        return;
      }

      goToPublish([item], "media");
    } finally {
      setPickingMedia(false);
    }
  };

  const handleOpenSaveCollectionSheet = () => {
    if (!location || !userId) {
      if (!userId) {
        setError(NOT_SIGNED_IN_UPLOAD_MESSAGE);
      }
      return;
    }

    if (!hasVerifiedSpotCaptureLocation(location)) {
      setError(SPOT_GPS_CAPTURE_FAILED_MESSAGE);
      void handleRetryLocation();
      return;
    }

    if (!isDeviceOnline()) {
      setError(t("spotEditor.offlineHint"));
      return;
    }

    setError(null);
    setSaveCollectionSheetOpen(true);
  };

  const handleKeepSoundChange = (keepSound: boolean, mediaIndex = 0) => {
    setPublishPreviewItems((current) =>
      current.map((item, index) => {
        if (index === mediaIndex && item.mediaType === "video") {
          return { ...item, keepSound };
        }

        return item;
      })
    );
  };

  const handlePublishBack = () => {
    setError(null);
    clearPublishPreview();

    if (creationMode === "text") {
      setStep("text-card");
      return;
    }

    setStep("choice");
  };

  const handlePublish = async () => {
    if (!userId) {
      setError(NOT_SIGNED_IN_UPLOAD_MESSAGE);
      return;
    }

    if (!hasVerifiedSpotCaptureLocation(location)) {
      setError(SPOT_GPS_CAPTURE_FAILED_MESSAGE);
      void handleRetryLocation();
      return;
    }

    const itemsToPublish = publishPreviewItemsRef.current;

    if (itemsToPublish.length === 0) {
      setError(t("spotEditor.error.addMediaFirst"));
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

    logSpotPublishMediaItemsPayload(
      itemsToPublish.map((item) => ({
        mediaType: item.mediaType,
        fileSize: item.file.size,
        fileName: item.file.name,
      }))
    );

    try {
      const matchedPlace = location
        ? findNearestDiscoveryPlace(location, placesRef.current)?.name ?? null
        : null;

      const result = await publishSpotWithProgress({
        userId,
        mediaItems: itemsToPublish,
        spotName:
          creationMode === "text"
            ? resolveSpotName(cardText)
            : resolveSpotName(matchedPlace || shortLocationLabel),
        caption: creationMode === "text" ? undefined : normalizeSpotCaption(caption).trim() || undefined,
        location,
        collectionId: collectionId || null,
        discoveryPlaces: placesRef.current,
        locationCard: creationMode === "text",
        onProgress: (progress) => {
          setUploadProgress(progress);
        },
      });

      const postId = result.postId;

      if (result.carouselWarning) {
        setUploadFailed(true);
        setError(result.carouselWarning);
      }

      if (postId) {
        onCreated();
        router.push(`/posts?id=${encodeURIComponent(postId)}`);

        if (!result.carouselWarning) {
          handleClose();
        }
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : t("spotEditor.error.publishFailed");
      setUploadFailed(true);
      setUploadProgress(null);

      if (isLikelyNetworkError(caught)) {
        setError(t("spotEditor.error.uploadFailed"));
      } else {
        setError(localizeUserMessage(t, message) ?? message);
      }
    } finally {
      setPublishing(false);
    }
  };

  if (!isOpen || typeof document === "undefined") {
    return null;
  }

  if (step === "locating") {
    return createPortal(
      <div className="fixed inset-0 z-[130] flex flex-col items-center justify-center bg-[#030712] px-6 text-center text-white">
        {locating ? (
          <>
            <div className="h-12 w-12 animate-spin rounded-full border-2 border-white/15 border-t-cyan-300" />
            <p className="mt-6 text-base font-semibold">{t("spotLocationCard.savingLocation")}</p>
            <p className="mt-2 max-w-xs text-sm text-white/50">{t("spotLocationCard.savingLocationHint")}</p>
          </>
        ) : (
          <>
            <p className="max-w-sm text-sm leading-relaxed text-red-200">
              {localizeUserMessage(t, error) ?? t("spotLocationCard.gpsFailed")}
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => void handleRetryLocation()}
                className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-[#050816]"
              >
                {t("common.tryAgain")}
              </button>
              <button
                type="button"
                onClick={() => void handleClose()}
                className="rounded-full bg-white/10 px-5 py-2.5 text-sm font-semibold text-white"
              >
                {t("spotEditor.close")}
              </button>
            </div>
          </>
        )}
      </div>,
      document.body
    );
  }

  if (showCamera) {
    return createPortal(
      <SpotInstagramCamera
        photoOnly
        onClose={() => {
          setShowCamera(false);
          setStep("choice");
        }}
        onCapture={(file, mediaType, captureLocation) =>
          handleCameraCapture(file, mediaType, captureLocation)
        }
      />,
      document.body
    );
  }

  if (step === "publish" && publishPreviewItems.length > 0 && location) {
    return createPortal(
      <SpotPublishScreen
        mediaItems={publishPreviewItems}
        collections={collections}
        collectionId={collectionId}
        collectionsLoading={collectionsLoading}
        caption={caption}
        locationLabel={shortLocationLabel}
        publishing={publishing}
        uploadProgress={uploadProgress}
        uploadFailed={uploadFailed}
        offlineMode={offlineMode}
        error={error}
        onCaptionChange={setCaption}
        onCollectionChange={setCollectionId}
        onBack={handlePublishBack}
        onPublish={() => void handlePublish()}
        onKeepSoundChange={handleKeepSoundChange}
      />,
      document.body
    );
  }

  if (step === "text-card" && location) {
    return createPortal(
      <>
        <SpotLocationTextCardEditorScreen
          locationLabel={shortLocationLabel}
          cardText={cardText}
          cardFontStyle={cardFontStyle}
          error={error}
          onCardTextChange={setCardText}
          onCardFontStyleChange={setCardFontStyle}
          onBack={() => {
            setError(null);

            if (launch.kind === "map-text-card") {
              handleClose();
              return;
            }

            setStep("choice");
          }}
          onSave={handleOpenSaveCollectionSheet}
          onSendTo={() => {
            setError(null);
            setSendToSheetOpen(true);
          }}
        />
        {location ? (
          <SaveTextCardToCollectionSheet
            isOpen={saveCollectionSheetOpen}
            userId={userId}
            cardText={cardText}
            cardFontStyle={cardFontStyle}
            locationLabel={shortLocationLabel}
            location={location}
            publishToMap={launch.kind === "map-text-card"}
            onClose={() => setSaveCollectionSheetOpen(false)}
            onSaved={() => {
              if (launch.kind === "map-text-card") {
                handleClose();
              }
            }}
          />
        ) : null}
        <SendLocationCardSheet
          isOpen={sendToSheetOpen}
          userId={userId}
          cardText={cardText}
          cardFontStyle={cardFontStyle}
          locationLabel={shortLocationLabel}
          location={location}
          onClose={() => setSendToSheetOpen(false)}
          onSent={() => {
            setSendToSheetOpen(false);
            handleClose();
          }}
        />
      </>,
      document.body
    );
  }

  if (step === "choice" && location) {
    return createPortal(
      <SpotLocationSavedChoiceScreen
        locationLabel={shortLocationLabel}
        error={error}
        busy={pickingMedia}
        onClose={() => void handleClose()}
        onTextCard={() => {
          setError(null);
          setStep("text-card");
        }}
        onTakePhoto={() => {
          setError(null);
          setShowCamera(true);
        }}
        onChoosePhoto={() => void handleChoosePhoto()}
        onChooseVideo={() => void handleChooseVideo()}
      />,
      document.body
    );
  }

  return null;
}
