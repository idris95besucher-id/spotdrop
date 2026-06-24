# Native iOS Camera Plan (AVFoundation)

**Status:** Planned — not implemented.  
**Prerequisite:** WebView `getUserMedia` + `MediaRecorder` path must be stable on Capacitor iOS first.

## Why a native plugin later

| Limitation (current WebView camera) | Native AVFoundation benefit |
|-----------------------------------|----------------------------|
| `MediaRecorder` final seconds can truncate on iOS WKWebView | `AVAssetWriter` with explicit finish semantics |
| No true optical zoom in recording file (CSS preview only) | `videoZoomFactor` on `AVCaptureDevice` |
| Torch / focus / exposure via `applyConstraints` restarts pipeline | Direct device APIs, no WebRTC layer |
| Single shared camera session with web preview | Dedicated capture session + preview layer |
| Codec/container chosen by WKWebView | H.264 + AAC MP4, bitrate profiles we control |
| Permission edge cases (muted audio tracks) | Unified mic+camera permission flow |

## Proposed architecture (Phase 2)

```
┌─────────────────────────────────────────────────────────┐
│  SpotInstagramCamera (React)                            │
│  ├─ Web path (default): getUserMedia + MediaRecorder    │
│  └─ Native path (Capacitor): SpotDropCamera plugin      │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  @spotdrop/camera-ios (Capacitor plugin)                │
│  • AVCaptureSession (photo + video)                     │
│  • Preview: UIView layer bridged to web overlay OR      │
│    native fullscreen with JS callbacks only             │
│  • Output: temp MP4/JPEG file URL → File in WebView     │
└─────────────────────────────────────────────────────────┘
```

## Plugin surface (draft API)

```typescript
interface SpotDropCameraPlugin {
  /** Check camera + microphone authorization. */
  checkPermissions(): Promise<PermissionStatus>;

  /** Present native capture UI or headless session for Spot flow. */
  startPreview(options: {
    facing: 'front' | 'back';
    quality: '1080p30';
    audio: boolean;
  }): Promise<void>;

  /** Tap = photo, hold = video (mirror current Spot UX). */
  capturePhoto(): Promise<{ path: string; mimeType: string }>;
  startRecording(): Promise<void>;
  stopRecording(): Promise<{ path: string; mimeType: string; durationMs: number }>;

  stopPreview(): Promise<void>;
}
```

## Implementation phases

### Phase A — Spike (1–2 days)
- Capacitor plugin scaffold in `ios/App/Plugins/SpotDropCamera/`
- Rear camera 1080p30 preview + record to temp MP4 with audio
- Return file path to JS; load as `File` for existing `onCapture` pipeline

### Phase B — Feature parity
- Front/rear switch, torch, hold-to-record, max 60s
- Photo capture at stream resolution
- Hook into `SpotInstagramCamera` behind `isCapacitorNative()` flag

### Phase C — Quality
- Optical zoom 1×–5× during recording (written to file, not CSS)
- H.264 High profile + AAC 256 kbps targets
- Background audio interruption handling

### Phase D — Rollout
- A/B: native vs web on iOS Capacitor
- Fallback to web camera if plugin fails
- No changes to upload / publish pipeline (still receives `File`)

## Non-goals (keep in web layer)

- Spot editor trim, music metadata, drafts
- Upload pipeline / Supabase storage
- Android native camera (evaluate after iOS stable)

## Success criteria before starting Phase A

- [ ] Web camera: no lost last 1–3 seconds on 10 consecutive iOS recordings
- [ ] Web camera: audio present in exported MP4 when mic allowed
- [ ] Web camera: 1080p30 stable without mid-record constraint changes
- [ ] Upload reuses native MP4 without WKWebView re-encode

## Files that would change (future)

- `ios/App/Plugins/SpotDropCamera/` (new)
- `packages/camera-ios/` or inline Capacitor plugin
- `components/SpotInstagramCamera.tsx` — native branch
- `lib/capacitorUtils.ts` — feature flag
- **No changes** to `lib/spotUploadPipeline.ts` if `File` contract preserved
