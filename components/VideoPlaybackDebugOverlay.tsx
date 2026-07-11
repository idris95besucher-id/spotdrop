"use client";

import type { VideoPlaybackDebugSnapshot } from "@/lib/videoPlaybackDebug";

type VideoPlaybackDebugOverlayProps = {
  snapshot: VideoPlaybackDebugSnapshot;
};

/** Disabled — diagnostics are console-only in web development. */
export default function VideoPlaybackDebugOverlay(_props: VideoPlaybackDebugOverlayProps) {
  return null;
}
