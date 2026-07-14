"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import SpotInstagramCamera, { type SpotCreateCameraMode } from "@/components/SpotInstagramCamera";
import SpotTextCardEditorScreen from "@/components/SpotTextCardEditorScreen";
import SpotPublishScreen from "@/components/SpotPublishScreen";
import { useI18n } from "@/components/I18nProvider";
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
  revokeMediaEditorItems,
  withMeasuredVideoDuration,
  type MediaEditorItem,
} from "@/lib/mediaEditor";
import { publishSpotWithProgress, type SpotUploadProgress } from "@/lib/spotUploadPipeline";
import { setImmersiveOverlayActive } from "@/lib/immersiveOverlay";
import { localizeCaughtError } from "@/lib/i18n/localizeUserMessage";
import { hasVerifiedSpotCaptureLocation } from "@/lib/spotCaptureLocation";
import type { SpotGeoLocation } from "@/lib/spotLocation";
import { formatSpotGeoLocationShortLabel } from "@/lib/spotLocationDisplay";
import { pickSpotGalleryMedia } from "@/lib/pickMediaFromGallery";
import { isVideoLongerThanMaxSeconds, MAX_TRIM_CLIP_SECONDS } from "@/lib/videoTrim";
import type { SpotCreateLaunch } from "@/lib/createSpotLaunch";
import { DEFAULT_SPOT_CREATE_LAUNCH } from "@/lib/createSpotLaunch";
import { renderSpotLocationCardFile } from "@/lib/renderSpotLocationCard";
import {
  type SpotLocationCardFontStyle,
  type SpotTextCardAlign,
  type SpotTextCardFontSize,
  type SpotTextCardTemplateId,
} from "@/lib/spotLocationCardStyles";
import { finishSpotPublishToProfile } from "@/lib/finishSpotPublishToProfile";
import { logSpotMediaAddPhotoSelected, logSpotPublishMediaItemsPayload } from "@/lib/spotMediaLog";
import { publishErrorForUi } from "@/lib/spotPublishError";

type CreateSpotFormProps = {
  userId: string;
  isOpen: boolean;
  launch?: SpotCreateLaunch;
  onClose: () => void;
  onCreated: () => void;
};

type Step = "camera" | "text" | "publish";

export default function CreateSpotForm({
  userId,
  isOpen,
  launch = DEFAULT_SPOT_CREATE_LAUNCH,
  onClose,
  onCreated,
}: CreateSpotFormProps) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const [step, setStep] = useState<Step>("camera");
  const [cameraMode, setCameraMode] = useState<SpotCreateCameraMode>("photo");
  const [caption, setCaption] = useState("");
  const [collectionId, setCollectionId] = useState("");
  const [collections, setCollections] = useState<CollectionWithMeta[]>([]);
  const [collectionsLoading, setCollectionsLoading] = useState(false);
  const [publishPreviewItems, setPublishPreviewItems] = useState<MediaEditorItem[]>([]);
  const [location, setLocation] = useState<SpotGeoLocation | null>(null);
  const [places, setPlaces] = useState<DiscoveryPlace[]>([]);
  const [pickingMedia, setPickingMedia] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const publishingRef = useRef(false);
  const [uploadProgress, setUploadProgress] = useState<SpotUploadProgress | null>(null);
  const [uploadFailed, setUploadFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishAsLocationCard, setPublishAsLocationCard] = useState(false);

  const [cardText, setCardText] = useState("");
  const [templateId, setTemplateId] = useState<SpotTextCardTemplateId>("classic");
  const [fontStyle, setFontStyle] = useState<SpotLocationCardFontStyle>("classic");
  const [fontSize, setFontSize] = useState<SpotTextCardFontSize>("md");
  const [align, setAlign] = useState<SpotTextCardAlign>("center");

  const publishPreviewItemsRef = useRef<MediaEditorItem[]>([]);
  const placesRef = useRef<DiscoveryPlace[]>([]);
  const locationRef = useRef<SpotGeoLocation | null>(null);

  placesRef.current = places;
  publishPreviewItemsRef.current = publishPreviewItems;
  locationRef.current = location;

  const offlineMode = !isDeviceOnline();
  const shortLocationLabel = location
    ? formatSpotGeoLocationShortLabel(location, locale)
    : t("map.selectedLocation");

  const clearPublishPreview = useCallback(() => {
    setPublishPreviewItems((current) => {
      revokeMediaEditorItems(current);
      return [];
    });
  }, []);

  const resetAll = useCallback(() => {
    clearPublishPreview();
    setStep("camera");
    setCameraMode("photo");
    setCaption("");
    setLocation(null);
    setPickingMedia(false);
    setPublishing(false);
    setUploadProgress(null);
    setUploadFailed(false);
    setError(null);
    setPublishAsLocationCard(false);
    setCardText("");
    setTemplateId("classic");
    setFontStyle("classic");
    setFontSize("md");
    setAlign("center");
  }, [clearPublishPreview]);

  const startLocationCapture = useCallback(async () => {
    try {
      const captured = await captureDeviceSpotLocation();
      setLocation(captured);
    } catch {
      // Camera stays open; GPS can retry at publish time.
      console.warn("[CreateSpotForm] background GPS capture failed");
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setImmersiveOverlayActive(false);
      return;
    }

    setImmersiveOverlayActive(true);
    resetAll();
    setStep("camera");
    void startLocationCapture();

    if (isDeviceOnline()) {
      void loadDiscoveryPlacesForMatching().then((loaded) => {
        setPlaces(loaded);
      });
      setCollectionsLoading(true);
      void loadUserCollections(userId, userId).then((result) => {
        setCollections(result.collections);
        setCollectionsLoading(false);
      });
    } else {
      setPlaces([]);
      setCollections([]);
      setCollectionsLoading(false);
    }

    return () => {
      setImmersiveOverlayActive(false);
      revokeMediaEditorItems(publishPreviewItemsRef.current);
      publishPreviewItemsRef.current = [];
    };
  }, [isOpen, launch, resetAll, startLocationCapture, userId]);

  const handleClose = () => {
    if (publishing) {
      return;
    }

    const hasDraft =
      publishPreviewItemsRef.current.length > 0 ||
      Boolean(caption.trim()) ||
      Boolean(cardText.trim()) ||
      step === "publish" ||
      step === "text";

    if (hasDraft) {
      const confirmed = window.confirm(`${t("spotEditor.exit.title")}\n\n${t("spotEditor.exit.body")}`);

      if (!confirmed) {
        return;
      }
    }

    setImmersiveOverlayActive(false);
    resetAll();
    onClose();
  };

  const goToPublish = useCallback(
    (items: MediaEditorItem[], asLocationCard = false) => {
      clearPublishPreview();
      setPublishPreviewItems(items);
      setPublishAsLocationCard(asLocationCard);
      setError(null);
      setStep("publish");
    },
    [clearPublishPreview]
  );

  const ensureLocationForPublish = useCallback(async () => {
    if (hasVerifiedSpotCaptureLocation(locationRef.current)) {
      return locationRef.current;
    }

    try {
      const fresh = await captureDeviceSpotLocation();

      if (hasVerifiedSpotCaptureLocation(fresh)) {
        setLocation(fresh);
        return fresh;
      }
    } catch {
      // fall through
    }

    return null;
  }, []);

  const handleCameraCapture = async (
    file: File,
    mediaType: "image" | "video",
    captureLocation: SpotGeoLocation | null,
    nativeWebPath?: string
  ) => {
    if (captureLocation && hasVerifiedSpotCaptureLocation(captureLocation)) {
      setLocation(captureLocation);
    } else if (!hasVerifiedSpotCaptureLocation(locationRef.current)) {
      void startLocationCapture();
    }

    // Native camera video (SpotDropCamera / AVCaptureMovieFileOutput) is
    // trusted directly via `mediaType` — the recorder itself already enforces
    // the max duration, so no extra validation is needed here.
    if (mediaType === "video") {
      // Prefer the native webPath as the Share-screen preview source (streamed
      // directly by WKWebView from disk) over a blob: URL built from the
      // already-decoded `file` — see createMediaEditorItem for why, and
      // CarouselVideoSlide for the automatic fallback if it fails to load.
      const item = await withMeasuredVideoDuration(
        createMediaEditorItem(file, "video", { nativeWebPath })
      );
      console.log(
        `[CreateSpotForm][video-preview] item created | previewUrl=${item.previewUrl} | fallbackPreviewUrl=${item.fallbackPreviewUrl ?? "(none)"} | fileSize=${file.size} | fileType=${file.type}`
      );
      goToPublish([item], false);
      return;
    }

    const item = createMediaEditorItem(file, "image");
    goToPublish([item], false);
  };

  // Gallery pick always *replaces* the current draft — a Spot holds exactly
  // one photo or one video, so there is no "append" path anymore. Selecting
  // again from the camera or gallery is the only way to change the media;
  // there is no remove/reorder affordance on the Share screen itself.
  const ingestGalleryFile = useCallback(
    async (file: File, mediaType: "image" | "video") => {
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

      if (mediaType === "video") {
        const measured = await withMeasuredVideoDuration(item);

        if (
          measured.sourceDuration > 0 &&
          isVideoLongerThanMaxSeconds(measured.sourceDuration)
        ) {
          setError(`Clip must be ${MAX_TRIM_CLIP_SECONDS} seconds or less.`);
          return;
        }

        if (!hasVerifiedSpotCaptureLocation(locationRef.current)) {
          void startLocationCapture();
        }

        goToPublish([measured], false);
        return;
      }

      if (!hasVerifiedSpotCaptureLocation(locationRef.current)) {
        void startLocationCapture();
      }

      goToPublish([item], false);
    },
    [goToPublish, startLocationCapture, t]
  );

  const handlePickGallery = async () => {
    setPickingMedia(true);
    setError(null);

    try {
      const picked = await pickSpotGalleryMedia();

      if (!picked) {
        return;
      }

      await ingestGalleryFile(picked.file, picked.mediaType);
    } catch (caught) {
      setError(localizeCaughtError(t, caught, "spotEditor.error.addMediaFirst"));
    } finally {
      setPickingMedia(false);
    }
  };

  const handleTextContinue = async () => {
    if (!cardText.trim()) {
      setError(t("spotLocationCard.needCardOrMedia"));
      return;
    }

    setPublishing(true);
    setError(null);

    try {
      const publishLocation = await ensureLocationForPublish();

      if (!hasVerifiedSpotCaptureLocation(publishLocation)) {
        setError(SPOT_GPS_CAPTURE_FAILED_MESSAGE);
        return;
      }

      const label = formatSpotGeoLocationShortLabel(publishLocation!, locale);
      const cardFile = await renderSpotLocationCardFile({
        cardText,
        fontStyle,
        locationLabel: label,
        templateId,
        fontSize,
        align,
      });

      const item = createMediaEditorItem(cardFile, "image");
      goToPublish([item], true);
    } catch (caught) {
      setError(localizeCaughtError(t, caught, "spotEditor.error.publishFailed"));
    } finally {
      setPublishing(false);
    }
  };

  const handlePublishBack = () => {
    setError(null);
    clearPublishPreview();

    if (publishAsLocationCard) {
      setStep("text");
      return;
    }

    setStep("camera");
  };

  const handlePublish = async () => {
    if (publishingRef.current || publishing) {
      return;
    }

    if (!userId) {
      setError(NOT_SIGNED_IN_UPLOAD_MESSAGE);
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

    publishingRef.current = true;
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

    const PUBLISH_TIMEOUT_MS = 180_000;

    try {
      let publishLocation = await ensureLocationForPublish();

      try {
        const fresh = await captureDeviceSpotLocation();

        if (hasVerifiedSpotCaptureLocation(fresh)) {
          publishLocation = fresh;
          setLocation(fresh);
        }
      } catch {
        // Keep previously verified location.
      }

      if (!hasVerifiedSpotCaptureLocation(publishLocation)) {
        setError(SPOT_GPS_CAPTURE_FAILED_MESSAGE);
        setUploadFailed(true);
        return;
      }

      const matchedPlace = findNearestDiscoveryPlace(publishLocation!, placesRef.current)?.name ?? null;
      const label = formatSpotGeoLocationShortLabel(publishLocation!, locale);

      const result = await Promise.race([
        publishSpotWithProgress({
          userId,
          mediaItems: itemsToPublish,
          spotName: publishAsLocationCard
            ? resolveSpotName(cardText)
            : resolveSpotName(matchedPlace || label),
          caption: publishAsLocationCard
            ? undefined
            : normalizeSpotCaption(caption).trim() || undefined,
          location: publishLocation!,
          collectionId: collectionId || null,
          discoveryPlaces: placesRef.current,
          locationCard: publishAsLocationCard,
          onProgress: (progress) => {
            setUploadProgress(progress);
          },
        }),
        new Promise<never>((_, reject) => {
          window.setTimeout(() => {
            reject(new Error(t("spotEditor.error.uploadFailed")));
          }, PUBLISH_TIMEOUT_MS);
        }),
      ]);

      const postId = result.postId;

      if (postId) {
        // 1) Tear down temporary camera/media state before navigation.
        revokeMediaEditorItems(itemsToPublish);
        publishPreviewItemsRef.current = [];
        setPublishPreviewItems([]);
        setImmersiveOverlayActive(false);
        resetAll();

        // 2) Close create overlays (camera / share) — no history entries for these portals.
        onCreated();

        // 3) Replace current route with My profile → Posts/Spots (never open /posts viewer).
        //    router.replace removes this intermediate entry so Back cannot reopen create/share.
        finishSpotPublishToProfile(router);
        return;
      }
    } catch (caught) {
      setUploadFailed(true);
      setUploadProgress(null);

      const failedPhotoIndex = (caught as { failedPhotoIndex?: number }).failedPhotoIndex;
      const rawPublishError = publishErrorForUi(caught);

      console.error("[SPOT PUBLISH] CreateSpotForm catch", {
        rawPublishError,
        failedPhotoIndex,
        caught,
      });

      if (typeof failedPhotoIndex === "number") {
        setError(
          `${t("spotEditor.uploadFailedPhoto", { index: failedPhotoIndex + 1 })} — ${rawPublishError}`
        );
      } else if (isLikelyNetworkError(caught) && !rawPublishError.includes("[SPOT PUBLISH]")) {
        setError(`${t("spotEditor.error.uploadFailed")} — ${rawPublishError}`);
      } else {
        // Debug: show the real storage/database error, not a generic localized fallback.
        setError(rawPublishError);
      }
    } finally {
      publishingRef.current = false;
      setPublishing(false);
    }
  };

  if (!isOpen || typeof document === "undefined") {
    return null;
  }

  if (step === "publish") {
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
      />,
      document.body
    );
  }

  if (step === "text") {
    return createPortal(
      <SpotTextCardEditorScreen
        locationLabel={shortLocationLabel}
        cardText={cardText}
        templateId={templateId}
        fontStyle={fontStyle}
        fontSize={fontSize}
        align={align}
        error={error}
        publishing={publishing}
        onCardTextChange={setCardText}
        onTemplateChange={setTemplateId}
        onFontStyleChange={setFontStyle}
        onFontSizeChange={setFontSize}
        onAlignChange={setAlign}
        onBack={() => void handleClose()}
        onContinue={() => void handleTextContinue()}
        onSwitchToPhoto={() => {
          setError(null);
          setCameraMode("photo");
          setStep("camera");
        }}
      />,
      document.body
    );
  }

  return createPortal(
    <SpotInstagramCamera
      showCreateModes
      createMode={cameraMode === "text" ? "photo" : cameraMode}
      onCreateModeChange={(mode) => {
        if (mode === "text") {
          setError(null);
          setCameraMode("text");
          setStep("text");
          return;
        }

        setCameraMode(mode);
        setError(null);
      }}
      onPickGallery={() => void handlePickGallery()}
      galleryDisabled={pickingMedia || publishing}
      onClose={() => void handleClose()}
      onCapture={(file, mediaType, captureLocation, nativeWebPath) => {
        void handleCameraCapture(file, mediaType, captureLocation, nativeWebPath);
      }}
    />,
    document.body
  );
}
