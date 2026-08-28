import * as THREE from "three";
import { DRS_ZONE_END, DRS_ZONE_START } from "@/lib/academy/raceControl";
import { curvatureAt } from "@/lib/racePhysics";
import {
  getTrackCurve,
  PIT_ENTRY_T,
  PIT_EXIT_T,
  SEPANG_CONTROL_POINTS,
} from "@/lib/trackCurve";

export type MapPoint = { x: number; y: number; t: number };

export type TurnLabel = { label: string; x: number; y: number; t: number };

export type TrackMapLayout = {
  path: MapPoint[];
  drsPath: MapPoint[];
  pitEntry: MapPoint;
  pitExit: MapPoint;
  startFinish: MapPoint;
  turns: TurnLabel[];
  viewBox: { minX: number; minY: number; width: number; height: number };
};

const SAMPLE = 320;

const normalizePath = (pts: { x: number; z: number; t: number }[]): MapPoint[] => {
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
  const pad = Math.max(maxX - minX, maxZ - minZ) * 0.06;
  const span = Math.max(maxX - minX, maxZ - minZ) + pad * 2;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;

  return pts.map((p) => ({
    t: p.t,
    x: 0.5 + (p.x - cx) / span,
    y: 0.5 - (p.z - cz) / span,
  }));
};

const sampleCurve = (steps: number): { x: number; z: number; t: number }[] => {
  const curve = getTrackCurve();
  const out: { x: number; z: number; t: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = curve.getPointAt(t);
    out.push({ x: p.x, z: p.z, t });
  }
  return out;
};

const detectTurns = (path: MapPoint[]): TurnLabel[] => {
  const peaks: { t: number; k: number }[] = [];
  const steps = 400;
  for (let i = 1; i < steps - 1; i++) {
    const t = i / steps;
    const k = curvatureAt(t);
    const kPrev = curvatureAt((i - 1) / steps);
    const kNext = curvatureAt((i + 1) / steps);
    if (k > 0.42 && k >= kPrev && k >= kNext) {
      if (peaks.length === 0 || t - peaks[peaks.length - 1].t > 0.035) {
        peaks.push({ t, k });
      } else if (k > peaks[peaks.length - 1].k) {
        peaks[peaks.length - 1] = { t, k };
      }
    }
  }

  peaks.sort((a, b) => a.t - b.t);
  return peaks.slice(0, 15).map((peak, i) => {
    const nearest = path.reduce((best, p) =>
      Math.abs(p.t - peak.t) < Math.abs(best.t - peak.t) ? p : best,
    );
    return {
      label: `T${i + 1}`,
      x: nearest.x,
      y: nearest.y,
      t: peak.t,
    };
  });
};

const pointAtT = (path: MapPoint[], t: number): MapPoint => {
  let best = path[0];
  for (const p of path) {
    if (Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
  }
  return best;
};

let cachedLayout: TrackMapLayout | null = null;

export const buildTrackMapLayout = (): TrackMapLayout => {
  if (cachedLayout) return cachedLayout;

  const raw = sampleCurve(SAMPLE);
  const path = normalizePath(raw);

  const drsRaw: { x: number; z: number; t: number }[] = [];
  const curve = getTrackCurve();
  const drsSteps = 24;
  for (let i = 0; i <= drsSteps; i++) {
    const u = i / drsSteps;
    const t = DRS_ZONE_START + (DRS_ZONE_END - DRS_ZONE_START) * u;
    const p = curve.getPointAt(t);
    drsRaw.push({ x: p.x, z: p.z, t });
  }

  const drsPath = normalizePath(drsRaw);
  const turns = detectTurns(path);

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
    drsPath,
    pitEntry: pointAtT(path, PIT_ENTRY_T),
    pitExit: pointAtT(path, PIT_EXIT_T),
    startFinish: pointAtT(path, 0),
    turns,
    viewBox: {
      minX: minX - 0.04,
      minY: minY - 0.04,
      width: maxX - minX + 0.08,
      height: maxY - minY + 0.08,
    },
  };

  return cachedLayout;
};

export const progressToMap = (lapProgress: number): { x: number; y: number } => {
  const layout = buildTrackMapLayout();
  const t = ((lapProgress % 1) + 1) % 1;
  return pointAtT(layout.path, t);
};

export const getTrackOutlinePoints = (): THREE.Vector3[] => SEPANG_CONTROL_POINTS;
