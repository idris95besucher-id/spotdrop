import type { Map as MapLibreMap } from "maplibre-gl";
import { resolveMapLngLat } from "@/lib/mapMarkerCoords";
import { resolveSpotMapLngLat } from "@/lib/mapSpotPin";
import type { MapSpotPin } from "@/lib/spots";
import type { LiveMapUser } from "@/lib/userLiveLocation";

/** Half-width of the live-user avatar tap target (`.spot-live-share-marker-anchor`). */
export const MAP_LIVE_USER_MARKER_HALF_PX = 24;

/** Half-width of the Spot pin tap target (52px face + 6px padding each side). */
export const MAP_SPOT_MARKER_HALF_PX = 32;

/** Minimum visible gap between user and Spot tap areas when co-located. */
export const MAP_MARKER_MIN_GAP_PX = 16;

/**
 * Screen-pixel distance between natural marker centers that triggers separation.
 * Anything closer than user-half + Spot-half + min gap would visually touch/overlap.
 */
export const MAP_MARKER_OVERLAP_THRESHOLD_PX =
  MAP_LIVE_USER_MARKER_HALF_PX + MAP_SPOT_MARKER_HALF_PX + MAP_MARKER_MIN_GAP_PX;

/**
 * Horizontal offset from the shared point for each marker so the gap between
 * tap areas is at least {@link MAP_MARKER_MIN_GAP_PX}.
 * Center distance = 2 * offset = userHalf + spotHalf + gap.
 */
export const MAP_MARKER_PAIR_OFFSET_PX = Math.ceil(
  (MAP_LIVE_USER_MARKER_HALF_PX + MAP_SPOT_MARKER_HALF_PX + MAP_MARKER_MIN_GAP_PX) / 2
);

/** Vertical step when several users or Spots share one mixed cluster. */
export const MAP_MARKER_PAIR_STACK_PX = 56;

/** Zoom level at which overlapping mixed markers spiderfy instead of combining. */
export const MAP_MARKER_SPIDERFY_MIN_ZOOM = 16;

/** Radial offset (px) used when spiderfying a mixed cluster. */
export const MAP_MARKER_SPIDERFY_RADIUS_PX = 44;

export type MapOverlapCluster = {
  id: string;
  longitude: number;
  latitude: number;
  users: LiveMapUser[];
  spots: MapSpotPin[];
};

type OverlapPoint =
  | {
      key: string;
      kind: "user";
      longitude: number;
      latitude: number;
      user: LiveMapUser;
    }
  | {
      key: string;
      kind: "spot";
      longitude: number;
      latitude: number;
      pin: MapSpotPin;
    };

function pixelDistance(
  map: MapLibreMap,
  a: { longitude: number; latitude: number },
  b: { longitude: number; latitude: number }
) {
  const pa = map.project([a.longitude, a.latitude]);
  const pb = map.project([b.longitude, b.latitude]);
  const dx = pa.x - pb.x;
  const dy = pa.y - pb.y;
  return Math.hypot(dx, dy);
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

export function buildMapOverlapClusterId(users: LiveMapUser[], spots: MapSpotPin[]) {
  const userIds = users.map((user) => user.user_id).sort();
  const spotIds = spots.map((spot) => spot.id).sort();
  return `u:${userIds.join(",")}|s:${spotIds.join(",")}`;
}

/**
 * Groups live users + Spot pins that sit within `thresholdPx` on screen.
 * Only mixed groups (at least one user and one Spot) become clusters —
 * same-type-only overlaps stay as individual markers.
 */
export function buildMixedMapOverlapClusters(
  map: MapLibreMap,
  liveUsers: LiveMapUser[],
  spots: MapSpotPin[],
  thresholdPx: number = MAP_MARKER_OVERLAP_THRESHOLD_PX
): {
  clusters: MapOverlapCluster[];
  freeUsers: LiveMapUser[];
  freeSpots: MapSpotPin[];
} {
  const points: OverlapPoint[] = [];

  for (const user of liveUsers) {
    const lngLat = resolveMapLngLat(user.latitude, user.longitude, {
      kind: "live-user",
      id: user.user_id,
    });

    if (!lngLat) {
      continue;
    }

    points.push({
      key: `user:${user.user_id}`,
      kind: "user",
      longitude: lngLat[0],
      latitude: lngLat[1],
      user,
    });
  }

  for (const pin of spots) {
    const lngLat = resolveSpotMapLngLat(pin);

    if (!lngLat) {
      continue;
    }

    points.push({
      key: `spot:${pin.id}`,
      kind: "spot",
      longitude: lngLat[0],
      latitude: lngLat[1],
      pin,
    });
  }

  const parent = points.map((_, index) => index);
  const rank = points.map(() => 0);

  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const left = points[i]!;
      const right = points[j]!;

      if (pixelDistance(map, left, right) <= thresholdPx) {
        union(parent, rank, i, j);
      }
    }
  }

  const groups = new Map<number, OverlapPoint[]>();

  for (let i = 0; i < points.length; i += 1) {
    const root = findRoot(parent, i);
    const list = groups.get(root) ?? [];
    list.push(points[i]!);
    groups.set(root, list);
  }

  const clusters: MapOverlapCluster[] = [];
  const clusteredUserIds = new Set<string>();
  const clusteredSpotIds = new Set<string>();

  for (const group of groups.values()) {
    const users = group.filter((point) => point.kind === "user").map((point) => point.user);
    const groupSpots = group.filter((point) => point.kind === "spot").map((point) => point.pin);

    if (users.length === 0 || groupSpots.length === 0) {
      continue;
    }

    let longitude = 0;
    let latitude = 0;

    for (const point of group) {
      longitude += point.longitude;
      latitude += point.latitude;
    }

    longitude /= group.length;
    latitude /= group.length;

    for (const user of users) {
      clusteredUserIds.add(user.user_id);
    }

    for (const spot of groupSpots) {
      clusteredSpotIds.add(spot.id);
    }

    clusters.push({
      id: buildMapOverlapClusterId(users, groupSpots),
      longitude,
      latitude,
      users,
      spots: groupSpots,
    });
  }

  return {
    clusters,
    // Only users/spots with valid geographic coords may become free markers.
    // Invalid coords are skipped above (not clustered) and must not fall through as 0,0 UI pins.
    freeUsers: liveUsers.filter(
      (user) =>
        !clusteredUserIds.has(user.user_id) &&
        resolveMapLngLat(user.latitude, user.longitude, {
          kind: "live-user",
          id: user.user_id,
        }) !== null
    ),
    freeSpots: spots.filter(
      (spot) => !clusteredSpotIds.has(spot.id) && resolveSpotMapLngLat(spot) !== null
    ),
  };
}

/** Evenly spaced lng/lat offsets around a center for spiderfy layout. */
export function buildSpiderfyLngLats(
  map: MapLibreMap,
  center: { longitude: number; latitude: number },
  count: number,
  radiusPx: number = MAP_MARKER_SPIDERFY_RADIUS_PX
): Array<{ longitude: number; latitude: number }> {
  if (count <= 0) {
    return [];
  }

  if (count === 1) {
    return [{ longitude: center.longitude, latitude: center.latitude }];
  }

  const origin = map.project([center.longitude, center.latitude]);
  const results: Array<{ longitude: number; latitude: number }> = [];

  for (let index = 0; index < count; index += 1) {
    const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
    const point = {
      x: origin.x + Math.cos(angle) * radiusPx,
      y: origin.y + Math.sin(angle) * radiusPx,
    };
    const lngLat = map.unproject([point.x, point.y]);
    results.push({ longitude: lngLat.lng, latitude: lngLat.lat });
  }

  return results;
}

export function shouldSpiderfyOverlapClusters(zoom: number) {
  return zoom >= MAP_MARKER_SPIDERFY_MIN_ZOOM;
}

export function offsetLngLatByPixels(
  map: MapLibreMap,
  center: { longitude: number; latitude: number },
  dxPx: number,
  dyPx: number
) {
  const origin = map.project([center.longitude, center.latitude]);
  const lngLat = map.unproject([origin.x + dxPx, origin.y + dyPx]);
  return { longitude: lngLat.lng, latitude: lngLat.lat };
}

/**
 * Screen-space separation for mixed user+Spot overlaps: users left, Spots right.
 * Offsets are in pixels so the gap stays constant at every zoom level.
 */
export function buildSideBySideClusterLayout(
  map: MapLibreMap,
  cluster: MapOverlapCluster,
  offsetPx: number = MAP_MARKER_PAIR_OFFSET_PX,
  stackPx: number = MAP_MARKER_PAIR_STACK_PX
): Array<
  | {
      key: string;
      kind: "user";
      user: LiveMapUser;
      longitude: number;
      latitude: number;
    }
  | {
      key: string;
      kind: "spot";
      pin: MapSpotPin;
      longitude: number;
      latitude: number;
    }
> {
  const center = { longitude: cluster.longitude, latitude: cluster.latitude };
  const items: Array<
    | {
        key: string;
        kind: "user";
        user: LiveMapUser;
        longitude: number;
        latitude: number;
      }
    | {
        key: string;
        kind: "spot";
        pin: MapSpotPin;
        longitude: number;
        latitude: number;
      }
  > = [];

  const userCount = cluster.users.length;
  cluster.users.forEach((user, index) => {
    const dy = userCount <= 1 ? 0 : (index - (userCount - 1) / 2) * stackPx;
    const position = offsetLngLatByPixels(map, center, -offsetPx, dy);
    items.push({
      key: `user:${user.user_id}`,
      kind: "user",
      user,
      longitude: position.longitude,
      latitude: position.latitude,
    });
  });

  const spotCount = cluster.spots.length;
  cluster.spots.forEach((pin, index) => {
    const dy = spotCount <= 1 ? 0 : (index - (spotCount - 1) / 2) * stackPx;
    const position = offsetLngLatByPixels(map, center, offsetPx, dy);
    items.push({
      key: `spot:${pin.id}`,
      kind: "spot",
      pin,
      longitude: position.longitude,
      latitude: position.latitude,
    });
  });

  return items;
}
