"use client";

import { useEffect, useState } from "react";
import { canSeeOnlineStatus } from "@/lib/onlineVisibility";

/** Resolves whether the viewer may see the target user's online / last seen. */
export function useCanSeeOnlineStatus(
  viewerId: string | null | undefined,
  targetUserId: string | null | undefined
) {
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    if (!viewerId || !targetUserId) {
      setAllowed(null);
      return;
    }

    let cancelled = false;
    setAllowed(null);

    void canSeeOnlineStatus(viewerId, targetUserId).then((result) => {
      if (!cancelled) {
        setAllowed(result);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [viewerId, targetUserId]);

  return allowed;
}
