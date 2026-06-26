"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type DmComposerPortalProps = {
  children: ReactNode;
};

/** Portals DM composer to document.body so fixed positioning is not clipped. */
export default function DmComposerPortal({ children }: DmComposerPortalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return createPortal(children, document.body);
}
