import type { Map as MapLibreMap } from "maplibre-gl";
import type { MapMark } from "@/lib/mapMarks";
import { publicProfileUsername } from "@/lib/publicProfile";
import {
  buildSpiderfyLngLats,
  MAP_MARKER_OVERLAP_THRESHOLD_PX,
  MAP_MARKER_SPIDERFY_MIN_ZOOM,
  shouldSpiderfyOverlapClusters,
} from "@/lib/mapMarkerOverlap";

export const MAP_MARK_CLUSTER_THRESHOLD_PX = MAP_MARKER_OVERLAP_THRESHOLD_PX;
export const MAP_MARK_SPIDERFY_MIN_ZOOM = MAP_MARKER_SPIDERFY_MIN_ZOOM;

/** Lucide-style speech bubble (not emoji) for Mark message badge. */
export const MAP_MARK_SPEECH_BUBBLE_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>`;

export type MapMarkCluster = {
  id: string;
  longitude: number;
  latitude: number;
  marks: MapMark[];
};

export function mapMarkAvatarInitial(username: string | null | undefined) {
  const label = publicProfileUsername(username);
  const char = label.charAt(0).toUpperCase();
  return char || "U";
}

export function buildMapMarkClusterId(marks: MapMark[]) {
  return marks
    .map((mark) => mark.id)
    .sort()
    .join("|");
}

function pixelDistance(
  map: MapLibreMap,
  a: { longitude: number; latitude: number },
  b: { longitude: number; latitude: number }
) {
  const pa = map.project([a.longitude, a.latitude]);
  const pb = map.project([b.longitude, b.latitude]);
  return Math.hypot(pa.x - pb.x, pa.y - pb.y);
}

function findRoot(parent: number[], index: number) {
  let current = index;

  while (parent[current] !== current) {
    parent[current] = parent[parent[current]!]!;
    current = parent[current]!;
  }

  return current;
}

function union(parent: number[], rank: number[], a: number, b: number) {
  const rootA = findRoot(parent, a);
  const rootB = findRoot(parent, b);

  if (rootA === rootB) {
    return;
  }

  if (rank[rootA]! < rank[rootB]!) {
    parent[rootA] = rootB;
    return;
  }

  if (rank[rootA]! > rank[rootB]!) {
    parent[rootB] = rootA;
    return;
  }

  parent[rootB] = rootA;
  rank[rootA]! += 1;
}

/**
 * Groups nearby public Marks by screen-pixel proximity.
 * Singletons stay as free marks; groups of 2+ become clusters.
 */
export function buildMapMarkClusters(
  map: MapLibreMap,
  marks: MapMark[],
  thresholdPx: number = MAP_MARK_CLUSTER_THRESHOLD_PX
): {
  clusters: MapMarkCluster[];
  freeMarks: MapMark[];
} {
  const valid = marks.filter(
    (mark) => Number.isFinite(mark.latitude) && Number.isFinite(mark.longitude)
  );

  if (valid.length === 0) {
    return { clusters: [], freeMarks: [] };
  }

  const parent = valid.map((_, index) => index);
  const rank = valid.map(() => 0);

  for (let i = 0; i < valid.length; i += 1) {
    for (let j = i + 1; j < valid.length; j += 1) {
      const left = valid[i]!;
      const right = valid[j]!;

      if (
        pixelDistance(
          map,
          { longitude: left.longitude, latitude: left.latitude },
          { longitude: right.longitude, latitude: right.latitude }
        ) <= thresholdPx
      ) {
        union(parent, rank, i, j);
      }
    }
  }

  const groups = new Map<number, MapMark[]>();

  for (let i = 0; i < valid.length; i += 1) {
    const root = findRoot(parent, i);
    const list = groups.get(root) ?? [];
    list.push(valid[i]!);
    groups.set(root, list);
  }

  const clusters: MapMarkCluster[] = [];
  const freeMarks: MapMark[] = [];

  for (const group of groups.values()) {
    if (group.length === 1) {
      freeMarks.push(group[0]!);
      continue;
    }

    let longitude = 0;
    let latitude = 0;

    for (const mark of group) {
      longitude += mark.longitude;
      latitude += mark.latitude;
    }

    clusters.push({
      id: buildMapMarkClusterId(group),
      longitude: longitude / group.length,
      latitude: latitude / group.length,
      marks: group,
    });
  }

  return { clusters, freeMarks };
}

export function buildMapMarkSpiderfyLngLats(
  map: MapLibreMap,
  center: { longitude: number; latitude: number },
  count: number
) {
  return buildSpiderfyLngLats(map, center, count);
}

export function shouldSpiderfyMapMarkClusters(zoom: number) {
  return shouldSpiderfyOverlapClusters(zoom);
}
