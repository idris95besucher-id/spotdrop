import type { TranslationKey } from "@/lib/i18n/messages";
import { haversineKm } from "@/lib/spotLocation";

type TranslateFn = (key: TranslationKey, values?: Record<string, string | number>) => string;

export function formatApproximateDistanceKm(distanceKm: number, t?: TranslateFn) {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) {
    return null;
  }

  if (distanceKm < 0.1) {
    return t ? t("checkspot.distance.lessThan100m") : "Less than 100 m away";
  }

  if (distanceKm < 1) {
    const meters = Math.round((distanceKm * 1000) / 50) * 50;
    const clamped = Math.max(meters, 100);

    if (clamped <= 100) {
      return t ? t("checkspot.distance.lessThan100m") : "Less than 100 m away";
    }

    return t ? t("checkspot.distance.meters", { distance: clamped }) : `${clamped} m away`;
  }

  if (distanceKm < 10) {
    const rounded = Math.round(distanceKm * 10) / 10;

    return t ? t("checkspot.distance.kilometers", { distance: rounded }) : `${rounded} km away`;
  }

  if (distanceKm < 100) {
    const rounded = Math.round(distanceKm);

    return t ? t("checkspot.distance.kilometers", { distance: rounded }) : `${rounded} km away`;
  }

  const rounded = Math.round(distanceKm / 5) * 5;

  return t ? t("checkspot.distance.kilometers", { distance: rounded }) : `${rounded} km away`;
}

export function approximateDistanceBetween(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number,
  t?: TranslateFn
) {
  const km = haversineKm(fromLat, fromLon, toLat, toLon);

  return formatApproximateDistanceKm(km, t);
}
