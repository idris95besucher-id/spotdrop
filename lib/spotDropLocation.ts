import { Capacitor, registerPlugin, WebPlugin, type PluginListenerHandle } from "@capacitor/core";
import { isCapacitorNative } from "@/lib/capacitorUtils";

export type SpotDropLocationUpdate = {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
};

export type SpotDropLocationAuthStatus =
  | "always"
  | "whenInUse"
  | "denied"
  | "restricted"
  | "notDetermined"
  | "unknown";

export interface SpotDropLocationPlugin {
  requestAlwaysPermission(): Promise<{ granted: boolean }>;
  checkStatus(): Promise<{ status: SpotDropLocationAuthStatus }>;
  startSharing(options: { intervalSeconds: number }): Promise<{ started: boolean }>;
  stopSharing(): Promise<void>;
  addListener(
    eventName: "locationUpdate",
    listenerFunc: (update: SpotDropLocationUpdate) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "locationError",
    listenerFunc: (error: { message: string }) => void
  ): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

/**
 * Browser/dev fallback — foreground-only via `navigator.geolocation.watchPosition`. True
 * background tracking is a native-only capability (see SpotDropLocationPlugin.swift); this
 * fallback exists so the JS-side interval/DB-update logic for live location sharing can still
 * be exercised and verified in a regular browser tab, not just on a physical iPhone.
 */
class SpotDropLocationWeb extends WebPlugin implements SpotDropLocationPlugin {
  private watchId: number | null = null;

  async requestAlwaysPermission(): Promise<{ granted: boolean }> {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      return { granted: false };
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        () => resolve({ granted: true }),
        () => resolve({ granted: false }),
        { enableHighAccuracy: true, timeout: 10_000 }
      );
    });
  }

  async checkStatus(): Promise<{ status: SpotDropLocationAuthStatus }> {
    return { status: "whenInUse" };
  }

  async startSharing(options: { intervalSeconds: number }): Promise<{ started: boolean }> {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      return { started: false };
    }

    this.stopWatch();

    this.watchId = navigator.geolocation.watchPosition(
      (position) => {
        void this.notifyListeners("locationUpdate", {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        });
      },
      (error) => {
        void this.notifyListeners("locationError", { message: error.message });
      },
      { enableHighAccuracy: true, maximumAge: Math.max(5000, options.intervalSeconds * 1000) }
    );

    return { started: true };
  }

  async stopSharing(): Promise<void> {
    this.stopWatch();
  }

  private stopWatch() {
    if (this.watchId !== null && typeof navigator !== "undefined") {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }
}

const SpotDropLocationNative = registerPlugin<SpotDropLocationPlugin>("SpotDropLocation", {
  web: () => new SpotDropLocationWeb(),
});

/** True only on a real device build with the native background-location plugin compiled in. */
export function isSpotDropLocationBackgroundCapable() {
  return isCapacitorNative() && Capacitor.isPluginAvailable("SpotDropLocation");
}

export default SpotDropLocationNative;
