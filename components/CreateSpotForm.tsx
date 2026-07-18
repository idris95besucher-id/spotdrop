"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import SpotInstagramCamera, { type SpotCreateCameraMode } from "@/components/SpotInstagramCamera";
import SpotTextCardEditorScreen from "@/components/SpotTextCardEditorScreen";
import SpotPublishScreen from "@/components/SpotPublishScreen";
import { useI18n } from "@/components/I18nProvider";
import {
  captureDeviceSpotLocation,
  SPOT_GPS_CAPTURE_FAILED_MESSAGE,
} from "@/lib/captureDeviceSpotLocation";
import { findNearestDiscoveryPlace, loadDiscoveryPlacesForMatching } from "@/lib/spots";
import type { DiscoveryPlace } from "@/lib/discoveryMap";
import { NOT_SIGNED_IN_UPLOAD_MESSAGE } from "@/lib/postMedia";
import { resolveSpotName, type SpotPublishDestination } from "@/lib/spotPublish";
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
import type { UploadTimingSummary } from "@/lib/spotUploadTiming";
import { setImmersiveOverlayActive } from "@/lib/immersiveOverlay";
import { acquireUploadWakeLock } from "@/lib/screenWakeLock";
import type { RetryAttemptInfo } from "@/lib/uploadRetry";
import {
  generateUploadRequestId,
  logUploadLifecycleEvent,
  logUploadPerfSummary,
  watchUploadEnvironment,
} from "@/lib/uploadLifecycleTrace";
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
  const [publishDestination, setPublishDestination] = useState<SpotPublishDestination>("public");
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
  const [retryStatus, setRetryStatus] = useState<RetryAttemptInfo | null>(null);
  // Created fresh per publish attempt and stored in a ref (not state) so re-renders while
  // publishing — progress updates, retry status, etc. — never recreate it or accidentally
  // abort it. Nothing auto-aborts this anymore (see handlePublish) — only a brand new
  // handlePublish() call replaces it with a fresh one for the next attempt.
  const uploadAbortControllerRef = useRef<AbortController | null>(null);
  const uploadRequestIdRef = useRef<string | null>(null);
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;

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
    setPublishDestination("public");
    setLocation(null);
    setPickingMedia(false);
    setPublishing(false);
    setUploadProgress(null);
    setUploadFailed(false);
    setRetryStatus(null);
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
    } else {
      setPlaces([]);
    }

    return () => {
      // If this cleanup runs while a publish is in flight, that's a genuine "user left the
      // upload flow" (isOpen/launch/userId changed out from under an in-progress publish —
      // normally impossible via the in-app Close button, which handleClose already blocks
      // while publishing, but possible if the parent forcibly tears this screen down) — abort
      // for real here. This is the *only* automatic abort left in the pipeline, and it fires
      // for the reason requirement 5 actually allows: leaving the upload flow, not a rerender,
      // not a progress update, not a wall-clock guess.
      if (publishingRef.current) {
        logUploadLifecycleEvent("create-spot-form-cleanup-while-publishing", {
          requestId: uploadRequestIdRef.current,
        });
        uploadAbortControllerRef.current?.abort();
      }

      setImmersiveOverlayActive(false);
      revokeMediaEditorItems(publishPreviewItemsRef.current);
      publishPreviewItemsRef.current = [];
    };
  }, [isOpen, launch, resetAll, startLocationCapture, userId]);

  useEffect(() => {
    logUploadLifecycleEvent("create-spot-form-mounted", {});

    return () => {
      logUploadLifecycleEvent("create-spot-form-unmounted", {
        requestId: uploadRequestIdRef.current,
        wasPublishing: publishingRef.current,
      });
    };
  }, []);

  useEffect(() => {
    if (publishing) {
      logUploadLifecycleEvent("rerender-during-publish", {
        requestId: uploadRequestIdRef.current,
        renderCount: renderCountRef.current,
        percent: uploadProgress?.percent ?? null,
        stage: uploadProgress?.stage ?? null,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

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

      // My Spots is photos-only — a video replacing a prior photo selection (or vice versa,
      // within the same open create flow) must not leave a stale "my-spots" choice in place.
      if (items.some((item) => item.mediaType === "video")) {
        setPublishDestination("public");
      }
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
    nativeWebPath?: string,
    nativeFilePath?: string,
    nativeFileSizeBytes?: number
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
      // Keep bytes on disk: preview via webPath, upload via nativeFilePath.
      // Never base64 / FileReader the video into JS memory.
      const item = await withMeasuredVideoDuration(
        createMediaEditorItem(file, "video", {
          nativeWebPath,
          nativeFilePath,
          nativeFileSizeBytes,
        })
      );
      console.log("[SPOT-VIDEO-TIMING] share item ready (no JS memory load)", {
        previewUrl: item.previewUrl,
        nativeFilePath: item.nativeFilePath ?? null,
        nativeFileSizeBytes: item.nativeFileSizeBytes ?? null,
        stubFileSize: file.size,
      });
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
    setRetryStatus(null);

    const requestId = generateUploadRequestId();
    uploadRequestIdRef.current = requestId;
    const originalFileSizeBytes = itemsToPublish[0]!.file.size;

    logUploadLifecycleEvent("publish-attempt-started", {
      requestId,
      itemCount: itemsToPublish.length,
      mediaType: itemsToPublish[0]!.mediaType,
      originalFileSizeBytes,
      renderCount: renderCountRef.current,
    });

    logSpotPublishMediaItemsPayload(
      itemsToPublish.map((item) => ({
        mediaType: item.mediaType,
        fileSize: item.file.size,
        fileName: item.file.name,
      }))
    );

    // A fresh controller per attempt, kept in a ref so re-renders during this publish
    // (progress ticks, retry status) can never recreate or drop it.
    //
    // IMPORTANT — this used to also be wrapped in `window.setTimeout(() => controller.abort(),
    // 180_000)` as a whole-pipeline safety net. That net is exactly what caused the
    // "[post-media upload] Upload aborted" bug: once automatic upload retries (with backoff)
    // were added, a 15s video needing even one retry on a slow connection could legitimately
    // take longer than 180s end-to-end (location + media prep + upload attempts + backoff
    // delays + DB insert), so the timer fired and killed a request that was still healthy and
    // making progress — often moments before it would have succeeded. Confirmed via
    // `grep -rn "\.abort("` across lib/ and components/: that setTimeout was the *only*
    // application-level call to controller.abort() in the entire codebase; every other abort
    // path is storageUpload.ts's own per-attempt stall/absolute-cap watchdogs, which are
    // failure-driven, not wall-clock-driven, and already bounded per attempt (see
    // ABSOLUTE_MAX_UPLOAD_MS) — so a second, blunter pipeline-level clock on top of them was
    // both redundant and actively harmful. Removed. This controller now only aborts for a
    // genuinely explicit reason (see uploadLifecycleTrace logs for every abort() call site).
    logUploadLifecycleEvent("abort-controller-created", { requestId });
    const controller = new AbortController();
    uploadAbortControllerRef.current = controller;
    const wakeLock = acquireUploadWakeLock();
    const stopWatchingEnvironment = watchUploadEnvironment(requestId);

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
      // Defensive: My Spots is photos-only. The Share screen already hides/forces this off for
      // a video, but never trust UI state alone for what gets written to the database.
      const isMySpotsPublish =
        publishDestination === "my-spots" && itemsToPublish[0]!.mediaType !== "video";

      const result = await publishSpotWithProgress({
        userId,
        mediaItems: itemsToPublish,
        spotName: publishAsLocationCard
          ? resolveSpotName(cardText)
          : resolveSpotName(matchedPlace || label),
        caption: publishAsLocationCard
          ? undefined
          : normalizeSpotCaption(caption).trim() || undefined,
        location: publishLocation!,
        publishToMySpots: isMySpotsPublish,
        discoveryPlaces: placesRef.current,
        locationCard: publishAsLocationCard,
        signal: controller.signal,
        requestId,
        onProgress: (progress) => {
          setUploadProgress(progress);
        },
        onUploadRetry: (info) => {
          setRetryStatus(info);
        },
      });

      const postId = result.postId;

      if (result.timing) {
        logUploadPerfSummary({
          requestId,
          originalFileSizeBytes,
          processedFileSizeBytes: Math.round(result.timing.processedVideoSizeMb * 1024 * 1024),
          preprocessingDurationMs: result.timing.exportDurationMs,
          uploadDurationMs: result.timing.storageDurationMs,
          averageUploadSpeedMbps: result.timing.averageUploadSpeedMbps,
          abortedAt: null,
        });
      }

      if (postId) {
        // Capture before resetAll() below resets it back to "public".
        const publishedDestinationTab = isMySpotsPublish ? "my-spots" : "spots";

        // 1) Tear down temporary camera/media state before navigation.
        revokeMediaEditorItems(itemsToPublish);
        publishPreviewItemsRef.current = [];
        setPublishPreviewItems([]);
        setImmersiveOverlayActive(false);
        resetAll();

        // 2) Close create overlays (camera / share) — no history entries for these portals.
        onCreated();

        // 3) Replace current route with My profile → Posts/Spots (or My Spots — never open
        //    /posts viewer). router.replace removes this intermediate entry so Back cannot
        //    reopen create/share.
        finishSpotPublishToProfile(router, publishedDestinationTab);
        return;
      }
    } catch (caught) {
      setUploadFailed(true);
      setUploadProgress(null);
      setRetryStatus(null);

      const failedPhotoIndex = (caught as { failedPhotoIndex?: number }).failedPhotoIndex;
      const errorKind = (caught as { errorKind?: string }).errorKind;
      const failedTiming = (caught as { timing?: UploadTimingSummary }).timing;
      const wasAborted =
        errorKind === "aborted" || (caught instanceof DOMException && caught.name === "AbortError");
      const rawPublishError = publishErrorForUi(caught);

      logUploadPerfSummary({
        requestId,
        originalFileSizeBytes,
        processedFileSizeBytes: Math.round((failedTiming?.processedVideoSizeMb ?? 0) * 1024 * 1024),
        preprocessingDurationMs: failedTiming?.exportDurationMs ?? 0,
        uploadDurationMs: failedTiming?.storageDurationMs ?? 0,
        averageUploadSpeedMbps: failedTiming?.averageUploadSpeedMbps ?? 0,
        abortedAt: wasAborted ? `upload_primary (errorKind=${errorKind ?? "unknown"})` : null,
      });

      console.error("[SPOT PUBLISH] CreateSpotForm catch", {
        requestId,
        rawPublishError,
        failedPhotoIndex,
        errorKind,
        wasAborted,
        caught,
      });

      if (typeof failedPhotoIndex === "number") {
        setError(
          `${t("spotEditor.uploadFailedPhoto", { index: failedPhotoIndex + 1 })} — ${rawPublishError}`
        );
      } else if (errorKind === "no-internet") {
        setError(t("spotEditor.error.noInternet"));
      } else if (errorKind === "timeout" || errorKind === "stalled" || wasAborted) {
        setError(t("spotEditor.error.timeout"));
      } else if (errorKind === "auth") {
        setError(t("spotEditor.error.authExpired"));
      } else if (errorKind === "file-too-large") {
        setError(t("spotEditor.error.fileTooLarge"));
      } else if (errorKind === "network" || (isLikelyNetworkError(caught) && !rawPublishError.includes("[SPOT PUBLISH]"))) {
        setError(`${t("spotEditor.error.uploadFailed")} — ${rawPublishError}`);
      } else {
        // Debug: show the real storage/database error, not a generic localized fallback.
        setError(rawPublishError);
      }
    } finally {
      wakeLock.release();
      stopWatchingEnvironment();
      logUploadLifecycleEvent("publish-attempt-finished", { requestId });

      if (uploadAbortControllerRef.current === controller) {
        uploadAbortControllerRef.current = null;
      }

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
        destination={publishDestination}
        caption={caption}
        locationLabel={shortLocationLabel}
        publishing={publishing}
        uploadProgress={uploadProgress}
        uploadFailed={uploadFailed}
        retryLabel={
          retryStatus ? t("spotEditor.retrying", { attempt: retryStatus.attempt, max: retryStatus.maxAttempts }) : null
        }
        offlineMode={offlineMode}
        error={error}
        onCaptionChange={setCaption}
        onDestinationChange={setPublishDestination}
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
      onCapture={(file, mediaType, captureLocation, nativeWebPath, nativeFilePath, nativeFileSizeBytes) => {
        void handleCameraCapture(
          file,
          mediaType,
          captureLocation,
          nativeWebPath,
          nativeFilePath,
          nativeFileSizeBytes
        );
      }}
    />,
    document.body
  );
}
