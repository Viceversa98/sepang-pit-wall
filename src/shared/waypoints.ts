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

export const targetWaypointIndex = (
  waypoints: readonly Waypoint[],
  currentIndex: number,
  lookahead = 2,
): number => (currentIndex + lookahead) % waypoints.length;
