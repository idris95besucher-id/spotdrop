/**
 * Video integrity diagnostics for the Spot create → upload → playback pipeline.
 *
 * Use console filter: `[Video integrity]`
 *
 * Proves whether corruption happens during recording, export, upload, download, or playback
 * by hashing bytes and inspecting MP4 structure (fragmented / VFR signals).
 */

export type Mp4IntegrityReport = {
  sizeBytes: number;
  hasFtyp: boolean;
  hasMoov: boolean;
  hasMoof: boolean;
  hasMdat: boolean;
  isFragmented: boolean;
  moovOffset: number | null;
  firstMoofOffset: number | null;
  /** Distinct sample-delta values found in stts / trun (1 = likely CFR). */
  distinctSampleDeltas: number | null;
  /** Heuristic: more than one distinct delta ⇒ variable timing / VFR-like. */
  likelyVariableTiming: boolean | null;
  brands: string[];
};

export type VideoIntegrityStage =
  | "camera-recording"
  | "publish-prepare"
  | "upload-source"
  | "upload-remote-verify"
  | "playback-local"
  | "playback-remote";

function readFourCc(view: DataView, offset: number) {
  if (offset + 4 > view.byteLength) {
    return "";
  }

  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3)
  );
}

function readBoxSize(view: DataView, offset: number) {
  if (offset + 8 > view.byteLength) {
    return null;
  }

  let size = view.getUint32(offset);

  if (size === 1) {
    if (offset + 16 > view.byteLength) {
      return null;
    }

    const high = view.getUint32(offset + 8);
    const low = view.getUint32(offset + 12);

    if (high !== 0) {
      return null;
    }

    size = low;
  } else if (size === 0) {
    size = view.byteLength - offset;
  }

  if (size < 8 || offset + size > view.byteLength) {
    return null;
  }

  return size;
}

function collectBoxes(
  buffer: ArrayBuffer,
  start: number,
  end: number,
  depth: number,
  visit: (type: string, offset: number, size: number, headerSize: number) => void
) {
  if (depth > 12) {
    return;
  }

  const view = new DataView(buffer);
  let offset = start;

  while (offset + 8 <= end) {
    const size = readBoxSize(view, offset);

    if (!size) {
      break;
    }

    const type = readFourCc(view, offset + 4);
    const headerSize = view.getUint32(offset) === 1 ? 16 : 8;
    visit(type, offset, size, headerSize);

    const contentStart = offset + headerSize;
    const contentEnd = offset + size;

    if (
      type === "moov" ||
      type === "trak" ||
      type === "mdia" ||
      type === "minf" ||
      type === "stbl" ||
      type === "moof" ||
      type === "traf"
    ) {
      collectBoxes(buffer, contentStart, contentEnd, depth + 1, visit);
    }

    offset = contentEnd;
  }
}

function readSttsDistinctDeltas(view: DataView, contentStart: number, contentEnd: number) {
  // stts: version/flags (4) + entry_count (4) + entries [sample_count (4), sample_delta (4)]
  if (contentStart + 8 > contentEnd) {
    return null;
  }

  const entryCount = view.getUint32(contentStart + 4);
  const deltas = new Set<number>();
  let cursor = contentStart + 8;

  for (let index = 0; index < entryCount && cursor + 8 <= contentEnd; index += 1) {
    const sampleDelta = view.getUint32(cursor + 4);
    deltas.add(sampleDelta);
    cursor += 8;
  }

  return deltas.size > 0 ? deltas.size : null;
}

function readTrunDistinctDeltas(view: DataView, contentStart: number, contentEnd: number) {
  if (contentStart + 8 > contentEnd) {
    return null;
  }

  const version = view.getUint8(contentStart);
  const flags = (view.getUint8(contentStart + 1) << 16) |
    (view.getUint8(contentStart + 2) << 8) |
    view.getUint8(contentStart + 3);
  const sampleCount = view.getUint32(contentStart + 4);
  let cursor = contentStart + 8;

  if (flags & 0x000001) {
    cursor += 4; // data_offset
  }

  if (flags & 0x000004) {
    cursor += 4; // first_sample_flags
  }

  const hasDuration = Boolean(flags & 0x000100);
  const hasSize = Boolean(flags & 0x000200);
  const hasFlags = Boolean(flags & 0x000400);
  const hasCts = Boolean(flags & 0x000800);
  const sampleSize =
    (hasDuration ? 4 : 0) + (hasSize ? 4 : 0) + (hasFlags ? 4 : 0) + (hasCts ? 4 : 0);

  if (!hasDuration || sampleSize === 0) {
    void version;
    return null;
  }

  const deltas = new Set<number>();

  for (let index = 0; index < sampleCount && cursor + sampleSize <= contentEnd; index += 1) {
    deltas.add(view.getUint32(cursor));
    cursor += sampleSize;
  }

  return deltas.size > 0 ? deltas.size : null;
}

/** Inspect ISO BMFF / MP4 structure for fragmentation and variable sample timing. */
export async function analyzeMp4Integrity(file: Blob): Promise<Mp4IntegrityReport | null> {
  if (file.size < 16) {
    return null;
  }

  // Cap parse size — MediaRecorder outputs are typically well under this; truncate safely.
  const maxBytes = Math.min(file.size, 12 * 1024 * 1024);
  const buffer = await file.slice(0, maxBytes).arrayBuffer();
  const view = new DataView(buffer);

  let hasFtyp = false;
  let hasMoov = false;
  let hasMoof = false;
  let hasMdat = false;
  let moovOffset: number | null = null;
  let firstMoofOffset: number | null = null;
  const brands: string[] = [];
  const distinctDeltas: number[] = [];

  collectBoxes(buffer, 0, buffer.byteLength, 0, (type, offset, size, headerSize) => {
    if (type === "ftyp") {
      hasFtyp = true;
      const brand = readFourCc(view, offset + headerSize);
      const compatible = readFourCc(view, offset + headerSize + 8);

      if (brand) {
        brands.push(brand);
      }

      if (compatible) {
        brands.push(compatible);
      }
    }

    if (type === "moov") {
      hasMoov = true;
      moovOffset = offset;
    }

    if (type === "moof") {
      hasMoof = true;

      if (firstMoofOffset == null) {
        firstMoofOffset = offset;
      }
    }

    if (type === "mdat") {
      hasMdat = true;
    }

    if (type === "stts") {
      const count = readSttsDistinctDeltas(view, offset + headerSize, offset + size);

      if (count != null) {
        distinctDeltas.push(count);
      }
    }

    if (type === "trun") {
      const count = readTrunDistinctDeltas(view, offset + headerSize, offset + size);

      if (count != null) {
        distinctDeltas.push(count);
      }
    }
  });

  const maxDistinct = distinctDeltas.length > 0 ? Math.max(...distinctDeltas) : null;

  return {
    sizeBytes: file.size,
    hasFtyp,
    hasMoov,
    hasMoof,
    hasMdat,
    isFragmented: hasMoof,
    moovOffset,
    firstMoofOffset,
    distinctSampleDeltas: maxDistinct,
    likelyVariableTiming: maxDistinct == null ? null : maxDistinct > 1,
    brands: [...new Set(brands)],
  };
}

export async function hashBlobSha256(blob: Blob): Promise<string | null> {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    return null;
  }

  try {
    const buffer = await blob.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

export function logVideoIntegrity(
  stage: VideoIntegrityStage,
  payload: Record<string, unknown>
) {
  console.log("[Video integrity]", stage, payload);
}

export async function diagnoseVideoBlob(stage: VideoIntegrityStage, blob: Blob, extra?: Record<string, unknown>) {
  const [sha256, mp4] = await Promise.all([hashBlobSha256(blob), analyzeMp4Integrity(blob)]);

  logVideoIntegrity(stage, {
    sha256,
    sizeBytes: blob.size,
    mimeType: blob.type || null,
    mp4,
    ...extra,
  });

  return { sha256, mp4 };
}

/**
 * Download the published object and compare SHA-256 to the local upload bytes.
 * Proves whether Supabase Storage mutated the file.
 */
export async function verifyRemoteVideoMatchesSource(
  publicUrl: string,
  sourceFile: File
): Promise<{
  matched: boolean | null;
  sourceSha256: string | null;
  remoteSha256: string | null;
  sourceSize: number;
  remoteSize: number | null;
  error: string | null;
}> {
  const sourceSha256 = await hashBlobSha256(sourceFile);

  try {
    const response = await fetch(publicUrl, { cache: "no-store" });

    if (!response.ok) {
      const result = {
        matched: null as boolean | null,
        sourceSha256,
        remoteSha256: null as string | null,
        sourceSize: sourceFile.size,
        remoteSize: null as number | null,
        error: `HTTP ${response.status}`,
      };
      logVideoIntegrity("upload-remote-verify", result);
      return result;
    }

    const remoteBlob = await response.blob();
    const remoteSha256 = await hashBlobSha256(remoteBlob);
    const matched =
      sourceSha256 != null && remoteSha256 != null ? sourceSha256 === remoteSha256 : null;

    const result = {
      matched,
      sourceSha256,
      remoteSha256,
      sourceSize: sourceFile.size,
      remoteSize: remoteBlob.size,
      error: null as string | null,
    };

    logVideoIntegrity("upload-remote-verify", {
      ...result,
      byteIdentityProven: matched === true,
      corruptionDuringUploadOrStorage: matched === false,
    });

    return result;
  } catch (caught) {
    const result = {
      matched: null as boolean | null,
      sourceSha256,
      remoteSha256: null as string | null,
      sourceSize: sourceFile.size,
      remoteSize: null as number | null,
      error: caught instanceof Error ? caught.message : String(caught),
    };
    logVideoIntegrity("upload-remote-verify", result);
    return result;
  }
}
