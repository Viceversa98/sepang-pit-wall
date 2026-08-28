import { getTrackCurve, TRACK_LENGTH_M } from "@/lib/trackCurve";
import type { Waypoint } from "@/shared/waypoints";

const WAYPOINT_SPACING_M = 18;

let cachedDense: readonly Waypoint[] | null = null;

/** Waypoints every ~18 m along the closed racing line for AI steering. */
export const buildDenseWaypoints = (): readonly Waypoint[] => {
  if (cachedDense) return cachedDense;

  const curve = getTrackCurve();
  const count = Math.max(64, Math.ceil(TRACK_LENGTH_M / WAYPOINT_SPACING_M));
  const points: Waypoint[] = [];

  for (let i = 0; i < count; i += 1) {
    const t = i / count;
    const p = curve.getPointAt(t);
    points.push({ x: p.x, y: p.y, z: p.z });
  }

  cachedDense = points;
  return cachedDense;
};

export const SEPANG_WAYPOINTS: readonly Waypoint[] = buildDenseWaypoints();
