"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Crosshair, Minus, Plus, Radio } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import LiveMapUserSheet from "@/components/LiveMapUserSheet";
import SpotMapPinSheet from "@/components/SpotMapPinSheet";
import { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM, getMapLibreStyleUrl } from "@/lib/mapLibre";
import { getMapSpotPinPreviewUrl, getMapSpotPinTitle, resolveSpotMapLngLat } from "@/lib/mapSpotPin";
import { loadNearbyMapSpotPins, loadSavedMapSpotPinIds, type MapSpotPin } from "@/lib/spots";
import { supabase } from "@/lib/supabaseClient";
import { publicProfileUsername } from "@/lib/publicProfile";
import {
  fetchLiveMapUsers,
  LIVE_LOCATION_ERROR,
  LIVE_LOCATION_PUSH_MS,
  stopUserLiveLocation,
  upsertUserLiveLocation,
  validateLiveCoordinates,
  type LiveMapUser,
} from "@/lib/userLiveLocation";
import { localizeError } from "@/lib/i18n/localizeError";
import type { TranslationKey } from "@/lib/i18n/messages";
import "maplibre-gl/dist/maplibre-gl.css";

type SpotLiveMapProps = {
  userId: string | null;
  embedded?: boolean;
};

type UserCoords = {
  latitude: number;
  longitude: number;
};

const LIVE_USERS_REFRESH_MS = 30_000;
const SPOT_PIN_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21.5s-5.4-4.85-5.4-9.85a5.4 5.4 0 1 1 10.8 0c0 5-5.4 9.85-5.4 9.85z"/><circle cx="12" cy="11.35" r="2.1"/><circle cx="12" cy="11.35" r="0.85" fill="currentColor" stroke="none"/></svg>`;

function createUserMarkerElement(avatarUrl: string | null, label: string, isSelf = false) {
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
  return root;
}

function createLiveUserMarkerElement(user: LiveMapUser, ariaLabel: string, onSelect: (user: LiveMapUser) => void) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "spot-live-share-marker";
  button.setAttribute("aria-label", ariaLabel);

  if (user.avatar_url) {
    const image = document.createElement("img");
    image.src = user.avatar_url;
    image.alt = "";
    button.appendChild(image);
  } else {
    button.textContent = user.username.charAt(0).toUpperCase();
  }

  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onSelect(user);
  });

  return button;
}

function createSpotMarkerElement(pin: MapSpotPin, isSaved: boolean, animateIn = false) {
  const anchor = document.createElement("div");
  anchor.className = "spot-live-spot-marker-anchor";

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
    button.appendChild(image);
  } else {
    const icon = document.createElement("span");
    icon.className = "spot-live-spot-marker__icon";
    icon.innerHTML = SPOT_PIN_SVG;
    button.appendChild(icon);
  }

  anchor.appendChild(button);
  return anchor;
}

function updateSpotMarkerSavedState(anchor: HTMLElement, isSaved: boolean) {
  const button = anchor.querySelector(".spot-live-spot-marker");
  button?.classList.toggle("spot-live-spot-marker--saved", isSaved);
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

  return error;
}

export default function SpotLiveMap({ userId, embedded = false }: SpotLiveMapProps) {
  const { t } = useI18n();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const maplibreRef = useRef<typeof import("maplibre-gl") | null>(null);
  const liveMarkersRef = useRef<Map<string, import("maplibre-gl").Marker>>(new Map());
  const spotMarkersRef = useRef<Map<string, import("maplibre-gl").Marker>>(new Map());
  const seenSpotPinIdsRef = useRef<Set<string>>(new Set());
  const userMarkerRef = useRef<import("maplibre-gl").Marker | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const pushIntervalRef = useRef<number | null>(null);
  const centeredOnUserRef = useRef(false);
  const isLiveRef = useRef(false);
  const livePushSessionRef = useRef(0);
  const latestCoordsRef = useRef<UserCoords | null>(null);

  const [userCoords, setUserCoords] = useState<UserCoords | null>(null);
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);
  const [userLabel, setUserLabel] = useState("");
  const [pins, setPins] = useState<MapSpotPin[]>([]);
  const [liveUsers, setLiveUsers] = useState<LiveMapUser[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapLoadError, setMapLoadError] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [selectedPin, setSelectedPin] = useState<MapSpotPin | null>(null);
  const [selectedLiveUser, setSelectedLiveUser] = useState<LiveMapUser | null>(null);
  const [locating, setLocating] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [goingLive, setGoingLive] = useState(false);
  const [liveSuccess, setLiveSuccess] = useState<string | null>(null);

  const mapStyle = getMapLibreStyleUrl();

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

  const loadMapData = useCallback(
    async (coords: UserCoords | null) => {
      setLoading(true);
      setError(null);

      const center = coords ?? { latitude: DEFAULT_MAP_CENTER[1], longitude: DEFAULT_MAP_CENTER[0] };

      const [spotsResult, savedResult, liveUsersResult] = await Promise.all([
        loadNearbyMapSpotPins(center.latitude, center.longitude),
        userId ? loadSavedMapSpotPinIds(userId) : Promise.resolve({ ids: [] as string[], error: null }),
        fetchLiveMapUsers(),
      ]);

      setPins(spotsResult.pins);
      setSavedIds(new Set(savedResult.ids));
      setLiveUsers(liveUsersResult.users);
      if (liveUsersResult.error) {
        setLiveError(formatLiveLocationError(t, liveUsersResult.error));
      }
      setError(spotsResult.error ?? savedResult.error ?? null);
      setLoading(false);
    },
    [t, userId]
  );

  useEffect(() => {
    void loadMapData(isLive ? latestCoordsRef.current : null);
  }, [isLive, loadMapData]);

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
        });
        map.on("error", () => setMapLoadError(true));
        map.on("click", () => {
          setSelectedPin(null);
          setSelectedLiveUser(null);
        });

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
      seenSpotPinIdsRef.current.clear();
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [mapStyle]);

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

    if (!centeredOnUserRef.current) {
      centeredOnUserRef.current = true;
      map.flyTo({
        center: [userCoords.longitude, userCoords.latitude],
        zoom: 14,
        essential: true,
      });
    }

    if (userMarkerRef.current) {
      userMarkerRef.current.setLngLat([userCoords.longitude, userCoords.latitude]);
      return;
    }

    const element = createUserMarkerElement(userAvatarUrl, userLabel, true);

    userMarkerRef.current = new maplibregl.Marker({ element, anchor: "center" })
      .setLngLat([userCoords.longitude, userCoords.latitude])
      .addTo(map);
  }, [isLive, mapReady, userAvatarUrl, userCoords, userLabel]);

  const handleSelectLiveUser = useCallback((user: LiveMapUser) => {
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
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const maplibregl = maplibreRef.current;

    if (!map || !maplibregl || !mapReady) {
      return;
    }

    const nextLiveIds = new Set<string>();

    for (const liveUser of liveUsers) {
      if (liveUser.user_id === userId) {
        continue;
      }

      nextLiveIds.add(liveUser.user_id);
      const markerKey = liveUser.user_id;
      const existing = liveMarkersRef.current.get(markerKey);

      if (existing) {
        existing.setLngLat([liveUser.longitude, liveUser.latitude]);
        continue;
      }

      const element = createLiveUserMarkerElement(
        liveUser,
        t("map.userIsLive", { username: liveUser.username }),
        handleSelectLiveUser
      );

      const marker = new maplibregl.Marker({ element, anchor: "center" })
        .setLngLat([liveUser.longitude, liveUser.latitude])
        .addTo(map);

      liveMarkersRef.current.set(markerKey, marker);
    }

    liveMarkersRef.current.forEach((marker, userIdKey) => {
      if (!nextLiveIds.has(userIdKey)) {
        marker.remove();
        liveMarkersRef.current.delete(userIdKey);
      }
    });
  }, [handleSelectLiveUser, liveUsers, mapReady, t, userId]);

  useEffect(() => {
    const map = mapRef.current;
    const maplibregl = maplibreRef.current;

    if (!map || !maplibregl || !mapReady) {
      return;
    }

    const nextPinIds = new Set(pins.map((pin) => pin.id));

    spotMarkersRef.current.forEach((marker, pinId) => {
      if (!nextPinIds.has(pinId)) {
        marker.remove();
        spotMarkersRef.current.delete(pinId);
      }
    });

    for (const pin of pins) {
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

      const element = createSpotMarkerElement(pin, isSaved, animateIn);

      element.addEventListener("click", (event) => {
        event.stopPropagation();
        setSelectedPin(pin);
        setSelectedLiveUser(null);
        map.flyTo({
          center: lngLat,
          zoom: Math.max(map.getZoom(), 14),
          essential: true,
        });
      });

      const marker = new maplibregl.Marker({ element, anchor: "center" })
        .setLngLat(lngLat)
        .addTo(map);

      spotMarkersRef.current.set(pin.id, marker);
    }
  }, [mapReady, pins, savedIds]);

  const liveCount = liveUsers.length;

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
        <div className="absolute inset-x-4 top-[max(0.75rem,env(safe-area-inset-top))] z-20 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-200">
          {t("map.couldNotLoadMap")}
        </div>
      ) : null}

      {error ? (
        <div className="absolute inset-x-4 top-[max(0.75rem,env(safe-area-inset-top))] z-20 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-200">
          {localizeError(t, error) ?? error}
        </div>
      ) : null}

      {liveError ? (
        <div className="absolute inset-x-4 top-[max(3.5rem,calc(env(safe-area-inset-top)+2.5rem))] z-20 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-100">
          {liveError}
        </div>
      ) : null}

      {liveSuccess ? (
        <div className="absolute inset-x-4 top-[max(3.5rem,calc(env(safe-area-inset-top)+2.5rem))] z-20 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-100">
          {liveSuccess}
        </div>
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between p-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="pointer-events-auto rounded-full border border-white/12 bg-[#0B1026]/88 px-4 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur-md">
          {liveCount > 0 ? t("map.onlineNearby", { count: liveCount }) : t("map.nobodyOnline")}
        </div>

        <div className="pointer-events-auto flex flex-col gap-2">
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

      <SpotMapPinSheet pin={selectedPin} onClose={() => setSelectedPin(null)} />
      <LiveMapUserSheet user={selectedLiveUser} onClose={() => setSelectedLiveUser(null)} />
    </div>
  );
}
