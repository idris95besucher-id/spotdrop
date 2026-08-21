"use client";

import { useCallback, useState } from "react";
import NavigationAppChooserSheet, {
  type NavigationAppChooserTarget,
} from "@/components/NavigationAppChooserSheet";
import type { NavigationProvider } from "@/lib/navigationApps";

export type { NavigationAppChooserTarget };

/**
 * The one shared entry point for "open this destination in an external maps
 * app" — same flow See Spot already uses. Always shows the "Open with"
 * chooser (Apple/Google/Waze/Yandex/2GIS); a remembered provider (Settings →
 * Navigation app) only makes itself the pre-highlighted default inside that
 * sheet — it never skips the chooser.
 *
 * Callers only provide a destination; render the returned `sheet` once near
 * the root of the component so the chooser has somewhere to portal into.
 */
export function useNavigationAppChooser(onNavigate?: (provider: NavigationProvider) => void) {
  const [target, setTarget] = useState<NavigationAppChooserTarget | null>(null);

  const open = useCallback((next: NavigationAppChooserTarget) => {
    setTarget(next);
  }, []);

  const close = useCallback(() => setTarget(null), []);

  const sheet = <NavigationAppChooserSheet target={target} onClose={close} onNavigate={onNavigate} />;

  return { open, close, sheet };
}
