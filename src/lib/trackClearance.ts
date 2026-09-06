import { FIA, getPoseAt, metresToUnits } from "@/lib/trackCurve";
import { projectWorldToTrack } from "@/lib/trackProjection";

/** Racing asphalt half-width (m). */
export const TRACK_HALF_M = FIA.trackWidthStartM / 2;

/** Asphalt + kerb + runoff + safety margin — buildings must stay beyond this lateral offset. */
export const TRACK_CLEARANCE_M = TRACK_HALF_M + 0.55 + 4.5 + 1.5;

/** True when a world XZ point is outside the drivable corridor (uses track projection, not raw distance). */
export const pointClearsTrack = (
  x: number,
  z: number,
  limitM = TRACK_CLEARANCE_M,
): boolean => Math.abs(projectWorldToTrack(x, z).laneOffsetM) >= limitM;

/** Sample ring edges so long walls that cross asphalt still get caught. */
const densifyRing = (
  ring: readonly { x: number; z: number }[],
  stepU = 1.25,
): { x: number; z: number }[] => {
  const out: { x: number; z: number }[] = [];
  const n = ring.length;
  if (n === 0) return out;
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(1, Math.ceil(len / stepU));
    for (let k = 0; k < steps; k++) {
      const u = k / steps;
      out.push({ x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u });
    }
  }
  return out;
};

/** Ray-cast point-in-polygon on XZ. */
const pointInRingXZ = (
  x: number,
  z: number,
  ring: readonly { x: number; z: number }[],
): boolean => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].x;
    const zi = ring[i].z;
    const xj = ring[j].x;
    const zj = ring[j].z;
    const cross =
      zi > z !== zj > z &&
      x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-12) + xi;
    if (cross) inside = !inside;
  }
  return inside;
};

/**
 * True when the footprint stays off the drivable corridor.
 * Checks densified edges (catches walls that only cross mid-edge) and rejects
 * any footprint that covers the racing-line ribbon (T8/T9/T15 OSM boxes).
 */
export const footprintClearsTrack = (
  ring: readonly { x: number; z: number }[],
  limitM = TRACK_CLEARANCE_M,
): boolean => {
  if (ring.length < 3) return false;
  const samples = densifyRing(ring);
  for (const p of samples) {
    if (!pointClearsTrack(p.x, p.z, limitM)) return false;
  }
  const halfU = metresToUnits(TRACK_HALF_M);
  for (let i = 0; i < 160; i++) {
    const pose = getPoseAt(i / 160);
    const sx = pose.side.x;
    const sz = pose.side.z;
    for (const lat of [-halfU, 0, halfU] as const) {
      const x = pose.position.x + sx * lat;
      const z = pose.position.z + sz * lat;
      if (pointInRingXZ(x, z, ring)) return false;
    }
  }
  return true;
};

/** Closest lateral approach of a footprint to the centerline (m). */
export const footprintMinTrackDistanceM = (
  ring: readonly { x: number; z: number }[],
): number => {
  let best = Infinity;
  for (const p of densifyRing(ring)) {
    best = Math.min(best, Math.abs(projectWorldToTrack(p.x, p.z).laneOffsetM));
  }
  return best;
};

/** @deprecated Use {@link pointClearsTrack} — kept for scripts that sampled centerline distance. */
export const minDistanceToTrackM = (x: number, z: number): number =>
  Math.abs(projectWorldToTrack(x, z).laneOffsetM);
