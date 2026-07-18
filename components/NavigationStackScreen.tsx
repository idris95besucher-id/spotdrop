"use client";

import { useCallback, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { navigateBack } from "@/lib/navigateBack";
import { useInteractiveSwipeBack } from "@/lib/useInteractiveSwipeBack";

type NavigationStackScreenProps = {
  children: ReactNode;
  /** Used only when browser history has no previous entry (deep link). */
  fallbackHref?: string;
  enabled?: boolean;
  className?: string;
};

export default function NavigationStackScreen({
  children,
  fallbackHref,
  enabled = true,
  className = "",
}: NavigationStackScreenProps) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const handleBack = useCallback(() => {
    navigateBack(router, fallbackHref);
  }, [fallbackHref, router]);

  const { panelStyle } = useInteractiveSwipeBack({
    enabled,
    onBack: handleBack,
    targetRef: rootRef,
    panelRef,
  });

  return (
    <div ref={rootRef} className={`relative flex min-h-0 flex-1 flex-col overflow-hidden ${className}`}>
      <div ref={panelRef} style={panelStyle} className="flex min-h-0 flex-1 flex-col">
        {children}
      </div>
    </div>
  );
}
