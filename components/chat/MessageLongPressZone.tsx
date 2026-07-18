"use client";

import type { ReactNode } from "react";
import { useLongPress } from "@/lib/useLongPress";

type MessageLongPressZoneProps = {
  enabled: boolean;
  onLongPress: () => void;
  children: ReactNode;
};

/**
 * Wraps a single message's rendered bubble so it can respond to long-press without breaking
 * the rules of hooks — this is its own component instance per message (used inside a .map()),
 * so useLongPress here is one hook call per instance, not a hook call inside a loop.
 */
export default function MessageLongPressZone({ enabled, onLongPress, children }: MessageLongPressZoneProps) {
  const { longPressProps, onClickCapture } = useLongPress({ onLongPress, disabled: !enabled });

  return (
    <div {...longPressProps} onClickCapture={onClickCapture} className="select-none touch-manipulation">
      {children}
    </div>
  );
}
