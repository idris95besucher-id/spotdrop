import { validateCheckSpotCoordinates } from "@/lib/checkSpotGps";
import type { TranslationKey } from "@/lib/i18n/messages";
import { haversineKm } from "@/lib/spotLocation";

type TranslateFn = (key: TranslationKey, values?: Record<string, string | number>) => string;

export function haversineDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  return haversineKm(lat1, lng1, lat2, lng2);
}

export function formatApproximateDistanceKm(distanceKm: number, t?: TranslateFn) {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) {
    return null;
  }

  if (distanceKm < 0.001) {
    return t ? t("checkspot.distance.lessThan100m") : "Less than 100 m away";
  }

  if (distanceKm < 1) {
    const meters = Math.max(1, Math.round(distanceKm * 1000));

    if (meters < 100) {
      return t ? t("checkspot.distance.lessThan100m") : "Less than 100 m away";
    }

    return t ? t("checkspot.distance.meters", { distance: meters }) : `${meters} m away`;
  }

  const roundedKm = Math.round(distanceKm * 10) / 10;
  const displayKm = Number.isInteger(roundedKm) ? roundedKm : roundedKm;

  return t
    ? t("checkspot.distance.kilometers", { distance: displayKm })
    : `${displayKm} km away`;
}

export function hasTrustedCheckSpotDistance(share: {
  status: string;
  distance_km?: number | null;
}) {
  return share.status === "accepted" && share.distance_km != null && Number.isFinite(share.distance_km);
}

export function formatCheckSpotShareDistanceLabel(
  share: {
    status: string;
    distance_km?: number | null;
  },
  t: TranslateFn
) {
  if (share.status !== "accepted") {
    return null;
  }

  if (hasTrustedCheckSpotDistance(share)) {
    return formatApproximateDistanceKm(share.distance_km!, t);
  }

  return t("checkspot.distanceUnavailable");
}

export function calculateCheckSpotDistanceKm(input: {
  shareId?: string;
  senderLatitude: number;
  senderLongitude: number;
  receiverLatitude: number;
  receiverLongitude: number;
}): number | null {
  const senderValidated = validateCheckSpotCoordinates(input.senderLatitude, input.senderLongitude);
  const receiverValidated = validateCheckSpotCoordinates(input.receiverLatitude, input.receiverLongitude);

  if (!senderValidated.ok) {
    console.error("[CheckSpot] rejected stale/invalid coords", {
      shareId: input.shareId,
      role: "sender",
      latitude: input.senderLatitude,
      longitude: input.senderLongitude,
      reason: senderValidated.reason,
    });

    return null;
  }

  if (!receiverValidated.ok) {
    console.error("[CheckSpot] rejected stale/invalid coords", {
      shareId: input.shareId,
      role: "receiver",
      latitude: input.receiverLatitude,
      longitude: input.receiverLongitude,
      reason: receiverValidated.reason,
    });

    return null;
  }

  const distanceKm = haversineDistanceKm(
    senderValidated.latitude,
    senderValidated.longitude,
    receiverValidated.latitude,
    receiverValidated.longitude
  );

  console.log("[CheckSpot] distance calculated", {
    shareId: input.shareId,
    distanceKm,
    sender: {
      latitude: senderValidated.latitude,
      longitude: senderValidated.longitude,
    },
    receiver: {
      latitude: receiverValidated.latitude,
      longitude: receiverValidated.longitude,
    },
  });

  return distanceKm;
}
