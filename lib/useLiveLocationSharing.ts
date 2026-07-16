import { useCallback, useEffect, useRef, useState } from "react";
import type { PluginListenerHandle } from "@capacitor/core";
import SpotDropLocation from "@/lib/spotDropLocation";
import { requestCheckSpotGpsReading } from "@/lib/checkSpotGps";

const LIVE_LOCATION_INTERVAL_SECONDS = 15;
/** Safety cap so a forgotten live-location share doesn't broadcast forever; matches WhatsApp's longest option. */
const LIVE_LOCATION_SAFETY_DURATION_MS = 8 * 60 * 60 * 1000;

export type LiveLocationSendResult = { messageId: string | null; error: string | null };

export function useLiveLocationSharing(options: {
  sendInitial: (latitude: number, longitude: number, expiresAt: string) => Promise<LiveLocationSendResult>;
  updateExisting: (
    messageId: string,
    latitude: number,
    longitude: number,
    expiresAt: string
  ) => Promise<{ error: string | null }>;
}) {
  const [isSharing, setIsSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messageIdRef = useRef<string | null>(null);
  const expiresAtRef = useRef<string | null>(null);
  const listenersRef = useRef<PluginListenerHandle[]>([]);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const stop = useCallback(async () => {
    setIsSharing(false);
    messageIdRef.current = null;
    expiresAtRef.current = null;

    for (const listener of listenersRef.current) {
      await listener.remove();
    }
    listenersRef.current = [];

    try {
      await SpotDropLocation.stopSharing();
    } catch {
      // best-effort cleanup
    }
  }, []);

  const start = useCallback(async () => {
    setError(null);

    const { reading, error: gpsError } = await requestCheckSpotGpsReading();

    if (!reading) {
      setError(gpsError ?? "Unable to detect your location.");
      return;
    }

    const expiresAt = new Date(Date.now() + LIVE_LOCATION_SAFETY_DURATION_MS).toISOString();
    const { messageId, error: sendError } = await optionsRef.current.sendInitial(
      reading.latitude,
      reading.longitude,
      expiresAt
    );

    if (!messageId) {
      setError(sendError ?? "Unable to share location.");
      return;
    }

    messageIdRef.current = messageId;
    expiresAtRef.current = expiresAt;
    setIsSharing(true);

    const updateListener = await SpotDropLocation.addListener("locationUpdate", (update) => {
      const currentMessageId = messageIdRef.current;
      const currentExpiresAt = expiresAtRef.current;

      if (!currentMessageId || !currentExpiresAt) {
        return;
      }

      void optionsRef.current.updateExisting(currentMessageId, update.latitude, update.longitude, currentExpiresAt);
    });

    const errorListener = await SpotDropLocation.addListener("locationError", (locationError) => {
      setError(locationError.message);
    });

    listenersRef.current = [updateListener, errorListener];

    try {
      await SpotDropLocation.startSharing({ intervalSeconds: LIVE_LOCATION_INTERVAL_SECONDS });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to start live location.");
      await stop();
    }
  }, [stop]);

  useEffect(() => {
    return () => {
      void stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { isSharing, error, start, stop };
}
