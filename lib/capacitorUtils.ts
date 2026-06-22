/** Returns true when the JS runtime is inside a Capacitor native app (not a browser). */
export function isCapacitorNative(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const cap = (
      window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }
    ).Capacitor;
    return !!(cap?.isNativePlatform?.());
  } catch {
    return false;
  }
}
