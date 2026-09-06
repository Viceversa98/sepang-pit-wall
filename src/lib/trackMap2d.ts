import * as THREE from "three";
import { DRS_ZONES } from "@/lib/academy/raceControl";
import {
  getPitCurve,
  getTrackCurve,
  PIT_ENTRY_T,
  PIT_EXIT_T,
  SEPANG_CONTROL_POINTS,
} from "@/lib/trackCurve";

export type MapPoint = { x: number; y: number; t: number };

export type TurnLabel = {
  n: number;
  label: string;
  name: string | null;
  x: number;
  y: number;
  lx: number;
  ly: number;
  t: number;
};

export type StraightLabel = {
  name: string;
  x: number;
  y: number;
  t: number;
};

type NormTransform = {
  cx: number;
  cz: number;
  span: number;
};

export type TrackMapLayout = {
  path: MapPoint[];
  pitPath: MapPoint[];
  drsPaths: MapPoint[][];
  pitEntry: MapPoint;
  pitExit: MapPoint;
  startFinish: MapPoint;
  turns: TurnLabel[];
  straights: StraightLabel[];
  viewBox: { minX: number; minY: number; width: number; height: number };
  transform: NormTransform;
};

/** Official Sepang corner names + apex lap fraction (curvature-aligned). */
const SEPANG_TURNS: {
  n: number;
  t: number;
  name: string | null;
  outward: number;
}[] = [
  { n: 1, t: 0.1, name: null, outward: 1.15 },
  { n: 2, t: 0.117, name: "Pangkor Laut Chicane", outward: 1.25 },
  { n: 3, t: 0.19, name: null, outward: 1.15 },
  { n: 4, t: 0.264, name: "Langkawi Corner", outward: 1.2 },
  { n: 5, t: 0.324, name: null, outward: 1.15 },
  { n: 6, t: 0.367, name: "Genting Curve", outward: 1.2 },
  { n: 7, t: 0.439, name: null, outward: 1.15 },
  { n: 8, t: 0.461, name: "KLIA Curve", outward: 1.2 },
  { n: 9, t: 0.549, name: null, outward: 1.2 },
  { n: 10, t: 0.57, name: "Berjaya Tioman Corner", outward: 1.25 },
  { n: 11, t: 0.613, name: "Kenyir Lake Corner", outward: 1.25 },
  { n: 12, t: 0.674, name: null, outward: 1.15 },
  { n: 13, t: 0.738, name: null, outward: 1.15 },
  { n: 14, t: 0.81, name: "Sunway Lagoon Corner", outward: 1.25 },
  { n: 15, t: 0.91, name: null, outward: 1.2 },
];

const SAMPLE = 360;

const computeNormTransform = (pts: { x: number; z: number }[]): NormTransform => {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  const pad = Math.max(maxX - minX, maxZ - minZ) * 0.08;
  const span = Math.max(maxX - minX, maxZ - minZ) + pad * 2;
  return {
    cx: (minX + maxX) / 2,
    cz: (minZ + maxZ) / 2,
    span,
  };
};

/**
 * World XZ → map 0–1 (SVG: +x right, +y down).
 * Rotates so official Sepang north is up: Langkawi (+X) top, KLIA (+Z) right,
 * Kenyir (−X) bottom, Pangkor (−Z) left. KL straight travels right→left.
 */
const applyNorm = (
  p: { x: number; z: number; t: number },
  tr: NormTransform,
): MapPoint => ({
  t: p.t,
  x: 0.5 + (p.z - tr.cz) / tr.span,
  y: 0.5 - (p.x - tr.cx) / tr.span,
});

const normalizePath = (
  pts: { x: number; z: number; t: number }[],
  tr: NormTransform,
): MapPoint[] => pts.map((p) => applyNorm(p, tr));

const sampleCurve = (
  curve: THREE.CatmullRomCurve3,
  steps: number,
): { x: number; z: number; t: number }[] => {
  const out: { x: number; z: number; t: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = curve.getPointAt(t);
    out.push({ x: p.x, z: p.z, t });
  }
  return out;
};

const sampleZone = (
  curve: THREE.CatmullRomCurve3,
  t0: number,
  t1: number,
  steps: number,
): { x: number; z: number; t: number }[] => {
  const out: { x: number; z: number; t: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    let t: number;
    if (t0 <= t1) {
      t = t0 + (t1 - t0) * u;
    } else {
      // Wrap (e.g. 0.93 → 1.0 → 0.0 → 0.08)
      const span = 1 - t0 + t1;
      const s = span * u;
      t = s < 1 - t0 ? t0 + s : s - (1 - t0);
    }
    const p = curve.getPointAt(t);
    out.push({ x: p.x, z: p.z, t });
  }
  return out;
};

/** Interpolate map position at lap progress t ∈ [0, 1). */
const pointAtT = (path: MapPoint[], t: number): MapPoint => {
  const u = ((t % 1) + 1) % 1;
  if (path.length === 0) return { x: 0.5, y: 0.5, t: u };
  if (path.length === 1) return path[0];

  const steps = path.length - 1;
  const f = u * steps;
  let i = Math.floor(f);
  if (i >= steps) i = steps - 1;
  const frac = f - i;
  const a = path[i];
  const b = path[i + 1];
  return {
    t: u,
    x: a.x + (b.x - a.x) * frac,
    y: a.y + (b.y - a.y) * frac,
  };
};

const outwardFromPath = (
  path: MapPoint[],
  t: number,
  scale: number,
): { x: number; y: number } => {
  const a = pointAtT(path, t - 0.004);
  const b = pointAtT(path, t + 0.004);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  // Perp (right of forward in map space) — nudge labels outside.
  const px = dy / len;
  const py = -dx / len;
  const on = pointAtT(path, t);
  return {
    x: on.x + px * 0.028 * scale,
    y: on.y + py * 0.028 * scale,
  };
};

let cachedLayout: TrackMapLayout | null = null;

export const buildTrackMapLayout = (): TrackMapLayout => {
  if (cachedLayout) return cachedLayout;

  const track = getTrackCurve();
  const raw = sampleCurve(track, SAMPLE);
  const transform = computeNormTransform(raw);
  const path = normalizePath(raw, transform);

  const pitRaw = sampleCurve(getPitCurve(), 96);
  const pitPath = normalizePath(pitRaw, transform);

  const drsPaths = DRS_ZONES.map((z) =>
    normalizePath(sampleZone(track, z.start, z.end, 20), transform),
  );

  const turns: TurnLabel[] = SEPANG_TURNS.map((def) => {
    const on = pointAtT(path, def.t);
    const out = outwardFromPath(path, def.t, def.outward);
    return {
      n: def.n,
      label: String(def.n),
      name: def.name,
      x: on.x,
      y: on.y,
      lx: out.x,
      ly: out.y,
      t: def.t,
    };
  });

  const straights: StraightLabel[] = [
    {
      name: "Kuala Lumpur Straight",
      t: 0.03,
      ...(() => {
        const p = outwardFromPath(path, 0.03, -1.6);
        return { x: p.x, y: p.y };
      })(),
    },
    {
      name: "Penang Straight",
      t: 0.86,
      ...(() => {
        const p = outwardFromPath(path, 0.86, 1.8);
        return { x: p.x, y: p.y };
      })(),
    },
  ];

  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const p of path) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }

  cachedLayout = {
    path,
    pitPath,
    drsPaths,
    pitEntry: pointAtT(path, PIT_ENTRY_T),
    pitExit: pointAtT(path, PIT_EXIT_T),
    startFinish: pointAtT(path, 0),
    turns,
    straights,
    transform,
    viewBox: {
      minX: minX - 0.06,
      minY: minY - 0.06,
      width: maxX - minX + 0.12,
      height: maxY - minY + 0.12,
    },
  };

  return cachedLayout;
};

export const progressToMap = (lapProgress: number): { x: number; y: number } => {
  const layout = buildTrackMapLayout();
  const t = ((lapProgress % 1) + 1) % 1;
  const p = pointAtT(layout.path, t);
  return { x: p.x, y: p.y };
};

/** Project sim world XZ onto the minimap (matches 3D car pose). */
export const worldXZToMap = (
  worldX: number,
  worldZ: number,
): { x: number; y: number } => {
  const { transform } = buildTrackMapLayout();
  return applyNorm({ x: worldX, z: worldZ, t: 0 }, transform);
};

export const getTrackOutlinePoints = (): THREE.Vector3[] => SEPANG_CONTROL_POINTS;
