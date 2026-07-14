import { registerPlugin, Capacitor } from "@capacitor/core";
import { isCapacitorNative } from "@/lib/capacitorUtils";

export type SpotDropPanoCaptureResult = {
  path: string;
  width: number;
  height: number;
  mimeType: string;
  isPanorama: true;
};

type SpotDropPanoPlugin = {
  isAvailable(): Promise<{ available: boolean; platform?: string }>;
  capturePanorama(options?: Record<string, never>): Promise<SpotDropPanoCaptureResult>;
  cancel(): Promise<void>;
};

const SpotDropPanoNative = registerPlugin<SpotDropPanoPlugin>("SpotDropPano", {
  web: () => ({
    async isAvailable() {
      return { available: false, platform: "web" };
    },
    async capturePanorama() {
      throw new Error("Panorama capture is available in the SpotDrop iPhone app.");
    },
    async cancel() {},
  }),
});

export function isSpotDropPanoNativeAvailable() {
  return isCapacitorNative() && Capacitor.isPluginAvailable("SpotDropPano");
}

export async function checkSpotDropPanoAvailable() {
  if (!isCapacitorNative()) {
    return false;
  }

  try {
    if (!Capacitor.isPluginAvailable("SpotDropPano")) {
      return false;
    }

    const result = await SpotDropPanoNative.isAvailable();
    return Boolean(result.available);
  } catch {
    return false;
  }
}

async function fileFromNativePath(path: string, mimeType: string, fileName: string) {
  const url = Capacitor.convertFileSrc(path);
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Unable to read panorama file.");
  }

  const blob = await response.blob();
  return new File([blob], fileName, { type: mimeType || "image/jpeg" });
}

/** Opens the native iPhone-style panorama camera (no direction selection). */
export async function captureSpotDropPanorama(): Promise<{
  file: File;
  width: number;
  height: number;
}> {
  if (!isCapacitorNative()) {
    throw new Error("Panorama capture is available in the SpotDrop iPhone app.");
  }

  const result = await SpotDropPanoNative.capturePanorama();

  if (!result?.path || result.width < result.height * 1.35) {
    throw new Error("Panorama could not be created. Move more slowly and try again.");
  }

  const file = await fileFromNativePath(
    result.path,
    result.mimeType || "image/jpeg",
    `spotdrop-pano-${Date.now()}.jpg`
  );

  if (file.size < 8_000) {
    throw new Error("Panorama could not be created. Move more slowly and try again.");
  }

  return {
    file,
    width: result.width,
    height: result.height,
  };
}

export async function cancelSpotDropPanorama() {
  if (!isCapacitorNative() || !Capacitor.isPluginAvailable("SpotDropPano")) {
    return;
  }

  try {
    await SpotDropPanoNative.cancel();
  } catch {
    // ignore
  }
}
