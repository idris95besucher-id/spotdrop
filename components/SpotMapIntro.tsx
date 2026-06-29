"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { getMapLibreStyleUrl } from "@/lib/mapLibre";
import {
  buildSpotMapIntroWaypoints,
  resolveInitialMapIntroWaypoint,
  SPOT_MAP_INTRO_LOAD_TIMEOUT_MS,
  type SpotMapIntroTarget,
  type SpotMapIntroWaypoint,
} from "@/lib/spotMapIntro";
import "maplibre-gl/dist/maplibre-gl.css";

type SpotMapIntroProps = {
  spot: SpotMapIntroTarget;
  onComplete: () => void;
  onSkip: () => void;
  onFail: () => void;
};

function flyToWaypoint(
  map: import("maplibre-gl").Map,
  waypoint: SpotMapIntroWaypoint
): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;

    const finish = () => {
      if (settled) {
        return;
      }

      settled = true;
      map.off("moveend", finish);
      resolve();
    };

    map.once("moveend", finish);
    map.flyTo({
      center: waypoint.center,
      zoom: waypoint.zoom,
      duration: waypoint.durationMs,
      essential: true,
      curve: 1.18,
      padding: { top: 48, bottom: 120, left: 24, right: 24 },
    });

    window.setTimeout(finish, waypoint.durationMs + 350);
  });
}

function waitForMapLoad(map: import("maplibre-gl").Map): Promise<void> {
  if (map.loaded()) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    map.once("load", () => resolve());
  });
}

export default function SpotMapIntro({ spot, onComplete, onSkip, onFail }: SpotMapIntroProps) {
  const { t } = useI18n();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const markerRef = useRef<import("maplibre-gl").Marker | null>(null);
  const runIdRef = useRef(0);
  const finishedRef = useRef(false);

  const waypoints = useMemo(() => buildSpotMapIntroWaypoints(spot), [
    spot.content_kind,
    spot.spot_city,
    spot.spot_country,
    spot.spot_latitude,
    spot.spot_longitude,
    spot.spot_name,
  ]);
  const initialWaypoint = resolveInitialMapIntroWaypoint(waypoints);
  const spotLng = Number(spot.spot_longitude);
  const spotLat = Number(spot.spot_latitude);

  const [stageLabel, setStageLabel] = useState(initialWaypoint.label);
  const [fadingOut, setFadingOut] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  const finishIntro = useCallback(
    (handler: () => void) => {
      if (finishedRef.current) {
        return;
      }

      finishedRef.current = true;
      runIdRef.current += 1;
      setFadingOut(true);
      window.setTimeout(handler, 420);
    },
    []
  );

  const handleSkip = useCallback(() => {
    finishIntro(onSkip);
  }, [finishIntro, onSkip]);

  const handleComplete = useCallback(() => {
    finishIntro(onComplete);
  }, [finishIntro, onComplete]);

  const handleFail = useCallback(() => {
    finishIntro(onFail);
  }, [finishIntro, onFail]);

  useEffect(() => {
    if (!mapContainerRef.current || waypoints.length === 0) {
      handleFail();
      return;
    }

    let disposed = false;
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;

    const loadTimeout = window.setTimeout(() => {
      if (!disposed && runIdRef.current === runId && !mapRef.current?.loaded()) {
        handleFail();
      }
    }, SPOT_MAP_INTRO_LOAD_TIMEOUT_MS);

    const runAnimation = async (map: import("maplibre-gl").Map) => {
      try {
        await waitForMapLoad(map);

        if (disposed || runIdRef.current !== runId) {
          return;
        }

        window.clearTimeout(loadTimeout);
        map.resize();
        setMapReady(true);

        for (const waypoint of waypoints) {
          if (disposed || runIdRef.current !== runId) {
            return;
          }

          setStageLabel(waypoint.label);
          await flyToWaypoint(map, waypoint);
        }

        if (disposed || runIdRef.current !== runId) {
          return;
        }

        if (Number.isFinite(spotLng) && Number.isFinite(spotLat)) {
          const maplibregl = await import("maplibre-gl");
          const markerElement = document.createElement("div");
          markerElement.className = "spot-map-intro-pin";
          markerElement.innerHTML =
            '<span class="spot-map-intro-pin__pulse" aria-hidden="true"></span><span class="spot-map-intro-pin__dot" aria-hidden="true"></span>';

          markerRef.current?.remove();
          markerRef.current = new maplibregl.Marker({ element: markerElement, anchor: "center" })
            .setLngLat([spotLng, spotLat])
            .addTo(map);
        }

        await new Promise((resolve) => window.setTimeout(resolve, 450));
        handleComplete();
      } catch {
        if (!disposed && runIdRef.current === runId) {
          handleFail();
        }
      }
    };

    const initMap = async () => {
      try {
        const maplibregl = await import("maplibre-gl");

        if (disposed || !mapContainerRef.current) {
          return;
        }

        const map = new maplibregl.Map({
          container: mapContainerRef.current,
          style: getMapLibreStyleUrl(),
          center: initialWaypoint.center,
          zoom: initialWaypoint.zoom,
          attributionControl: false,
          pitchWithRotate: false,
          dragRotate: false,
          touchPitch: false,
          fadeDuration: 0,
          interactive: false,
        });

        mapRef.current = map;
        map.on("error", () => {
          if (!disposed && runIdRef.current === runId) {
            handleFail();
          }
        });

        void runAnimation(map);
      } catch {
        if (!disposed) {
          handleFail();
        }
      }
    };

    void initMap();

    return () => {
      disposed = true;
      window.clearTimeout(loadTimeout);
      markerRef.current?.remove();
      markerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [
    handleComplete,
    handleFail,
    initialWaypoint.center,
    initialWaypoint.zoom,
    spotLat,
    spotLng,
    waypoints,
  ]);

  return (
    <div
      className={`absolute inset-0 z-40 overflow-hidden bg-black transition-opacity duration-500 ${
        fadingOut ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
      aria-live="polite"
    >
      <div ref={mapContainerRef} className="absolute inset-0 h-full w-full" />

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/35 via-transparent to-black/70" />

      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-24"
        style={{
          background: "linear-gradient(to top, rgba(0,0,0,0.82), rgba(0,0,0,0.35), transparent)",
        }}
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-300/90">
          {t("spotMapIntro.eyebrow")}
        </p>
        <p className="mt-2 text-2xl font-semibold text-white">{stageLabel}</p>
      </div>

      <button
        type="button"
        onClick={handleSkip}
        className="absolute right-4 z-20 rounded-full bg-black/55 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/20 backdrop-blur-md transition hover:bg-black/70"
        style={{ top: "max(0.85rem, env(safe-area-inset-top))" }}
      >
        {t("spotMapIntro.skip")}
      </button>

      <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
        {!mapReady && !fadingOut ? (
          <div className="rounded-full bg-black/35 p-3 backdrop-blur-sm">
            <Loader2 className="h-5 w-5 animate-spin text-white/70" aria-hidden />
          </div>
        ) : null}
      </div>

      <style jsx global>{`
        .spot-map-intro-pin {
          position: relative;
          width: 28px;
          height: 28px;
        }

        .spot-map-intro-pin__dot {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 14px;
          height: 14px;
          transform: translate(-50%, -50%);
          border-radius: 9999px;
          background: #22d3ee;
          box-shadow: 0 0 18px rgba(34, 211, 238, 0.75);
        }

        .spot-map-intro-pin__pulse {
          position: absolute;
          inset: 0;
          border-radius: 9999px;
          background: rgba(34, 211, 238, 0.28);
          animation: spot-map-intro-pulse 1.6s ease-out infinite;
        }

        @keyframes spot-map-intro-pulse {
          0% {
            transform: scale(0.55);
            opacity: 0.95;
          }
          100% {
            transform: scale(2.2);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
