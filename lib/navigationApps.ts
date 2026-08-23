import { Capacitor } from "@capacitor/core";
import { isIOSDevice } from "@/lib/pickMediaFromGallery";
import { openGoogleMapsAtCoordinates, openGoogleMapsAtQuery } from "@/lib/externalMaps";
import { openExternalAppUrl } from "@/lib/externalAppLaunch";

/** Every navigation app SpotDrop can hand a Spot's coordinates to. */
export type NavigationProvider = "apple" | "google" | "waze" | "yandex" | "2gis";

/** Device-local preference: a specific provider, or "ask" to show the chooser every time. */
export type NavigationAppPreference = NavigationProvider | "ask";

export const DEFAULT_NAVIGATION_APP_PREFERENCE: NavigationAppPreference = "ask";

const NAVIGATION_PROVIDERS: NavigationProvider[] = ["apple", "google", "waze", "yandex", "2gis"];

export type NavigationProviderOption = {
  id: NavigationProvider;
  /** Proper noun — intentionally not translated. */
  label: string;
};

/** Display order in the chooser and the settings dropdown. */
export const NAVIGATION_PROVIDER_OPTIONS: NavigationProviderOption[] = [
  { id: "apple", label: "Apple Maps" },
  { id: "google", label: "Google Maps" },
  { id: "waze", label: "Waze" },
  { id: "yandex", label: "Yandex Maps" },
  { id: "2gis", label: "2GIS" },
];

export function isNavigationProvider(value: string): value is NavigationProvider {
  return (NAVIGATION_PROVIDERS as string[]).includes(value);
}

/**
 * Puts the remembered provider first so it's the fastest to tap, without ever
 * removing the other options — the chooser always shows all providers.
 */
export function getOrderedNavigationProviderOptions(
  preferredProvider: NavigationProvider | null
): NavigationProviderOption[] {
  if (!preferredProvider) {
    return NAVIGATION_PROVIDER_OPTIONS;
  }

  const preferred = NAVIGATION_PROVIDER_OPTIONS.find((option) => option.id === preferredProvider);

  if (!preferred) {
    return NAVIGATION_PROVIDER_OPTIONS;
  }

  return [preferred, ...NAVIGATION_PROVIDER_OPTIONS.filter((option) => option.id !== preferredProvider)];
}

export function isNavigationAppPreference(value: string): value is NavigationAppPreference {
  return value === "ask" || isNavigationProvider(value);
}

/**
 * Where to send a navigation app. Coordinates are preferred when present;
 * `label`/`address` are the fallback free-text query used when they aren't
 * (e.g. a Spot with no captured GPS fix, only a street address).
 */
export type NavigationDestination = {
  latitude?: number | null;
  longitude?: number | null;
  label?: string | null;
  address?: string | null;
};

function destinationCoordinates(destination: NavigationDestination): { lat: number; lng: number } | null {
  const lat = Number(destination.latitude);
  const lng = Number(destination.longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return { lat, lng };
}

function destinationQuery(destination: NavigationDestination): string | null {
  return destination.label?.trim() || destination.address?.trim() || null;
}

/**
 * Tries a native app URL scheme first, falls back to the web URL if the
 * scheme didn't take over the page within `cutoffMs` — same technique
 * already proven in production for Google Maps (see externalMaps.ts).
 *
 * Inside the installed Capacitor app, this timer-race approach never
 * actually works: `window.location.href` navigation to an external scheme
 * or cross-origin URL is unreliable from inside the WKWebView sandbox, so
 * "Open in Maps" did nothing there. AppLauncher.openUrl calls
 * UIApplication.open directly, bypassing the webview, and reports real
 * success/failure — used instead whenever running as a native app.
 */
function raceNativeSchemeThenWeb(appUrl: string, webUrl: string, timeoutMs = 700, cutoffMs = 1600) {
  if (Capacitor.isNativePlatform()) {
    void openExternalAppUrl(appUrl, webUrl);
    return;
  }

  const startedAt = Date.now();
  window.location.href = appUrl;

  window.setTimeout(() => {
    if (Date.now() - startedAt < cutoffMs) {
      window.location.href = webUrl;
    }
  }, timeoutMs);
}

function openViaWebOrRace(appUrl: string | null, webUrl: string) {
  if ((Capacitor.isNativePlatform() || isIOSDevice()) && appUrl) {
    raceNativeSchemeThenWeb(appUrl, webUrl);
    return;
  }

  window.open(webUrl, "_blank", "noopener,noreferrer");
}

/**
 * Apple Maps. The `https://maps.apple.com/...` universal link opens the app
 * directly when tapped in a regular browser (mobile Safari included), no
 * scheme probing needed there. Inside the installed Capacitor app, that
 * same universal-link navigation is unreliable via `window.location.href`
 * (see raceNativeSchemeThenWeb) — `maps://` is Apple Maps' own long-standing
 * custom URL scheme, accepting the same `daddr`/`ll`/`q` params, and is used
 * as the native-launch target there instead. Falls back to a free-text
 * `daddr` when there are no coordinates, in both cases.
 */
function openAppleMaps(destination: NavigationDestination) {
  const coords = destinationCoordinates(destination);
  const query = destinationQuery(destination);

  let path: string | null = null;

  if (coords) {
    const q = query ? `&q=${encodeURIComponent(query)}` : "";
    path = `?daddr=${coords.lat},${coords.lng}&ll=${coords.lat},${coords.lng}${q}`;
  } else if (query) {
    path = `?daddr=${encodeURIComponent(query)}`;
  }

  if (!path) {
    return;
  }

  const webUrl = `https://maps.apple.com/${path}`;

  if (Capacitor.isNativePlatform()) {
    void openExternalAppUrl(`maps://${path}`, webUrl);
    return;
  }

  window.location.href = webUrl;
}

/**
 * Waze's own universal link opens the app directly when installed and
 * falls back to Waze's website automatically in a regular browser — no
 * scheme race needed there. `q` (free-text) is Waze's documented fallback
 * when there's no `ll`. Inside the installed Capacitor app, the same
 * unreliable-webview-navigation issue applies (see raceNativeSchemeThenWeb),
 * so this routes through the native launcher there — using this one URL for
 * both the app-open attempt and the fallback, relying on the OS's own
 * universal-link handling (which `AppLauncher.openUrl` reaches directly,
 * unlike webview navigation) to open the Waze app when installed.
 */
function openWaze(destination: NavigationDestination) {
  const coords = destinationCoordinates(destination);
  const query = destinationQuery(destination);

  let url: string | null = null;

  if (coords) {
    url = `https://waze.com/ul?ll=${coords.lat},${coords.lng}&navigate=yes`;
  } else if (query) {
    url = `https://waze.com/ul?q=${encodeURIComponent(query)}&navigate=yes`;
  }

  if (!url) {
    return;
  }

  if (Capacitor.isNativePlatform()) {
    void openExternalAppUrl(url, url);
    return;
  }

  window.location.href = url;
}

/**
 * Yandex Maps has no confirmed universal-link domain, so this uses the
 * same native-scheme-then-web race as Google Maps. `text` is Yandex's
 * free-text search param, used in place of `pt` when there are no coordinates.
 */
function openYandexMaps(destination: NavigationDestination) {
  const coords = destinationCoordinates(destination);

  if (coords) {
    const webUrl = `https://yandex.com/maps/?pt=${coords.lng},${coords.lat}&z=16&l=map`;
    const appUrl = `yandexmaps://maps.yandex.ru/?pt=${coords.lng},${coords.lat}&z=16&l=map`;
    openViaWebOrRace(appUrl, webUrl);
    return;
  }

  const query = destinationQuery(destination);

  if (query) {
    const webUrl = `https://yandex.com/maps/?text=${encodeURIComponent(query)}`;
    const appUrl = `yandexmaps://maps.yandex.ru/?text=${encodeURIComponent(query)}`;
    openViaWebOrRace(appUrl, webUrl);
  }
}

/**
 * 2GIS has no confirmed universal-link domain either, so this also uses
 * the native-scheme-then-web race. Falls back to its `/search/<query>` path
 * when there are no coordinates.
 */
function open2Gis(destination: NavigationDestination) {
  const coords = destinationCoordinates(destination);

  if (coords) {
    const webUrl = `https://2gis.ru/geo/${coords.lng},${coords.lat}`;
    const appUrl = `dgis://2gis.ru/geo/${coords.lng},${coords.lat}`;
    openViaWebOrRace(appUrl, webUrl);
    return;
  }

  const query = destinationQuery(destination);

  if (query) {
    const webUrl = `https://2gis.ru/search/${encodeURIComponent(query)}`;
    const appUrl = `dgis://2gis.ru/search/${encodeURIComponent(query)}`;
    openViaWebOrRace(appUrl, webUrl);
  }
}

/**
 * Opens `provider` at `destination` — coordinates when available (preferred,
 * most accurate), otherwise a free-text address/place query. Every provider
 * degrades gracefully to a web URL if its app isn't installed — never a
 * crash, never a blank screen (see each provider's function above).
 */
export function openNavigationApp(provider: NavigationProvider, destination: NavigationDestination) {
  if (typeof window === "undefined") {
    return;
  }

  const coords = destinationCoordinates(destination);
  const query = destinationQuery(destination);

  if (!coords && !query) {
    return;
  }

  switch (provider) {
    case "apple":
      openAppleMaps(destination);
      return;
    case "google":
      if (coords) {
        openGoogleMapsAtCoordinates(coords.lat, coords.lng);
      } else if (query) {
        openGoogleMapsAtQuery(query);
      }
      return;
    case "waze":
      openWaze(destination);
      return;
    case "yandex":
      openYandexMaps(destination);
      return;
    case "2gis":
      open2Gis(destination);
      return;
  }
}

/**
 * Recommendation only — never a hard lock. Picks a single top provider per
 * country to badge as "Recommended" in the chooser; the user can always
 * pick a different installed app instead.
 */
const COUNTRY_RECOMMENDED_PROVIDER: Record<string, NavigationProvider> = {
  Switzerland: "google",
  France: "waze",
  Russia: "yandex",
  Kazakhstan: "2gis",
  Belarus: "yandex",
  Uzbekistan: "google",
};

const DEFAULT_RECOMMENDED_PROVIDER: NavigationProvider = "google";

/**
 * Returns `null` (no badge) when the country isn't known — never guesses.
 * When the country IS known but has no explicit rule, falls back to the
 * spec's "Other countries → Google Maps" default.
 */
export function getRecommendedNavigationProvider(country: string | null | undefined): NavigationProvider | null {
  const trimmed = country?.trim();

  if (!trimmed) {
    return null;
  }

  return COUNTRY_RECOMMENDED_PROVIDER[trimmed] ?? DEFAULT_RECOMMENDED_PROVIDER;
}
