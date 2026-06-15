"use client";

import { ArrowLeft, Loader2 } from "lucide-react";
import CollectionPicker from "@/components/CollectionPicker";
import SpotCameraV2Banner from "@/components/SpotCameraV2Banner";
import SpotLocationPicker, { type SpotLocationSourceKind } from "@/components/SpotLocationPicker";
import type { CollectionWithMeta } from "@/lib/collections";
import type { MediaEditorItem } from "@/lib/mediaEditor";
import type { PlaceSearchResult, SpotGeoLocation } from "@/lib/spotLocation";

type SpotCapturePreviewScreenProps = {
  item: MediaEditorItem;
  spotName: string;
  collections: CollectionWithMeta[];
  collectionId: string;
  collectionsLoading?: boolean;
  locating: boolean;
  location: SpotGeoLocation | null;
  locationSource: SpotLocationSourceKind;
  matchedPlaceName: string | null;
  needsLocationChoice: boolean;
  locationHint: string | null;
  publishing: boolean;
  publishStatusMessage: string | null;
  offlineMode?: boolean;
  error: string | null;
  onSpotNameChange: (value: string) => void;
  onCollectionChange: (collectionId: string) => void;
  onUseCurrentLocation: () => void;
  onSelectPlace: (place: PlaceSearchResult) => void;
  onDismiss: () => void;
  onRetake: () => void;
  onPublish: () => void;
};

export default function SpotCapturePreviewScreen({
  item,
  spotName,
  collections,
  collectionId,
  collectionsLoading = false,
  locating,
  location,
  locationSource,
  matchedPlaceName,
  needsLocationChoice,
  locationHint,
  publishing,
  publishStatusMessage,
  offlineMode = false,
  error,
  onSpotNameChange,
  onCollectionChange,
  onUseCurrentLocation,
  onSelectPlace,
  onDismiss,
  onRetake,
  onPublish,
}: SpotCapturePreviewScreenProps) {
  const publishDisableReason = publishing
    ? offlineMode
      ? "Saving offline draft…"
      : "Publishing spot…"
    : offlineMode
      ? null
      : publishStatusMessage;
  const publishBlocked = publishDisableReason !== null;

  return (
    <div className="fixed inset-0 z-[130] flex min-h-[100dvh] flex-col bg-background text-white select-none">
      <SpotCameraV2Banner />

      {publishing ? (
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/85 px-6">
          <Loader2 className="h-9 w-9 animate-spin text-white" aria-hidden />
          <p className="text-sm font-medium text-white">Publishing spot…</p>
        </div>
      ) : null}

      <header className="relative z-30 flex shrink-0 items-center justify-between px-3 py-3 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onDismiss}
          disabled={publishing}
          className="rounded-full p-2 text-white hover:bg-white/10 disabled:opacity-50"
          aria-label="Save draft and close"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </button>
        <p className="text-sm font-semibold text-white">New Spot</p>
        <span className="w-9" aria-hidden />
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="shrink-0 px-4">
          <div className="relative mx-auto max-w-md overflow-hidden rounded-2xl bg-neutral-950">
            <img src={item.previewUrl} alt="" className="aspect-[4/5] w-full object-cover" />
          </div>
        </div>

        <div className="mx-auto w-full max-w-md flex-1 space-y-3 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <SpotLocationPicker
            locating={locating}
            location={location}
            locationSource={locationSource}
            matchedPlaceName={matchedPlaceName}
            needsLocationChoice={needsLocationChoice}
            locationHint={locationHint}
            disabled={publishing}
            onUseCurrentLocation={onUseCurrentLocation}
            onSelectPlace={onSelectPlace}
          />

          <input
            value={spotName}
            onChange={(event) => onSpotNameChange(event.target.value)}
            placeholder="Name this spot…"
            maxLength={120}
            disabled={publishing}
            className="sd-input"
          />

          <CollectionPicker
            collections={collections}
            value={collectionId}
            onChange={onCollectionChange}
            disabled={publishing}
            loading={collectionsLoading}
          />

          <p className="text-center text-[11px] text-muted">
            Spots are always public for place discovery on the map and feed.
          </p>

          {offlineMode ? (
            <p className="rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 text-center text-sm text-white">
              Saved locally on this device. Upload when you&apos;re back online.
            </p>
          ) : null}

          {error ? <p className="text-center text-sm text-red-400">{error}</p> : null}
          {publishDisableReason ? (
            <p className="text-center text-sm text-amber-200/90">{publishDisableReason}</p>
          ) : null}

          <button
            type="button"
            onClick={onRetake}
            disabled={publishing}
            className="w-full rounded-xl border border-white/15 py-3 text-sm font-semibold text-white transition hover:bg-white/5 disabled:opacity-50"
          >
            Retake
          </button>

          <button
            type="button"
            onClick={() => {
              if (publishBlocked) {
                return;
              }
              onPublish();
            }}
            aria-disabled={publishBlocked}
            className={`w-full rounded-xl py-3.5 text-sm font-semibold transition ${
              publishBlocked
                ? "cursor-not-allowed bg-primary/35 text-background/50"
                : "bg-primary text-background hover:brightness-110"
            }`}
          >
            {publishing
              ? offlineMode
                ? "Saving…"
                : "Publishing…"
              : offlineMode
                ? "Save offline draft"
                : "Publish"}
          </button>
        </div>
      </div>
    </div>
  );
}
