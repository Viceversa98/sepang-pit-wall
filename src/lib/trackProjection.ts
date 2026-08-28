import * as THREE from "three";
import { getTrackCurve, unitsToMetres } from "@/lib/trackCurve";

const SAMPLES = 512;
const UP = new THREE.Vector3(0, 1, 0);

type TrackSample = {
  t: number;
  x: number;
  z: number;
  sideX: number;
  sideZ: number;
};

let lut: TrackSample[] | null = null;

const buildLut = (): TrackSample[] => {
  if (lut) return lut;
  const curve = getTrackCurve();
  lut = [];
  for (let i = 0; i < SAMPLES; i += 1) {
    const t = i / SAMPLES;
    const p = curve.getPointAt(t);
    const tan = curve.getTangentAt(t).normalize();
    const side = new THREE.Vector3().crossVectors(UP, tan).normalize();
    lut.push({ t, x: p.x, z: p.z, sideX: side.x, sideZ: side.z });
  }
  return lut;
};

export type TrackProjection = {
  lapProgress: number;
  laneOffsetM: number;
  distanceM: number;
};

const wrap01 = (t: number): number => ((t % 1) + 1) % 1;

/** Shortest delta along lap fraction (handles S/F wrap). */
export const progressDelta = (from: number, to: number): number => {
  let d = wrap01(to) - wrap01(from);
  if (d > 0.5) d -= 1;
  if (d < -0.5) d += 1;
  return d;
};

const distToSegmentSq = (
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): { distSq: number; u: number; dx: number; dz: number; sideX: number; sideZ: number; t: number } => {
  const abx = bx - ax;
  const abz = bz - az;
  const lenSq = abx * abx + abz * abz || 1e-12;
  let u = ((px - ax) * abx + (pz - az) * abz) / lenSq;
  u = Math.max(0, Math.min(1, u));
  const cx = ax + u * abx;
  const cz = az + u * abz;
  const dx = px - cx;
  const dz = pz - cz;
  return { distSq: dx * dx + dz * dz, u, dx, dz, sideX: 0, sideZ: 0, t: 0 };
};

/** Map world XZ to along-track progress and lateral offset (metres). */
export const projectWorldToTrack = (worldX: number, worldZ: number): TrackProjection => {
  const samples = buildLut();
  let bestDistSq = Infinity;
  let bestT = 0;
  let bestSideX = 0;
  let bestSideZ = 1;
  let bestDx = 0;
  let bestDz = 0;

  for (let i = 0; i < SAMPLES; i += 1) {
    const a = samples[i];
    const b = samples[(i + 1) % SAMPLES];
    const hit = distToSegmentSq(worldX, worldZ, a.x, a.z, b.x, b.z);
    if (hit.distSq < bestDistSq) {
      bestDistSq = hit.distSq;
      const ta = a.t;
      const tb = i === SAMPLES - 1 ? 1 : b.t;
      bestT = wrap01(ta + hit.u * (tb - ta));
      bestSideX = a.sideX;
      bestSideZ = a.sideZ;
      bestDx = hit.dx;
      bestDz = hit.dz;
    }
  }

  const laneOffsetUnits = bestDx * bestSideX + bestDz * bestSideZ;
  return {
    lapProgress: bestT,
    laneOffsetM: unitsToMetres(laneOffsetUnits),
    distanceM: unitsToMetres(Math.sqrt(bestDistSq)),
  };
};
