"use client";

import { useState } from "react";
import { ArrowLeft, ChevronRight, Globe, Lock, MapPin } from "lucide-react";
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
  const [showLocationPicker, setShowLocationPicker] = useState(false);

  const publishDisableReason = publishing
    ? offlineMode ? "Saving offline draft…" : "Publishing spot…"
    : offlineMode ? null : publishStatusMessage;
  const publishBlocked = publishDisableReason !== null;

  // First private collection is "My Spots"; fall back to first collection.
  const mySpotsCollection =
    collections.find((c) => c.visibility === "private") ?? collections[0] ?? null;

  const locationLabel = locating
    ? "Locating…"
    : location
      ? (location.city ?? location.country ?? `${location.latitude.toFixed(3)}, ${location.longitude.toFixed(3)}`)
      : null;

  return (
    <div
      className="fixed inset-0 z-[130] bg-black text-white select-none overflow-hidden"
      style={{ WebkitTapHighlightColor: "transparent" }}
    >
      {publishing ? (
        <div className="pointer-events-none absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/85 px-6">
          <p className="text-sm font-medium text-white">
            {offlineMode ? "Saving draft…" : "Publishing spot…"}
          </p>
        </div>
      ) : null}

      {/* ── Fullscreen photo ── */}
      <img
        src={item.previewUrl}
        alt=""
        className="absolute inset-0 z-0 h-full w-full object-cover"
        draggable={false}
      />

      {/* ── Gradient overlays ── */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-40 bg-gradient-to-b from-black/65 to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-80 bg-gradient-to-t from-black/90 via-black/50 to-transparent"
      />

      {/* ── Top controls ── */}
      <div
        className="absolute inset-x-0 top-0 z-30 flex items-start justify-between px-3"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <button
          type="button"
          onClick={onDismiss}
          disabled={publishing}
          className="mt-2.5 flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm disabled:opacity-50"
          aria-label="Save draft and go back"
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={2} aria-hidden />
        </button>

        <button
          type="button"
          onClick={onRetake}
          disabled={publishing}
          className="mt-2.5 rounded-full bg-black/45 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm disabled:opacity-50"
        >
          Retake
        </button>
      </div>

      {/* ── Bottom overlay ── */}
      <div
        className="absolute inset-x-0 bottom-0 z-30 flex flex-col gap-2 px-3 pb-3"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        {/* Location picker (expanded) */}
        {showLocationPicker ? (
          <div className="rounded-2xl bg-black/60 p-3 backdrop-blur-md ring-1 ring-white/10">
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
            <button
              type="button"
              onClick={() => setShowLocationPicker(false)}
              className="mt-2 w-full text-center text-xs text-white/50"
            >
              Close
            </button>
          </div>
        ) : null}

        {/* Location badge + caption row */}
        <div className="flex items-center gap-2">
          {locationLabel ? (
            <button
              type="button"
              onClick={() => setShowLocationPicker((v) => !v)}
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5 text-xs font-medium text-white/90 backdrop-blur-sm ring-1 ring-white/15"
            >
              <MapPin className="h-3 w-3 shrink-0 text-primary" aria-hidden />
              <span className="max-w-[120px] truncate">{locationLabel}</span>
            </button>
          ) : null}

          <input
            value={spotName}
            onChange={(e) => onSpotNameChange(e.target.value)}
            placeholder="Add a caption…"
            maxLength={120}
            disabled={publishing}
            className="min-w-0 flex-1 rounded-full bg-black/50 px-4 py-1.5 text-sm text-white placeholder-white/40 backdrop-blur-sm ring-1 ring-white/15 focus:outline-none focus:ring-white/40 disabled:opacity-50"
          />
        </div>

        {/* Public / My Spots toggle */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onCollectionChange("")}
            disabled={publishing}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-2xl py-3 text-sm font-semibold transition disabled:opacity-50 ${
              collectionId === ""
                ? "bg-white text-black shadow-lg"
                : "bg-white/10 text-white ring-1 ring-white/20 backdrop-blur-sm"
            }`}
          >
            <Globe className="h-4 w-4" aria-hidden />
            Public Spot
          </button>

          <button
            type="button"
            onClick={() => {
              if (mySpotsCollection) onCollectionChange(mySpotsCollection.id);
            }}
            disabled={publishing || !mySpotsCollection}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-2xl py-3 text-sm font-semibold transition disabled:opacity-50 ${
              collectionId !== ""
                ? "bg-white text-black shadow-lg"
                : "bg-white/10 text-white ring-1 ring-white/20 backdrop-blur-sm"
            }`}
          >
            <Lock className="h-4 w-4" aria-hidden />
            My Spots
          </button>
        </div>

        {/* Status messages */}
        {offlineMode ? (
          <p className="text-center text-xs text-white/55">
            Saved locally · will upload when online
          </p>
        ) : null}
        {error ? (
          <p className="text-center text-xs text-red-400">{error}</p>
        ) : null}
        {!error && publishDisableReason ? (
          <p className="text-center text-xs text-amber-200/80">{publishDisableReason}</p>
        ) : null}

        {/* Publish button */}
        <button
          type="button"
          onClick={() => { if (!publishBlocked) onPublish(); }}
          aria-disabled={publishBlocked}
          className={`flex w-full items-center justify-center gap-1.5 rounded-2xl py-3.5 text-sm font-bold tracking-wide transition ${
            publishBlocked
              ? "cursor-not-allowed bg-white/15 text-white/35"
              : "bg-primary text-background hover:brightness-110 active:scale-[0.98]"
          }`}
        >
          {publishing
            ? offlineMode ? "Saving…" : "Publishing…"
            : offlineMode ? "Save offline draft" : "Share Spot"}
          {!publishing ? <ChevronRight className="h-4 w-4" aria-hidden /> : null}
        </button>
      </div>
    </div>
  );
}
