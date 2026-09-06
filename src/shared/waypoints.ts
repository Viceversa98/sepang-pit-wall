/** Minimal waypoint type — swap with exported Sepang centerline later. */
export type Waypoint = {
  x: number;
  y: number;
  z: number;
};

/** Demo oval; replace by importing SEPANG_CONTROL_POINTS from the main app. */
export const DEMO_WAYPOINTS: readonly Waypoint[] = [
  { x: 0, y: 0.5, z: 0 },
  { x: 20, y: 0.5, z: 0 },
  { x: 40, y: 0.5, z: 15 },
  { x: 30, y: 0.5, z: 35 },
  { x: 0, y: 0.5, z: 40 },
  { x: -30, y: 0.5, z: 35 },
  { x: -40, y: 0.5, z: 15 },
  { x: -20, y: 0.5, z: 0 },
];

export const distance2D = (a: Waypoint, b: Waypoint): number => {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  return Math.hypot(dx, dz);
};

export const nearestWaypointIndex = (
  waypoints: readonly Waypoint[],
  x: number,
  z: number,
  startIndex: number,
): number => {
  let bestIndex = startIndex;
  let bestDist = Number.POSITIVE_INFINITY;

  for (let i = 0; i < waypoints.length; i++) {
    const index = (startIndex + i) % waypoints.length;
    const wp = waypoints[index];
    const dist = Math.hypot(wp.x - x, wp.z - z);
    if (dist < bestDist) {
      bestDist = dist;
      bestIndex = index;
    }
  }

  return bestIndex;
};

/** Local search only — avoids snapping across the circuit and orbiting a hairpin. */
export const nearestWaypointIndexLocal = (
  waypoints: readonly Waypoint[],
  x: number,
  z: number,
  startIndex: number,
  window = 12,
): number => {
  if (waypoints.length === 0) return 0;
  const n = waypoints.length;
  // Freeze the window center — updating bestIndex inside the loop walked the
  // search around the circuit and parked cars ~100 m off asphalt at lights-out.
  const center = ((startIndex % n) + n) % n;
  let bestIndex = center;
  let bestDist = Number.POSITIVE_INFINITY;

  for (let i = -window; i <= window; i++) {
    const index = (center + i + n * 4) % n;
    const wp = waypoints[index];
    const dist = Math.hypot(wp.x - x, wp.z - z);
    if (dist < bestDist) {
      bestDist = dist;
      bestIndex = index;
    }
  }

  return bestIndex;
};

export const targetWaypointIndex = (
  waypoints: readonly Waypoint[],
  currentIndex: number,
  lookahead = 2,
): number => (currentIndex + lookahead) % waypoints.length;

export type PathFrame = {
  index: number;
  /** Unit tangent along the path (+Z-forward yaw basis). */
  fwdX: number;
  fwdZ: number;
  /** Unit left-of-path normal. */
  sideX: number;
  sideZ: number;
  /** Signed cross-track error (m world units): + = left of centerline. */
  crossTrack: number;
  pathHeading: number;
};

/** Local path frame at the nearest segment for Stanley / lateral clamp. */
export const pathFrameAt = (
  waypoints: readonly Waypoint[],
  x: number,
  z: number,
  startIndex: number,
): PathFrame => {
  const n = waypoints.length;
  const index = nearestWaypointIndexLocal(waypoints, x, z, startIndex, 14);
  const a = waypoints[index];
  const b = waypoints[(index + 1) % n];
  let fwdX = b.x - a.x;
  let fwdZ = b.z - a.z;
  const len = Math.hypot(fwdX, fwdZ) || 1;
  fwdX /= len;
  fwdZ /= len;
  // Match getPoseAt / projectWorldToTrack: side = cross(up, fwd) = (fwdZ, -fwdX).
  const sideX = fwdZ;
  const sideZ = -fwdX;
  const crossTrack = (x - a.x) * sideX + (z - a.z) * sideZ;
  return {
    index,
    fwdX,
    fwdZ,
    sideX,
    sideZ,
    crossTrack,
    pathHeading: Math.atan2(fwdX, fwdZ),
  };
};

/**
 * Fractional path parameter (index + t on segment) at world XZ.
 * Use this to boot path-rail — integer nearest-wp alone snaps cars backward.
 */
export const pathAlongAt = (
  waypoints: readonly Waypoint[],
  x: number,
  z: number,
  startIndex: number,
): number => {
  const n = waypoints.length;
  if (n === 0) return 0;
  const index = nearestWaypointIndexLocal(waypoints, x, z, startIndex, 24);
  const a = waypoints[index];
  const b = waypoints[(index + 1) % n];
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const len2 = abx * abx + abz * abz || 1;
  const t = Math.min(1, Math.max(0, ((x - a.x) * abx + (z - a.z) * abz) / len2));
  return index + t;
};
