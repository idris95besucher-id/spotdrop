"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, Minus, Plus, Radio } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import LiveMapUserSheet from "@/components/LiveMapUserSheet";
import MapMarkClusterSheet from "@/components/MapMarkClusterSheet";
import MapMarkCreateSheet from "@/components/MapMarkCreateSheet";
import MapMarkDetailSheet from "@/components/MapMarkDetailSheet";
import MapOverlapActionSheet from "@/components/MapOverlapActionSheet";
import MapPlacesSearch from "@/components/MapPlacesSearch";
import MapTapActionSheet, { type MapTapAction } from "@/components/MapTapActionSheet";
import ShareMapPlaceSheet from "@/components/ShareMapPlaceSheet";
import SpotMapPinSheet from "@/components/SpotMapPinSheet";
import { openExternalMapsDirections } from "@/lib/externalMaps";
import { geoLocationToMapPlaceSharePayload } from "@/lib/mapPlaceShare";
import { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM, getMapLibreStyleUrl } from "@/lib/mapLibre";
import {
  buildMixedMapOverlapClusters,
  buildSpiderfyLngLats,
  MAP_MARKER_OVERLAP_THRESHOLD_PX,
  shouldSpiderfyOverlapClusters,
  type MapOverlapCluster,
} from "@/lib/mapMarkerOverlap";
import {
  buildMapMarkClusters,
  buildMapMarkSpiderfyLngLats,
  MAP_MARK_SPEECH_BUBBLE_SVG,
  mapMarkAvatarInitial,
  shouldSpiderfyMapMarkClusters,
  type MapMarkCluster,
} from "@/lib/mapMarkMarkers";
import {
  bindMapMarkerTapShield,
  isMapInteractiveMarkerTarget,
} from "@/lib/mapMarkerTapGuard";
import {
  mapPlaceZoomForKind,
  type MapPlaceSearchResult,
} from "@/lib/mapPlacesSearch";
import { isMapMarkExpired, loadMapMarkById, loadMapMarks, type MapMark } from "@/lib/mapMarks";
import { MAP_SPOT_PUBLISHED_EVENT } from "@/lib/mapSpotEvents";
import { getMapSpotPinPreviewUrl, getMapSpotPinTitle, resolveSpotMapLngLat } from "@/lib/mapSpotPin";
import { resolveMapLngLat } from "@/lib/mapMarkerCoords";
import { spotLocationFromCoordinates, type SpotGeoLocation } from "@/lib/spotLocation";
import { loadMapSpotPins, loadSavedMapSpotPinIds, type MapSpotPin } from "@/lib/spots";
import { supabase } from "@/lib/supabaseClient";
import { publicProfileUsername } from "@/lib/publicProfile";
import {
  fetchLiveMapUsers,
  filterOnlineLiveMapUsers,
  LIVE_LOCATION_ERROR,
  LIVE_LOCATION_PUSH_MS,
  stopUserLiveLocation,
  upsertUserLiveLocation,
  validateLiveCoordinates,
  type LiveMapUser,
} from "@/lib/userLiveLocation";
import { usePresenceOnlineIds } from "@/lib/usePresenceOnlineIds";
import { localizeError } from "@/lib/i18n/localizeError";
import type { TranslationKey } from "@/lib/i18n/messages";
import "maplibre-gl/dist/maplibre-gl.css";

type SpotLiveMapProps = {
  userId: string | null;
  embedded?: boolean;
  /** Deep-link focus: /visit?tab=map&mark=<id> */
  focusMarkId?: string | null;
  /** Deep-link focus: /visit?tab=map&lat=<lat>&lng=<lng>&place=<name> */
  focusPlaceCoords?: {
    latitude: number;
    longitude: number;
    name?: string | null;
  } | null;
};

type UserCoords = {
  latitude: number;
  longitude: number;
};

const LIVE_USERS_REFRESH_MS = 30_000;
const PLACE_BOUNDARY_SOURCE = "map-place-boundary";
const PLACE_BOUNDARY_FILL = "map-place-boundary-fill";
const PLACE_BOUNDARY_LINE = "map-place-boundary-line";
const SPOT_PIN_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21.5s-5.4-4.85-5.4-9.85a5.4 5.4 0 1 1 10.8 0c0 5-5.4 9.85-5.4 9.85z"/><circle cx="12" cy="11.35" r="2.1"/><circle cx="12" cy="11.35" r="0.85" fill="currentColor" stroke="none"/></svg>`;

function clearMapPlaceHighlight(
  map: import("maplibre-gl").Map | null,
  searchMarker: import("maplibre-gl").Marker | null
) {
  if (map) {
    if (map.getLayer(PLACE_BOUNDARY_FILL)) {
      map.removeLayer(PLACE_BOUNDARY_FILL);
    }

    if (map.getLayer(PLACE_BOUNDARY_LINE)) {
      map.removeLayer(PLACE_BOUNDARY_LINE);
    }

    if (map.getSource(PLACE_BOUNDARY_SOURCE)) {
      map.removeSource(PLACE_BOUNDARY_SOURCE);
    }
  }

  searchMarker?.remove();
}

function showMapPlaceBoundary(map: import("maplibre-gl").Map, geometry: GeoJSON.Geometry) {
  if (map.getLayer(PLACE_BOUNDARY_FILL)) {
    map.removeLayer(PLACE_BOUNDARY_FILL);
  }

  if (map.getLayer(PLACE_BOUNDARY_LINE)) {
    map.removeLayer(PLACE_BOUNDARY_LINE);
  }

  if (map.getSource(PLACE_BOUNDARY_SOURCE)) {
    map.removeSource(PLACE_BOUNDARY_SOURCE);
  }

  map.addSource(PLACE_BOUNDARY_SOURCE, {
    type: "geojson",
    data: {
      type: "Feature",
      properties: {},
      geometry,
    },
  });

  map.addLayer({
    id: PLACE_BOUNDARY_FILL,
    type: "fill",
    source: PLACE_BOUNDARY_SOURCE,
    paint: {
      "fill-color": "#22d3ee",
      "fill-opacity": 0.14,
    },
  });

  map.addLayer({
    id: PLACE_BOUNDARY_LINE,
    type: "line",
    source: PLACE_BOUNDARY_SOURCE,
    paint: {
      "line-color": "#22d3ee",
      "line-width": 2,
      "line-opacity": 0.9,
    },
  });
}

/**
 * MapLibre HTML markers use `position:absolute; top:0; left:0` + an inline
 * `transform: translate(...)` on the root element. Any CSS animation/transition
 * that sets `transform` on that same node wipes the geographic placement and
 * pins the marker to the map container's top-left corner.
 *
 * Always pass a plain anchor wrapper to `new maplibregl.Marker({ element })`
 * and keep visual animations / :active scale on an inner child only.
 */
function createMapLibreMarkerAnchor(className: string) {
  const anchor = document.createElement("div");
  anchor.className = className;
  return anchor;
}

function createUserMarkerElement(avatarUrl: string | null, label: string, isSelf = false) {
  const anchor = createMapLibreMarkerAnchor("spot-live-user-marker-anchor");
  const root = document.createElement("div");
  root.className = isSelf ? "spot-live-user-marker spot-live-user-marker--self" : "spot-live-user-marker";
  root.setAttribute("aria-label", label);

  const pulse = document.createElement("span");
  pulse.className = "spot-live-user-marker__pulse";
  root.appendChild(pulse);

  const avatar = document.createElement("div");
  avatar.className = "spot-live-user-marker__avatar";

  if (avatarUrl) {
    const image = document.createElement("img");
    image.src = avatarUrl;
    image.alt = "";
    avatar.appendChild(image);
  } else {
    avatar.textContent = label.charAt(0).toUpperCase();
  }

  root.appendChild(avatar);
  anchor.appendChild(root);
  return anchor;
}

function createLiveUserMarkerElement(
  user: LiveMapUser,
  ariaLabel: string,
  onSelect: (user: LiveMapUser) => void,
  onGuard?: () => void
) {
  const anchor = createMapLibreMarkerAnchor("spot-live-share-marker-anchor");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "spot-live-share-marker";
  button.setAttribute("aria-label", ariaLabel);

  if (user.avatar_url) {
    const image = document.createElement("img");
    image.src = user.avatar_url;
    image.alt = "";
    image.draggable = false;
    button.appendChild(image);
  } else {
    button.textContent = user.username.charAt(0).toUpperCase();
  }

  anchor.appendChild(button);

  bindMapMarkerTapShield(anchor, {
    onGuard,
    onActivate: () => onSelect(user),
  });

  return anchor;
}

function createSpotMarkerElement(
  pin: MapSpotPin,
  isSaved: boolean,
  animateIn = false,
  onSelect?: (pin: MapSpotPin) => void,
  onGuard?: () => void
) {
  const anchor = createMapLibreMarkerAnchor("spot-live-spot-marker-anchor");

  const button = document.createElement("button");
  button.type = "button";
  button.className = [
    "spot-live-spot-marker",
    animateIn ? "spot-live-spot-marker--appear" : "",
    isSaved ? "spot-live-spot-marker--saved" : "",
  ]
    .filter(Boolean)
    .join(" ");
  button.setAttribute("aria-label", getMapSpotPinTitle(pin));

  const previewUrl = getMapSpotPinPreviewUrl(pin);

  if (previewUrl) {
    const image = document.createElement("img");
    image.src = previewUrl;
    image.alt = "";
    image.loading = "lazy";
    image.draggable = false;
    button.appendChild(image);
  } else {
    const icon = document.createElement("span");
    icon.className = "spot-live-spot-marker__icon";
    icon.innerHTML = SPOT_PIN_SVG;
    button.appendChild(icon);
  }

  anchor.appendChild(button);

  if (onSelect) {
    bindMapMarkerTapShield(anchor, {
      onGuard,
      onActivate: () => onSelect(pin),
    });
  }

  return anchor;
}

function createCombinedOverlapMarkerElement(
  clusterId: string,
  cluster: MapOverlapCluster,
  ariaLabel: string,
  onSelect: (clusterId: string) => void,
  onGuard?: () => void
) {
  const anchor = createMapLibreMarkerAnchor("spot-map-overlap-marker-anchor");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "spot-map-overlap-marker spot-map-overlap-marker--appear";
  button.dataset.overlapClusterId = clusterId;
  button.setAttribute("aria-label", ariaLabel);

  const ring = document.createElement("span");
  ring.className = "spot-map-overlap-marker__ring";
  ring.setAttribute("aria-hidden", "true");
  button.appendChild(ring);

  const primarySpot = cluster.spots[0] ?? null;
  const primaryUser = cluster.users[0] ?? null;
  const spotPreview = primarySpot ? getMapSpotPinPreviewUrl(primarySpot) : null;
  const faceUrl = spotPreview || primaryUser?.avatar_url || null;

  const face = document.createElement("span");
  face.className = "spot-map-overlap-marker__face";

  if (faceUrl) {
    const image = document.createElement("img");
    image.src = faceUrl;
    image.alt = "";
    image.loading = "lazy";
    image.draggable = false;
    face.appendChild(image);
  } else {
    const fallback = document.createElement("span");
    fallback.className = "spot-map-overlap-marker__face-fallback";
    fallback.textContent = (primaryUser?.username || "S").charAt(0).toUpperCase();
    face.appendChild(fallback);
  }

  button.appendChild(face);

  if (primaryUser) {
    const userBadge = document.createElement("span");
    userBadge.className = "spot-map-overlap-marker__badge spot-map-overlap-marker__badge--user";
    userBadge.setAttribute("aria-hidden", "true");

    if (primaryUser.avatar_url) {
      const badgeImage = document.createElement("img");
      badgeImage.src = primaryUser.avatar_url;
      badgeImage.alt = "";
      badgeImage.draggable = false;
      userBadge.appendChild(badgeImage);
    } else {
      userBadge.textContent = primaryUser.username.charAt(0).toUpperCase();
      userBadge.style.fontSize = "9px";
      userBadge.style.fontWeight = "700";
      userBadge.style.color = "#fff";
    }

    button.appendChild(userBadge);
  }

  if (primarySpot && (!spotPreview || faceUrl === primaryUser?.avatar_url)) {
    const spotBadge = document.createElement("span");
    spotBadge.className = "spot-map-overlap-marker__badge spot-map-overlap-marker__badge--spot";
    spotBadge.setAttribute("aria-hidden", "true");
    spotBadge.innerHTML = SPOT_PIN_SVG;
    button.appendChild(spotBadge);
  }

  const total = cluster.users.length + cluster.spots.length;

  if (total > 2) {
    const count = document.createElement("span");
    count.className = "spot-map-overlap-marker__count";
    count.textContent = String(total);
    button.appendChild(count);
  }

  anchor.appendChild(button);

  bindMapMarkerTapShield(anchor, {
    onGuard,
    onActivate: () => onSelect(clusterId),
  });

  return anchor;
}

function updateSpotMarkerSavedState(anchor: HTMLElement, isSaved: boolean) {
  const button = anchor.querySelector(".spot-live-spot-marker");
  button?.classList.toggle("spot-live-spot-marker--saved", isSaved);
}

function createMapTapPinMarkerElement() {
  const anchor = createMapLibreMarkerAnchor("spot-map-tap-pin-marker-anchor");
  const root = document.createElement("div");
  root.className = "spot-map-tap-pin-marker";
  root.setAttribute("aria-hidden", "true");
  root.innerHTML = SPOT_PIN_SVG;
  anchor.appendChild(root);
  return anchor;
}

function createPublicMapMarkElement(
  mark: MapMark,
  onSelect: (markId: string) => void,
  onGuard?: () => void
) {
  const anchor = createMapLibreMarkerAnchor("spot-map-public-mark-anchor");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "spot-map-public-mark";
  button.dataset.markId = mark.id;
  button.setAttribute(
    "aria-label",
    mark.text.slice(0, 80) || mark.place_name || `@${mark.username}`
  );

  const avatar = document.createElement("span");
  avatar.className = "spot-map-public-mark__avatar";

  if (mark.avatar_url) {
    const image = document.createElement("img");
    image.src = mark.avatar_url;
    image.alt = "";
    image.loading = "lazy";
    image.draggable = false;
    avatar.appendChild(image);
  } else {
    avatar.textContent = mapMarkAvatarInitial(mark.username);
  }

  button.appendChild(avatar);

  const badge = document.createElement("span");
  badge.className = "spot-map-public-mark__badge";
  badge.setAttribute("aria-hidden", "true");
  badge.innerHTML = MAP_MARK_SPEECH_BUBBLE_SVG;
  button.appendChild(badge);

  anchor.appendChild(button);

  bindMapMarkerTapShield(anchor, {
    onGuard,
    onActivate: () => onSelect(mark.id),
  });

  return anchor;
}

function createPublicMapMarkClusterElement(
  cluster: MapMarkCluster,
  onSelect: (clusterId: string) => void,
  onGuard?: () => void
) {
  const anchor = createMapLibreMarkerAnchor("spot-map-public-mark-cluster-anchor");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "spot-map-public-mark-cluster";
  button.dataset.markClusterId = cluster.id;
  button.setAttribute("aria-label", `${cluster.marks.length} marks`);

  const stack = document.createElement("span");
  stack.className = "spot-map-public-mark-cluster__stack";

  const previewMarks = cluster.marks.slice(0, 3);

  previewMarks.forEach((mark, index) => {
    const avatar = document.createElement("span");
    avatar.className = "spot-map-public-mark-cluster__avatar";
    avatar.style.left = `${index * 12}px`;
    avatar.style.zIndex = String(previewMarks.length - index);

    if (mark.avatar_url) {
      const image = document.createElement("img");
      image.src = mark.avatar_url;
      image.alt = "";
      image.loading = "lazy";
      image.draggable = false;
      avatar.appendChild(image);
    } else {
      avatar.textContent = mapMarkAvatarInitial(mark.username);
    }

    stack.appendChild(avatar);
  });

  button.appendChild(stack);

  const badge = document.createElement("span");
  badge.className = "spot-map-public-mark-cluster__badge";
  badge.setAttribute("aria-hidden", "true");
  badge.innerHTML = MAP_MARK_SPEECH_BUBBLE_SVG;
  button.appendChild(badge);

  const count = document.createElement("span");
  count.className = "spot-map-public-mark-cluster__count";
  count.textContent = String(cluster.marks.length);
  button.appendChild(count);

  anchor.appendChild(button);

  bindMapMarkerTapShield(anchor, {
    onGuard,
    onActivate: () => onSelect(cluster.id),
  });

  return anchor;
}

function formatLiveLocationError(t: (key: TranslationKey) => string, error: string | null) {
  if (!error) {
    return null;
  }

  if (error === LIVE_LOCATION_ERROR.NOT_AUTHENTICATED) {
    return t("map.error.notLoggedIn");
  }

  if (error === LIVE_LOCATION_ERROR.LOAD_FAILED) {
    return t("map.error.loadFailed");
  }

  if (error === LIVE_LOCATION_ERROR.TABLE_MISSING) {
    return t("map.error.tableMissing");
  }

  if (error === LIVE_LOCATION_ERROR.INVALID_COORDS) {
    return t("map.error.invalidCoords");
  }

  return t("map.error.loadFailed");
}

export default function SpotLiveMap({
  userId,
  embedded = false,
  focusMarkId = null,
  focusPlaceCoords = null,
}: SpotLiveMapProps) {
  const { t, locale } = useI18n();
  const { presenceOnlineIds, freshnessTick } = usePresenceOnlineIds();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const maplibreRef = useRef<typeof import("maplibre-gl") | null>(null);
  const liveMarkersRef = useRef<Map<string, import("maplibre-gl").Marker>>(new Map());
  const spotMarkersRef = useRef<Map<string, import("maplibre-gl").Marker>>(new Map());
  const combinedOverlapMarkersRef = useRef<Map<string, import("maplibre-gl").Marker>>(new Map());
  const spiderMarkersRef = useRef<Map<string, import("maplibre-gl").Marker>>(new Map());
  const publicMarkMarkersRef = useRef<Map<string, import("maplibre-gl").Marker>>(new Map());
  const publicMarkClusterMarkersRef = useRef<Map<string, import("maplibre-gl").Marker>>(new Map());
  const publicMarkSpiderMarkersRef = useRef<Map<string, import("maplibre-gl").Marker>>(new Map());
  const mapMarksByIdRef = useRef<Map<string, MapMark>>(new Map());
  const mapMarkClustersByIdRef = useRef<Map<string, MapMarkCluster>>(new Map());
  const seenSpotPinIdsRef = useRef<Set<string>>(new Set());
  const userMarkerRef = useRef<import("maplibre-gl").Marker | null>(null);
  const tapMarkerRef = useRef<import("maplibre-gl").Marker | null>(null);
  const searchMarkerRef = useRef<import("maplibre-gl").Marker | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const pushIntervalRef = useRef<number | null>(null);
  const centeredOnUserRef = useRef(false);
  const isLiveRef = useRef(false);
  const livePushSessionRef = useRef(0);
  const latestCoordsRef = useRef<UserCoords | null>(null);
  const selectedPinRef = useRef<MapSpotPin | null>(null);
  const selectedLiveUserRef = useRef<LiveMapUser | null>(null);
  const selectedMapMarkRef = useRef<MapMark | null>(null);
  const markClusterSheetRef = useRef<MapMarkCluster | null>(null);
  const overlapSheetRef = useRef<MapOverlapCluster | null>(null);
  const overlapClustersByIdRef = useRef<Map<string, MapOverlapCluster>>(new Map());
  const handleMapTapRef = useRef<(latitude: number, longitude: number) => void>(() => {});
  const mapTapRequestRef = useRef(0);
  /** Ignore map background tap until this timestamp (marker just handled the gesture). */
  const markerTapGuardUntilRef = useRef(0);

  const armMarkerTapGuard = useCallback(() => {
    markerTapGuardUntilRef.current = Date.now() + 450;
  }, []);

  const shouldIgnoreMapBackgroundTap = useCallback((originalEvent?: Event | null) => {
    if (Date.now() < markerTapGuardUntilRef.current) {
      return true;
    }

    const target =
      originalEvent && "target" in originalEvent
        ? (originalEvent as Event).target
        : null;

    return isMapInteractiveMarkerTarget(target);
  }, []);

  const [userCoords, setUserCoords] = useState<UserCoords | null>(null);
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);
  const [userLabel, setUserLabel] = useState("");
  const [pins, setPins] = useState<MapSpotPin[]>([]);
  const [liveUsers, setLiveUsers] = useState<LiveMapUser[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [markerLayoutTick, setMarkerLayoutTick] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [mapLoadError, setMapLoadError] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [selectedPin, setSelectedPin] = useState<MapSpotPin | null>(null);
  const [selectedLiveUser, setSelectedLiveUser] = useState<LiveMapUser | null>(null);
  const [overlapSheet, setOverlapSheet] = useState<MapOverlapCluster | null>(null);
  const [tapSave, setTapSave] = useState<{
    location: SpotGeoLocation;
    resolving: boolean;
  } | null>(null);
  const [tapActionBusy, setTapActionBusy] = useState<MapTapAction | null>(null);
  const [sharePlaceOpen, setSharePlaceOpen] = useState(false);
  const [mapMarks, setMapMarks] = useState<MapMark[]>([]);
  const [selectedMapMark, setSelectedMapMark] = useState<MapMark | null>(null);
  const [markClusterSheet, setMarkClusterSheet] = useState<MapMarkCluster | null>(null);
  const [markCreateLocation, setMarkCreateLocation] = useState<{
    location: SpotGeoLocation;
    placeLabel: string;
  } | null>(null);
  const [locating, setLocating] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [goingLive, setGoingLive] = useState(false);
  const [liveSuccess, setLiveSuccess] = useState<string | null>(null);

  const onlineLiveUsers = useMemo(
    () => filterOnlineLiveMapUsers(liveUsers, presenceOnlineIds, "map-live"),
    [freshnessTick, liveUsers, presenceOnlineIds]
  );

  const mapStyle = getMapLibreStyleUrl();

  useEffect(() => {
    selectedPinRef.current = selectedPin;
  }, [selectedPin]);

  useEffect(() => {
    selectedLiveUserRef.current = selectedLiveUser;
  }, [selectedLiveUser]);

  useEffect(() => {
    selectedMapMarkRef.current = selectedMapMark;
  }, [selectedMapMark]);

  useEffect(() => {
    markClusterSheetRef.current = markClusterSheet;
  }, [markClusterSheet]);

  useEffect(() => {
    overlapSheetRef.current = overlapSheet;
  }, [overlapSheet]);

  const clearOverlapSheet = useCallback(() => {
    setOverlapSheet(null);
  }, []);

  const clearTapSave = useCallback(() => {
    setTapActionBusy(null);
    setTapSave(null);
  }, []);

  const clearPlaceSearchHighlight = useCallback(() => {
    clearMapPlaceHighlight(mapRef.current, searchMarkerRef.current);
    searchMarkerRef.current = null;
  }, []);

  const handleSelectPlace = useCallback(
    (place: MapPlaceSearchResult) => {
      const map = mapRef.current;
      const maplibregl = maplibreRef.current;

      if (!map || !maplibregl) {
        return;
      }

      setSelectedPin(null);
      setSelectedLiveUser(null);
      setOverlapSheet(null);
      setSelectedMapMark(null);
      setMarkClusterSheet(null);
      clearTapSave();
      clearPlaceSearchHighlight();

      const isArea = place.kind === "city" || place.kind === "country";
      const hasBoundary = Boolean(place.geometry);
      const hasBounds = Boolean(place.bounds);

      if (isArea && hasBoundary && place.geometry) {
        showMapPlaceBoundary(map, place.geometry);
      }

      if (isArea && hasBounds && place.bounds) {
        const [west, south, east, north] = place.bounds;
        map.fitBounds(
          [
            [west, south],
            [east, north],
          ],
          {
            padding: { top: 96, bottom: 140, left: 40, right: 40 },
            duration: 1100,
            essential: true,
            maxZoom: place.kind === "country" ? 7 : 13.5,
          }
        );
        return;
      }

      if (isArea && hasBoundary && place.geometry) {
        map.flyTo({
          center: [place.longitude, place.latitude],
          zoom: mapPlaceZoomForKind(place.kind),
          duration: 1100,
          essential: true,
        });
        return;
      }

      const placeLngLat = resolveMapLngLat(place.latitude, place.longitude, {
        kind: "search-place",
        id: place.id,
      });

      if (!placeLngLat) {
        return;
      }

      const element = createMapTapPinMarkerElement();
      searchMarkerRef.current = new maplibregl.Marker({ element, anchor: "bottom" })
        .setLngLat(placeLngLat)
        .addTo(map);

      map.flyTo({
        center: placeLngLat,
        zoom: mapPlaceZoomForKind(place.kind),
        duration: 1100,
        essential: true,
      });
    },
    [clearPlaceSearchHighlight, clearTapSave]
  );

  const handleMapTap = useCallback(async (latitude: number, longitude: number) => {
    const requestId = mapTapRequestRef.current + 1;
    mapTapRequestRef.current = requestId;

    clearPlaceSearchHighlight();

    const preliminary: SpotGeoLocation = {
      latitude,
      longitude,
      address: null,
      city: null,
      country: null,
    };

    setTapSave({ location: preliminary, resolving: true });

    const resolved = await spotLocationFromCoordinates(latitude, longitude);

    if (mapTapRequestRef.current !== requestId) {
      return;
    }

    setTapSave({ location: resolved, resolving: false });
  }, [clearPlaceSearchHighlight]);

  useEffect(() => {
    handleMapTapRef.current = handleMapTap;
  }, [handleMapTap]);

  const handleTapAction = useCallback(
    async (action: MapTapAction) => {
      if (!tapSave) {
        return;
      }

      if (action === "cancel") {
        clearTapSave();
        return;
      }

      if (tapSave.resolving || tapActionBusy) {
        if (action !== "share") {
          return;
        }
      }

      const location = tapSave.location;
      const placeLabel =
        location.address?.trim() ||
        [location.city, location.country].filter(Boolean).join(", ") ||
        t("map.selectedLocation");

      if (action === "directions") {
        clearTapSave();
        openExternalMapsDirections(location.latitude, location.longitude, placeLabel);
        return;
      }

      if (action === "share") {
        setSharePlaceOpen(true);
        return;
      }

      if (!userId) {
        setLiveError(t("map.error.notLoggedIn"));
        clearTapSave();
        return;
      }

      if (action === "mark") {
        clearTapSave();
        setMarkCreateLocation({ location, placeLabel });
      }
    },
    [clearTapSave, t, tapActionBusy, tapSave, userId]
  );

  useEffect(() => {
    isLiveRef.current = isLive;
  }, [isLive]);

  useEffect(() => {
    if (!liveSuccess) {
      return;
    }

    const timeoutId = window.setTimeout(() => setLiveSuccess(null), 3000);
    return () => window.clearTimeout(timeoutId);
  }, [liveSuccess]);

  useEffect(() => {
    latestCoordsRef.current = userCoords;
  }, [userCoords]);

  const pushLiveLocation = useCallback(async (coords: UserCoords, sessionId: number) => {
    if (!isLiveRef.current || sessionId !== livePushSessionRef.current) {
      return;
    }

    const coordError = validateLiveCoordinates(coords.latitude, coords.longitude);

    if (coordError) {
      console.error("[live-location] push skipped: invalid coordinates", {
        latitude: coords.latitude,
        longitude: coords.longitude,
        reason: coordError,
      });
      return;
    }

    const { error: pushError } = await upsertUserLiveLocation({
      latitude: coords.latitude,
      longitude: coords.longitude,
      isLive: true,
    });

    if (!isLiveRef.current || sessionId !== livePushSessionRef.current) {
      return;
    }

    if (pushError) {
      console.error("[live-location] push failed", { reason: pushError, coords });
    }
  }, []);

  const refreshLiveUsers = useCallback(async () => {
    const result = await fetchLiveMapUsers();

    if (result.error) {
      setLiveError(formatLiveLocationError(t, result.error));
      return;
    }

    setLiveUsers(result.users);
  }, [t]);

  useEffect(() => {
    if (!userId) {
      return;
    }

    let cancelled = false;

    void supabase
      .from("profiles")
      .select("username, avatar_url")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) {
          return;
        }

        setUserAvatarUrl((data.avatar_url as string | null) ?? null);
        setUserLabel(publicProfileUsername(data.username));
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const loadMapData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [savedResult, liveUsersResult] = await Promise.all([
      userId ? loadSavedMapSpotPinIds(userId) : Promise.resolve({ ids: [] as string[], error: null }),
      fetchLiveMapUsers(),
    ]);

    setSavedIds(new Set(savedResult.ids));
    setLiveUsers(liveUsersResult.users);
    if (liveUsersResult.error) {
      setLiveError(formatLiveLocationError(t, liveUsersResult.error));
    }
    setError(savedResult.error ?? null);
    setLoading(false);
  }, [t, userId]);

  useEffect(() => {
    void loadMapData();
  }, [loadMapData]);

  // Pins are loaded for whatever area of the map is actually on screen
  // (current viewport bounds), not a fixed radius from the device's last
  // known location — otherwise any public Spot outside that radius (e.g. a
  // Gstaad Spot when the map defaulted to a Bern-centered search) silently
  // never appears, no matter how correctly it was saved. Re-runs on every
  // pan/zoom (`moveend`) so panning to any area loads its real Spots.
  const refreshPinsForViewport = useCallback(async () => {
    const map = mapRef.current;

    if (!map) {
      return;
    }

    const bounds = map.getBounds();
    const spotsResult = await loadMapSpotPins(
      {
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
      },
      200
    );

    if (!spotsResult.error) {
      setPins(spotsResult.pins);
    } else {
      setError(spotsResult.error);
    }
  }, []);

  const refreshPinsForViewportRef = useRef<() => void>(() => {});

  useEffect(() => {
    refreshPinsForViewportRef.current = () => void refreshPinsForViewport();
  }, [refreshPinsForViewport]);

  // One-time, low-accuracy location fix used only to recenter the map on
  // where the device actually is. Independent of "Go Live" (which shares the
  // user's live location with others) — without this, the camera stayed on
  // DEFAULT_MAP_CENTER (Bern) unless "Go Live" was explicitly toggled on.
  useEffect(() => {
    if (!("geolocation" in navigator)) {
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserCoords((current) =>
          current ?? {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          }
        );
      },
      () => {
        // Permission denied or unavailable — the map simply stays on
        // DEFAULT_MAP_CENTER and the viewport-based pin loading still works
        // for wherever the user manually pans to.
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60_000 }
    );
  }, []);

  useEffect(() => {
    void refreshLiveUsers();
    const intervalId = window.setInterval(() => {
      void refreshLiveUsers();
    }, LIVE_USERS_REFRESH_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [refreshLiveUsers]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return;
    }

    let disposed = false;

    const initMap = async () => {
      try {
        const maplibregl = await import("maplibre-gl");
        maplibreRef.current = maplibregl;

        if (disposed || !mapContainerRef.current) {
          return;
        }

        const map = new maplibregl.Map({
          container: mapContainerRef.current,
          style: mapStyle,
          center: DEFAULT_MAP_CENTER,
          zoom: DEFAULT_MAP_ZOOM,
          attributionControl: false,
          pitchWithRotate: false,
          dragRotate: false,
        });

        map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");

        map.on("load", () => {
          map.resize();
          setMapReady(true);
          refreshPinsForViewportRef.current();
        });
        map.on("moveend", () => {
          refreshPinsForViewportRef.current();
        });
        map.on("error", () => setMapLoadError(true));

        let longPressTimer: number | null = null;

        const clearLongPressTimer = () => {
          if (longPressTimer !== null) {
            window.clearTimeout(longPressTimer);
            longPressTimer = null;
          }
        };

        map.on("click", (event) => {
          if (shouldIgnoreMapBackgroundTap(event.originalEvent)) {
            return;
          }

          if (selectedPinRef.current) {
            setSelectedPin(null);
            return;
          }

          if (selectedLiveUserRef.current) {
            setSelectedLiveUser(null);
            return;
          }

          if (overlapSheetRef.current) {
            setOverlapSheet(null);
            return;
          }

          if (selectedMapMarkRef.current) {
            setSelectedMapMark(null);
            return;
          }

          if (markClusterSheetRef.current) {
            setMarkClusterSheet(null);
            return;
          }

          handleMapTapRef.current(event.lngLat.lat, event.lngLat.lng);
        });

        map.on("contextmenu", (event) => {
          event.preventDefault();

          if (shouldIgnoreMapBackgroundTap(event.originalEvent)) {
            return;
          }

          handleMapTapRef.current(event.lngLat.lat, event.lngLat.lng);
        });

        map.on("touchstart", (event) => {
          if (event.originalEvent.touches.length !== 1) {
            return;
          }

          if (shouldIgnoreMapBackgroundTap(event.originalEvent)) {
            clearLongPressTimer();
            return;
          }

          const { lat, lng } = event.lngLat;
          clearLongPressTimer();
          longPressTimer = window.setTimeout(() => {
            longPressTimer = null;

            if (Date.now() < markerTapGuardUntilRef.current) {
              return;
            }

            handleMapTapRef.current(lat, lng);
          }, 550);
        });

        map.on("touchend", clearLongPressTimer);
        map.on("touchmove", clearLongPressTimer);
        map.on("touchcancel", clearLongPressTimer);

        mapRef.current = map;
      } catch {
        setMapLoadError(true);
      }
    };

    void initMap();

    return () => {
      disposed = true;
      liveMarkersRef.current.forEach((marker) => marker.remove());
      liveMarkersRef.current.clear();
      spotMarkersRef.current.forEach((marker) => marker.remove());
      spotMarkersRef.current.clear();
      combinedOverlapMarkersRef.current.forEach((marker) => marker.remove());
      combinedOverlapMarkersRef.current.clear();
      spiderMarkersRef.current.forEach((marker) => marker.remove());
      spiderMarkersRef.current.clear();
      publicMarkMarkersRef.current.forEach((marker) => marker.remove());
      publicMarkMarkersRef.current.clear();
      publicMarkClusterMarkersRef.current.forEach((marker) => marker.remove());
      publicMarkClusterMarkersRef.current.clear();
      publicMarkSpiderMarkersRef.current.forEach((marker) => marker.remove());
      publicMarkSpiderMarkersRef.current.clear();
      seenSpotPinIdsRef.current.clear();
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      tapMarkerRef.current?.remove();
      tapMarkerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [mapStyle, shouldIgnoreMapBackgroundTap]);

  useEffect(() => {
    const container = mapContainerRef.current;
    const map = mapRef.current;

    if (!container || !map || !mapReady) {
      return;
    }

    const resizeMap = () => {
      map.resize();
    };

    resizeMap();

    const observer = new ResizeObserver(resizeMap);
    observer.observe(container);

    window.addEventListener("orientationchange", resizeMap);

    return () => {
      observer.disconnect();
      window.removeEventListener("orientationchange", resizeMap);
    };
  }, [mapReady]);

  const clearLiveTracking = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    if (pushIntervalRef.current != null) {
      window.clearInterval(pushIntervalRef.current);
      pushIntervalRef.current = null;
    }
  }, []);

  const handleStopLive = useCallback(async () => {
    livePushSessionRef.current += 1;
    isLiveRef.current = false;
    clearLiveTracking();
    setIsLive(false);
    setGoingLive(false);
    setLiveError(null);
    setLiveSuccess(t("map.hiddenSuccess"));

    if (userMarkerRef.current) {
      userMarkerRef.current.remove();
      userMarkerRef.current = null;
    }

    if (userId) {
      setLiveUsers((current) => current.filter((liveUser) => liveUser.user_id !== userId));
      await stopUserLiveLocation(latestCoordsRef.current ?? undefined);
    }

    void refreshLiveUsers();
  }, [clearLiveTracking, refreshLiveUsers, t, userId]);

  useEffect(() => {
    const handlePageHide = () => {
      if (isLiveRef.current) {
        void stopUserLiveLocation();
      }
    };

    window.addEventListener("pagehide", handlePageHide);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" && isLiveRef.current) {
        void stopUserLiveLocation();
        setIsLive(false);
        clearLiveTracking();
      }
    });

    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      subscription.unsubscribe();
      clearLiveTracking();
      if (isLiveRef.current) {
        void stopUserLiveLocation();
      }
    };
  }, [clearLiveTracking]);

  const handleGoLive = useCallback(async () => {
    if (goingLive || isLive) {
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLiveError(t("map.error.notLoggedIn"));
      return;
    }

    if (!("geolocation" in navigator)) {
      setLiveError(t("map.error.geolocationUnsupported"));
      return;
    }

    setGoingLive(true);
    setLiveError(null);
    setLiveSuccess(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const next = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };

        console.info("[live-location] geolocation granted", {
          latitude: next.latitude,
          longitude: next.longitude,
          accuracy: position.coords.accuracy,
        });

        setUserCoords(next);
        latestCoordsRef.current = next;

        const { error: pushError } = await upsertUserLiveLocation({
          latitude: next.latitude,
          longitude: next.longitude,
          isLive: true,
        });

        if (pushError) {
          setLiveError(formatLiveLocationError(t, pushError));
          setGoingLive(false);
          return;
        }

        const liveSessionId = livePushSessionRef.current + 1;
        livePushSessionRef.current = liveSessionId;
        isLiveRef.current = true;
        setIsLive(true);
        setGoingLive(false);
        setLiveSuccess(t("map.visibleOnMap"));
        void refreshLiveUsers();

        const map = mapRef.current;
        if (map) {
          map.flyTo({
            center: [next.longitude, next.latitude],
            zoom: Math.max(map.getZoom(), 14),
            essential: true,
          });
        }

        watchIdRef.current = navigator.geolocation.watchPosition(
          (watchPosition) => {
            const coords = {
              latitude: watchPosition.coords.latitude,
              longitude: watchPosition.coords.longitude,
            };
            setUserCoords(coords);
            latestCoordsRef.current = coords;
          },
          () => undefined,
          { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 }
        );

        pushIntervalRef.current = window.setInterval(() => {
          const coords = latestCoordsRef.current;
          if (coords) {
            void pushLiveLocation(coords, liveSessionId);
          }
        }, LIVE_LOCATION_PUSH_MS);
      },
      (geoError) => {
        setGoingLive(false);
        console.error("[live-location] geolocation failed", {
          code: geoError.code,
          message: geoError.message,
        });

        if (geoError.code === geoError.PERMISSION_DENIED) {
          setLiveError(t("map.error.permissionDenied"));
          return;
        }

        setLiveError(t("map.couldNotGetLocation"));
      },
      { enableHighAccuracy: true, timeout: 20_000 }
    );
  }, [goingLive, isLive, pushLiveLocation, refreshLiveUsers, t]);

  // Recenter the camera on the device's real location once, as soon as it's
  // known — independent of "Go Live" (sharing your location with others).
  // Without this the camera stayed on DEFAULT_MAP_CENTER (Bern) forever
  // unless "Go Live" was explicitly toggled on, so a Spot could be loaded
  // correctly and still never be visible because the view never scrolled
  // there.
  useEffect(() => {
    const map = mapRef.current;

    if (!map || !mapReady || !userCoords || centeredOnUserRef.current) {
      return;
    }

    const selfLngLat = resolveMapLngLat(userCoords.latitude, userCoords.longitude, {
      kind: "self-live-user",
    });

    if (!selfLngLat) {
      return;
    }

    centeredOnUserRef.current = true;
    map.flyTo({
      center: selfLngLat,
      zoom: 14,
      essential: true,
    });
  }, [mapReady, userCoords]);

  useEffect(() => {
    const map = mapRef.current;
    const maplibregl = maplibreRef.current;

    if (!map || !maplibregl || !mapReady || !userCoords || !isLive) {
      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
        userMarkerRef.current = null;
      }
      return;
    }

    const selfLngLat = resolveMapLngLat(userCoords.latitude, userCoords.longitude, {
      kind: "self-live-user",
    });

    if (!selfLngLat) {
      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
        userMarkerRef.current = null;
      }
      return;
    }

    if (userMarkerRef.current) {
      userMarkerRef.current.setLngLat(selfLngLat);
      return;
    }

    const element = createUserMarkerElement(userAvatarUrl, userLabel, true);

    userMarkerRef.current = new maplibregl.Marker({ element, anchor: "center" })
      .setLngLat(selfLngLat)
      .addTo(map);
  }, [isLive, mapReady, userAvatarUrl, userCoords, userLabel]);

  const handleSelectLiveUser = useCallback((user: LiveMapUser) => {
    armMarkerTapGuard();
    mapTapRequestRef.current += 1;
    clearTapSave();
    setOverlapSheet(null);
    setMarkClusterSheet(null);
    setSelectedMapMark(null);
    setSelectedLiveUser(user);
    setSelectedPin(null);

    const map = mapRef.current;
    if (map) {
      map.flyTo({
        center: [user.longitude, user.latitude],
        zoom: Math.max(map.getZoom(), 14),
        essential: true,
      });
    }
  }, [armMarkerTapGuard, clearTapSave]);

  const handleSelectSpotPin = useCallback((pin: MapSpotPin) => {
    armMarkerTapGuard();
    mapTapRequestRef.current += 1;
    clearTapSave();
    setOverlapSheet(null);
    setMarkClusterSheet(null);
    setSelectedMapMark(null);
    setSelectedPin(pin);
    setSelectedLiveUser(null);

    const map = mapRef.current;
    const lngLat = resolveSpotMapLngLat(pin);

    if (map && lngLat) {
      map.flyTo({
        center: lngLat,
        zoom: Math.max(map.getZoom(), 14),
        essential: true,
      });
    }
  }, [armMarkerTapGuard, clearTapSave]);

  const handleSelectOverlapCluster = useCallback((cluster: MapOverlapCluster) => {
    armMarkerTapGuard();
    mapTapRequestRef.current += 1;
    setSelectedPin(null);
    setSelectedLiveUser(null);
    setSelectedMapMark(null);
    setMarkClusterSheet(null);
    clearTapSave();
    setOverlapSheet(cluster);

    const map = mapRef.current;
    if (map) {
      map.flyTo({
        center: [cluster.longitude, cluster.latitude],
        zoom: Math.max(map.getZoom(), 14),
        essential: true,
      });
    }
  }, [armMarkerTapGuard, clearTapSave]);

  const handleSelectOverlapClusterId = useCallback(
    (clusterId: string) => {
      const cluster = overlapClustersByIdRef.current.get(clusterId);

      if (cluster) {
        handleSelectOverlapCluster(cluster);
      }
    },
    [handleSelectOverlapCluster]
  );

  useEffect(() => {
    const map = mapRef.current;

    if (!map || !mapReady) {
      return;
    }

    let rafId = 0;

    const bumpLayout = () => {
      if (rafId) {
        return;
      }

      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        setMarkerLayoutTick((tick) => tick + 1);
      });
    };

    map.on("zoom", bumpLayout);
    map.on("move", bumpLayout);

    return () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }

      map.off("zoom", bumpLayout);
      map.off("move", bumpLayout);
    };
  }, [mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    const maplibregl = maplibreRef.current;

    if (!map || !maplibregl || !mapReady) {
      return;
    }

    const liveForMap = onlineLiveUsers.filter((liveUser) => liveUser.user_id !== userId);
    const { clusters, freeUsers, freeSpots } = buildMixedMapOverlapClusters(
      map,
      liveForMap,
      pins,
      MAP_MARKER_OVERLAP_THRESHOLD_PX
    );
    overlapClustersByIdRef.current = new Map(clusters.map((cluster) => [cluster.id, cluster]));
    const spiderfy = shouldSpiderfyOverlapClusters(map.getZoom());

    const nextLiveIds = new Set(freeUsers.map((user) => user.user_id));
    const nextSpotIds = new Set(freeSpots.map((pin) => pin.id));
    const nextCombinedIds = new Set<string>();
    const nextSpiderIds = new Set<string>();

    for (const cluster of clusters) {
      if (spiderfy) {
        const items: Array<
          | { key: string; kind: "user"; user: LiveMapUser }
          | { key: string; kind: "spot"; pin: MapSpotPin }
        > = [
          ...cluster.users.map((user) => ({
            key: `user:${user.user_id}`,
            kind: "user" as const,
            user,
          })),
          ...cluster.spots.map((pin) => ({
            key: `spot:${pin.id}`,
            kind: "spot" as const,
            pin,
          })),
        ];
        const offsets = buildSpiderfyLngLats(map, cluster, items.length);

        items.forEach((item, index) => {
          const offset = offsets[index] ?? {
            longitude: cluster.longitude,
            latitude: cluster.latitude,
          };
          const offsetLngLat = resolveMapLngLat(offset.latitude, offset.longitude, {
            kind: "spiderfy-offset",
            id: item.key,
          });

          if (!offsetLngLat) {
            return;
          }

          nextSpiderIds.add(item.key);
          const existing = spiderMarkersRef.current.get(item.key);

          if (existing) {
            existing.setLngLat(offsetLngLat);

            if (item.kind === "spot") {
              updateSpotMarkerSavedState(existing.getElement(), savedIds.has(item.pin.id));
            }

            return;
          }

          if (item.kind === "user") {
            const element = createLiveUserMarkerElement(
              item.user,
              t("map.userIsLive", { username: item.user.username }),
              handleSelectLiveUser,
              armMarkerTapGuard
            );
            const marker = new maplibregl.Marker({ element, anchor: "center" })
              .setLngLat(offsetLngLat)
              .addTo(map);
            spiderMarkersRef.current.set(item.key, marker);
            return;
          }

          const animateIn = !seenSpotPinIdsRef.current.has(item.pin.id);
          if (animateIn) {
            seenSpotPinIdsRef.current.add(item.pin.id);
          }

          const element = createSpotMarkerElement(
            item.pin,
            savedIds.has(item.pin.id),
            animateIn,
            handleSelectSpotPin,
            armMarkerTapGuard
          );

          const marker = new maplibregl.Marker({ element, anchor: "center" })
            .setLngLat(offsetLngLat)
            .addTo(map);
          spiderMarkersRef.current.set(item.key, marker);
        });
      } else {
        const clusterLngLat = resolveMapLngLat(cluster.latitude, cluster.longitude, {
          kind: "overlap-cluster",
          id: cluster.id,
        });

        if (!clusterLngLat) {
          continue;
        }

        nextCombinedIds.add(cluster.id);
        const existing = combinedOverlapMarkersRef.current.get(cluster.id);

        if (existing) {
          existing.setLngLat(clusterLngLat);
          continue;
        }

        const element = createCombinedOverlapMarkerElement(
          cluster.id,
          cluster,
          t("map.overlapCombinedLabel"),
          handleSelectOverlapClusterId,
          armMarkerTapGuard
        );
        const marker = new maplibregl.Marker({ element, anchor: "center" })
          .setLngLat(clusterLngLat)
          .addTo(map);
        combinedOverlapMarkersRef.current.set(cluster.id, marker);
      }
    }

    for (const liveUser of freeUsers) {
      const lngLat = resolveMapLngLat(liveUser.latitude, liveUser.longitude, {
        kind: "live-user",
        id: liveUser.user_id,
      });

      if (!lngLat) {
        continue;
      }

      const markerKey = liveUser.user_id;
      const existing = liveMarkersRef.current.get(markerKey);

      if (existing) {
        existing.setLngLat(lngLat);
        continue;
      }

      const element = createLiveUserMarkerElement(
        liveUser,
        t("map.userIsLive", { username: liveUser.username }),
        handleSelectLiveUser,
        armMarkerTapGuard
      );
      const marker = new maplibregl.Marker({ element, anchor: "center" })
        .setLngLat(lngLat)
        .addTo(map);
      liveMarkersRef.current.set(markerKey, marker);
    }

    for (const pin of freeSpots) {
      const lngLat = resolveSpotMapLngLat(pin);
      if (!lngLat) {
        continue;
      }

      const isSaved = savedIds.has(pin.id);
      const existing = spotMarkersRef.current.get(pin.id);

      if (existing) {
        existing.setLngLat(lngLat);
        updateSpotMarkerSavedState(existing.getElement(), isSaved);
        continue;
      }

      const animateIn = !seenSpotPinIdsRef.current.has(pin.id);
      if (animateIn) {
        seenSpotPinIdsRef.current.add(pin.id);
      }

      const element = createSpotMarkerElement(
        pin,
        isSaved,
        animateIn,
        handleSelectSpotPin,
        armMarkerTapGuard
      );

      const marker = new maplibregl.Marker({ element, anchor: "center" })
        .setLngLat(lngLat)
        .addTo(map);
      spotMarkersRef.current.set(pin.id, marker);
    }

    liveMarkersRef.current.forEach((marker, userIdKey) => {
      if (!nextLiveIds.has(userIdKey)) {
        marker.remove();
        liveMarkersRef.current.delete(userIdKey);
      }
    });

    spotMarkersRef.current.forEach((marker, pinId) => {
      if (!nextSpotIds.has(pinId)) {
        marker.remove();
        spotMarkersRef.current.delete(pinId);
      }
    });

    combinedOverlapMarkersRef.current.forEach((marker, clusterId) => {
      if (!nextCombinedIds.has(clusterId)) {
        marker.remove();
        combinedOverlapMarkersRef.current.delete(clusterId);
      }
    });

    spiderMarkersRef.current.forEach((marker, spiderId) => {
      if (!nextSpiderIds.has(spiderId)) {
        marker.remove();
        spiderMarkersRef.current.delete(spiderId);
      }
    });
  }, [
    armMarkerTapGuard,
    handleSelectLiveUser,
    handleSelectOverlapClusterId,
    handleSelectSpotPin,
    mapReady,
    markerLayoutTick,
    onlineLiveUsers,
    pins,
    savedIds,
    t,
    userId,
  ]);

  useEffect(() => {
    let cancelled = false;

    void loadMapMarks().then((result) => {
      if (cancelled) {
        return;
      }

      setMapMarks(result.marks);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // Marks auto-expire 24h after creation. The server (RLS + a scheduled
  // cleanup job) already stops returning/keeping expired rows, but a map
  // left open in the background should also drop them from view the moment
  // they cross the 24h mark, without waiting for the next full reload.
  useEffect(() => {
    const interval = setInterval(() => {
      setMapMarks((current) => {
        const next = current.filter((mark) => !isMapMarkExpired(mark));
        return next.length === current.length ? current : next;
      });

      setSelectedMapMark((current) => (current && isMapMarkExpired(current) ? null : current));
    }, 60_000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  const focusMarkHandledRef = useRef<string | null>(null);

  useEffect(() => {
    const markId = focusMarkId?.trim() || null;

    if (!markId || !mapReady) {
      return;
    }

    if (focusMarkHandledRef.current === markId) {
      return;
    }

    let cancelled = false;

    const focus = async () => {
      const result = await loadMapMarkById(markId);

      if (cancelled) {
        return;
      }

      focusMarkHandledRef.current = markId;

      if (!result.mark) {
        setError(t("map.markUnavailable"));
        return;
      }

      const loaded = result.mark;

      setMapMarks((current) => {
        if (current.some((mark) => mark.id === loaded.id)) {
          return current;
        }

        return [loaded, ...current];
      });

      setSelectedPin(null);
      setSelectedLiveUser(null);
      setOverlapSheet(null);
      setTapSave(null);
      setMarkClusterSheet(null);
      setSelectedMapMark(loaded);

      const map = mapRef.current;
      if (map) {
        map.flyTo({
          center: [loaded.longitude, loaded.latitude],
          zoom: Math.max(map.getZoom(), 16),
          essential: true,
        });
      }
    };

    void focus();

    return () => {
      cancelled = true;
    };
  }, [focusMarkId, mapReady, t]);

  const focusPlaceHandledRef = useRef<string | null>(null);

  useEffect(() => {
    if (!focusPlaceCoords || !mapReady) {
      return;
    }

    const { latitude, longitude, name } = focusPlaceCoords;
    const focusKey = `${latitude.toFixed(5)},${longitude.toFixed(5)}`;

    if (focusPlaceHandledRef.current === focusKey) {
      return;
    }

    focusPlaceHandledRef.current = focusKey;

    const map = mapRef.current;
    const maplibregl = maplibreRef.current;

    clearPlaceSearchHighlight();
    setSelectedPin(null);
    setSelectedLiveUser(null);
    setOverlapSheet(null);
    setSelectedMapMark(null);
    setMarkClusterSheet(null);
    clearTapSave();

    const lngLat = resolveMapLngLat(latitude, longitude, {
      kind: "shared-place",
      id: focusKey,
    });

    if (!lngLat || !map || !maplibregl) {
      return;
    }

    const element = createMapTapPinMarkerElement();
    searchMarkerRef.current = new maplibregl.Marker({ element, anchor: "bottom" })
      .setLngLat(lngLat)
      .addTo(map);

    map.flyTo({
      center: lngLat,
      zoom: Math.max(map.getZoom(), 15),
      duration: 1100,
      essential: true,
    });

    setTapSave({
      location: {
        latitude,
        longitude,
        address: name?.trim() || null,
        city: null,
        country: null,
      },
      resolving: false,
    });

    void spotLocationFromCoordinates(latitude, longitude).then((resolved) => {
      setTapSave((current) => {
        if (!current) {
          return current;
        }

        return {
          location: {
            ...resolved,
            latitude,
            longitude,
            address: resolved.address?.trim() || name?.trim() || current.location.address,
          },
          resolving: false,
        };
      });
    });
  }, [clearPlaceSearchHighlight, clearTapSave, focusPlaceCoords, mapReady]);

  useEffect(() => {
    const onPublished = () => {
      refreshPinsForViewportRef.current();
    };

    window.addEventListener(MAP_SPOT_PUBLISHED_EVENT, onPublished);

    return () => {
      window.removeEventListener(MAP_SPOT_PUBLISHED_EVENT, onPublished);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const maplibregl = maplibreRef.current;

    if (!map || !maplibregl || !mapReady) {
      return;
    }

    mapMarksByIdRef.current = new Map(mapMarks.map((mark) => [mark.id, mark]));

    const { clusters, freeMarks } = buildMapMarkClusters(map, mapMarks);
    mapMarkClustersByIdRef.current = new Map(clusters.map((cluster) => [cluster.id, cluster]));
    const spiderfy = shouldSpiderfyMapMarkClusters(map.getZoom());

    const nextFreeIds = new Set(freeMarks.map((mark) => mark.id));
    const nextClusterIds = new Set<string>();
    const nextSpiderIds = new Set<string>();

    const openMarkById = (markId: string) => {
      const mark = mapMarksByIdRef.current.get(markId);

      if (!mark) {
        return;
      }

      armMarkerTapGuard();
      mapTapRequestRef.current += 1;
      clearTapSave();
      setMarkClusterSheet(null);
      setSelectedMapMark(mark);
      setSelectedPin(null);
      setSelectedLiveUser(null);
      setOverlapSheet(null);
      map.flyTo({
        center: [mark.longitude, mark.latitude],
        zoom: Math.max(map.getZoom(), 14),
        essential: true,
      });
    };

    const openMarkClusterById = (clusterId: string) => {
      const cluster = mapMarkClustersByIdRef.current.get(clusterId);

      if (!cluster) {
        return;
      }

      armMarkerTapGuard();
      mapTapRequestRef.current += 1;
      clearTapSave();
      setSelectedMapMark(null);
      setSelectedPin(null);
      setSelectedLiveUser(null);
      setOverlapSheet(null);
      setMarkClusterSheet(cluster);
      map.flyTo({
        center: [cluster.longitude, cluster.latitude],
        zoom: Math.max(map.getZoom(), 14),
        essential: true,
      });
    };

    for (const cluster of clusters) {
      if (spiderfy) {
        const offsets = buildMapMarkSpiderfyLngLats(map, cluster, cluster.marks.length);

        cluster.marks.forEach((mark, index) => {
          const offset = offsets[index] ?? {
            longitude: cluster.longitude,
            latitude: cluster.latitude,
          };
          const offsetLngLat = resolveMapLngLat(offset.latitude, offset.longitude, {
            kind: "mark-spiderfy",
            id: mark.id,
          });

          if (!offsetLngLat) {
            return;
          }

          const spiderKey = mark.id;
          nextSpiderIds.add(spiderKey);
          const existing = publicMarkSpiderMarkersRef.current.get(spiderKey);

          if (existing) {
            existing.setLngLat(offsetLngLat);
            return;
          }

          const element = createPublicMapMarkElement(mark, openMarkById, armMarkerTapGuard);
          const marker = new maplibregl.Marker({ element, anchor: "center" })
            .setLngLat(offsetLngLat)
            .addTo(map);
          publicMarkSpiderMarkersRef.current.set(spiderKey, marker);
        });
      } else {
        const clusterLngLat = resolveMapLngLat(cluster.latitude, cluster.longitude, {
          kind: "mark-cluster",
          id: cluster.id,
        });

        if (!clusterLngLat) {
          continue;
        }

        nextClusterIds.add(cluster.id);
        const existing = publicMarkClusterMarkersRef.current.get(cluster.id);

        if (existing) {
          existing.setLngLat(clusterLngLat);
          continue;
        }

        const element = createPublicMapMarkClusterElement(
          cluster,
          openMarkClusterById,
          armMarkerTapGuard
        );
        const marker = new maplibregl.Marker({ element, anchor: "center" })
          .setLngLat(clusterLngLat)
          .addTo(map);
        publicMarkClusterMarkersRef.current.set(cluster.id, marker);
      }
    }

    for (const mark of freeMarks) {
      const lngLat = resolveMapLngLat(mark.latitude, mark.longitude, {
        kind: "public-mark",
        id: mark.id,
      });

      if (!lngLat) {
        continue;
      }

      const existing = publicMarkMarkersRef.current.get(mark.id);

      if (existing) {
        existing.setLngLat(lngLat);
        continue;
      }

      const element = createPublicMapMarkElement(mark, openMarkById, armMarkerTapGuard);
      const marker = new maplibregl.Marker({ element, anchor: "center" })
        .setLngLat(lngLat)
        .addTo(map);
      publicMarkMarkersRef.current.set(mark.id, marker);
    }

    publicMarkMarkersRef.current.forEach((marker, markId) => {
      if (!nextFreeIds.has(markId)) {
        marker.remove();
        publicMarkMarkersRef.current.delete(markId);
      }
    });

    publicMarkClusterMarkersRef.current.forEach((marker, clusterId) => {
      if (!nextClusterIds.has(clusterId)) {
        marker.remove();
        publicMarkClusterMarkersRef.current.delete(clusterId);
      }
    });

    publicMarkSpiderMarkersRef.current.forEach((marker, spiderId) => {
      if (!nextSpiderIds.has(spiderId)) {
        marker.remove();
        publicMarkSpiderMarkersRef.current.delete(spiderId);
      }
    });
  }, [mapReady, mapMarks, markerLayoutTick, armMarkerTapGuard, clearTapSave]);

  useEffect(() => {
    const map = mapRef.current;
    const maplibregl = maplibreRef.current;

    if (!map || !maplibregl || !mapReady) {
      return;
    }

    if (!tapSave) {
      tapMarkerRef.current?.remove();
      tapMarkerRef.current = null;
      return;
    }

    const lngLat = resolveMapLngLat(tapSave.location.latitude, tapSave.location.longitude, {
      kind: "tap-pin",
    });

    if (!lngLat) {
      tapMarkerRef.current?.remove();
      tapMarkerRef.current = null;
      return;
    }

    if (tapMarkerRef.current) {
      tapMarkerRef.current.setLngLat(lngLat);
      return;
    }

    const element = createMapTapPinMarkerElement();
    tapMarkerRef.current = new maplibregl.Marker({ element, anchor: "bottom" })
      .setLngLat(lngLat)
      .addTo(map);
  }, [mapReady, tapSave]);

  const liveCount = onlineLiveUsers.length;

  const handleLocateMe = useCallback(() => {
    const map = mapRef.current;

    if (!map || !("geolocation" in navigator)) {
      return;
    }

    setLocating(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };

        map.flyTo({
          center: [next.longitude, next.latitude],
          zoom: Math.max(map.getZoom(), 14),
          essential: true,
        });
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }, []);

  const handleZoomIn = () => {
    mapRef.current?.zoomIn({ duration: 200 });
  };

  const handleZoomOut = () => {
    mapRef.current?.zoomOut({ duration: 200 });
  };

  return (
    <div
      className={`relative h-full w-full overflow-hidden bg-[#050816] ${embedded ? "" : "rounded-3xl"}`}
    >
      <div ref={mapContainerRef} className="absolute inset-0 h-full w-full" />

      {loading ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-[#050816]/35">
          <p className="rounded-full bg-black/65 px-4 py-2 text-sm text-white shadow-lg ring-1 ring-white/10">
            {t("map.loading")}
          </p>
        </div>
      ) : null}

      {mapLoadError ? (
        <div className="absolute inset-x-4 top-[max(7.5rem,calc(env(safe-area-inset-top)+6.5rem))] z-30 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-200">
          {t("map.couldNotLoadMap")}
        </div>
      ) : null}

      {error ? (
        <div className="absolute inset-x-4 top-[max(7.5rem,calc(env(safe-area-inset-top)+6.5rem))] z-30 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-200">
          {localizeError(t, error) ?? error}
        </div>
      ) : null}

      {liveError ? (
        <div className="absolute inset-x-4 top-[max(7.5rem,calc(env(safe-area-inset-top)+6.5rem))] z-30 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-100">
          {liveError}
        </div>
      ) : null}

      {liveSuccess ? (
        <div className="absolute inset-x-4 top-[max(7.5rem,calc(env(safe-area-inset-top)+6.5rem))] z-30 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-100">
          {liveSuccess}
        </div>
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-3 p-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex w-full items-start gap-2">
          <div className="min-w-0 flex-1">
            <MapPlacesSearch onSelectPlace={handleSelectPlace} disabled={!mapReady || mapLoadError} />
          </div>

          <div className="pointer-events-auto flex shrink-0 flex-col gap-2">
            <button
              type="button"
              onClick={handleLocateMe}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-[#0B1026]/88 text-white shadow-lg ring-1 ring-white/12 backdrop-blur-md transition hover:bg-[#121a33] disabled:opacity-60"
              aria-label={t("map.centerLocation")}
              disabled={locating}
            >
              <Crosshair className={`h-5 w-5 ${locating ? "animate-pulse" : ""}`} aria-hidden />
            </button>
            <button
              type="button"
              onClick={handleZoomIn}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-[#0B1026]/88 text-white shadow-lg ring-1 ring-white/12 backdrop-blur-md transition hover:bg-[#121a33]"
              aria-label={t("map.zoomIn")}
            >
              <Plus className="h-5 w-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={handleZoomOut}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-[#0B1026]/88 text-white shadow-lg ring-1 ring-white/12 backdrop-blur-md transition hover:bg-[#121a33]"
              aria-label={t("map.zoomOut")}
            >
              <Minus className="h-5 w-5" aria-hidden />
            </button>
          </div>
        </div>

        <div className="pointer-events-auto self-start rounded-full border border-white/12 bg-[#0B1026]/88 px-4 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur-md">
          {liveCount > 0 ? t("map.onlineNearby", { count: liveCount }) : t("map.nobodyOnline")}
        </div>
      </div>

      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-2 px-4 pt-2 ${
          embedded
            ? "pb-[calc(54px+env(safe-area-inset-bottom,0px)+12px)]"
            : "pb-4"
        }`}
      >
        <p className="pointer-events-none text-center text-xs font-medium text-slate-300">
          {isLive ? t("map.visibleOnMap") : t("map.hiddenFromMap")}
        </p>
        {isLive ? (
          <button
            type="button"
            onClick={() => void handleStopLive()}
            className="pointer-events-auto inline-flex w-full max-w-sm items-center justify-center gap-2 rounded-full border border-red-400/35 bg-red-500/15 px-5 py-3.5 text-sm font-semibold text-red-100 shadow-2xl backdrop-blur-md transition hover:bg-red-500/25"
          >
            <Radio className="h-4 w-4" aria-hidden />
            {t("map.hideFromMap")}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void handleGoLive()}
            disabled={goingLive}
            className="pointer-events-auto inline-flex w-full max-w-sm items-center justify-center gap-2 rounded-full bg-cyan-500 px-5 py-3.5 text-sm font-semibold text-slate-950 shadow-2xl transition hover:bg-cyan-400 disabled:opacity-60"
          >
            <Radio className="h-4 w-4" aria-hidden />
            {goingLive ? t("map.connecting") : t("map.becomeOnline")}
          </button>
        )}
      </div>

      <SpotMapPinSheet
        pin={selectedPin}
        embedded={embedded}
        onClose={() => setSelectedPin(null)}
      />
      <LiveMapUserSheet
        user={selectedLiveUser}
        embedded={embedded}
        onClose={() => setSelectedLiveUser(null)}
      />
      {overlapSheet ? (
        <MapOverlapActionSheet
          users={overlapSheet.users}
          spots={overlapSheet.spots}
          embedded={embedded}
          onClose={clearOverlapSheet}
          onOpenUser={(user) => {
            clearOverlapSheet();
            handleSelectLiveUser(user);
          }}
          onOpenSpot={(pin) => {
            clearOverlapSheet();
            handleSelectSpotPin(pin);
          }}
        />
      ) : null}
      {markClusterSheet ? (
        <MapMarkClusterSheet
          marks={markClusterSheet.marks}
          embedded={embedded}
          onClose={() => setMarkClusterSheet(null)}
          onSelect={(mark) => {
            setMarkClusterSheet(null);
            setSelectedMapMark(mark);
            setSelectedPin(null);
            setSelectedLiveUser(null);
            setOverlapSheet(null);
          }}
        />
      ) : null}
      {selectedMapMark ? (
        <MapMarkDetailSheet
          mark={selectedMapMark}
          viewerId={userId}
          embedded={embedded}
          onClose={() => setSelectedMapMark(null)}
          onUpdated={(mark) => {
            setSelectedMapMark(mark);
            setMapMarks((current) => current.map((item) => (item.id === mark.id ? mark : item)));
          }}
          onDeleted={(markId) => {
            setSelectedMapMark(null);
            setMapMarks((current) => current.filter((item) => item.id !== markId));
          }}
        />
      ) : null}
      {markCreateLocation && userId ? (
        <MapMarkCreateSheet
          location={markCreateLocation.location}
          placeLabel={markCreateLocation.placeLabel}
          userId={userId}
          embedded={embedded}
          onClose={() => setMarkCreateLocation(null)}
          onPublished={(mark) => {
            setMarkCreateLocation(null);
            setMapMarks((current) => [mark, ...current.filter((item) => item.id !== mark.id)]);
            setLiveSuccess(t("map.markPublished"));
            setSelectedMapMark(mark);
          }}
        />
      ) : null}
      {tapSave ? (
        <MapTapActionSheet
          location={tapSave.location}
          resolving={tapSave.resolving}
          embedded={embedded}
          busyAction={tapActionBusy}
          onClose={clearTapSave}
          onAction={(action) => {
            void handleTapAction(action);
          }}
        />
      ) : null}
      {tapSave ? (
        <ShareMapPlaceSheet
          place={geoLocationToMapPlaceSharePayload(tapSave.location, {
            locale,
            name:
              tapSave.location.address?.trim() ||
              [tapSave.location.city, tapSave.location.country].filter(Boolean).join(", ") ||
              null,
          })}
          userId={userId}
          isOpen={sharePlaceOpen}
          onClose={() => setSharePlaceOpen(false)}
        />
      ) : null}
    </div>
  );
}
