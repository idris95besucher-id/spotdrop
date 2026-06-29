"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  markSpotMapIntroPlayed,
  shouldPlaySpotMapIntro,
  shouldSkipSpotMapIntroCached,
  type SpotMapIntroTarget,
} from "@/lib/spotMapIntro";

export function useSpotMapIntro(
  spotId: string,
  isActive: boolean,
  spot: SpotMapIntroTarget,
  mediaType: "image" | "video" | null
) {
  const eligible = useMemo(
    () => shouldPlaySpotMapIntro(spot, mediaType),
    [
      mediaType,
      spot.content_kind,
      spot.spot_latitude,
      spot.spot_longitude,
      spot.visibility,
    ]
  );

  const [introFinished, setIntroFinished] = useState(() => {
    if (!eligible || shouldSkipSpotMapIntroCached(spotId)) {
      return true;
    }

    return false;
  });

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const shouldPlay = eligible && !shouldSkipSpotMapIntroCached(spotId);
    setIntroFinished(!shouldPlay);
  }, [eligible, isActive, spotId]);

  const finishIntro = useCallback(() => {
    markSpotMapIntroPlayed(spotId);
    setIntroFinished(true);
  }, [spotId]);

  const showIntro = isActive && eligible && !introFinished;

  return {
    showIntro,
    introFinished,
    finishIntro,
  };
}
