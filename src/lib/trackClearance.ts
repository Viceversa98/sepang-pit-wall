import { FIA } from "@/lib/trackCurve";
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

/** True when every ring vertex stays outside the drivable corridor. */
export const footprintClearsTrack = (
  ring: readonly { x: number; z: number }[],
  limitM = TRACK_CLEARANCE_M,
): boolean => {
  for (const p of ring) {
    if (!pointClearsTrack(p.x, p.z, limitM)) return false;
  }
  return true;
};

/** Closest lateral approach of a footprint to the centerline (m). */
export const footprintMinTrackDistanceM = (
  ring: readonly { x: number; z: number }[],
): number => {
  let best = Infinity;
  for (const p of ring) {
    best = Math.min(best, Math.abs(projectWorldToTrack(p.x, p.z).laneOffsetM));
  }
  return best;
};

/** @deprecated Use {@link pointClearsTrack} — kept for scripts that sampled centerline distance. */
export const minDistanceToTrackM = (x: number, z: number): number =>
  Math.abs(projectWorldToTrack(x, z).laneOffsetM);
