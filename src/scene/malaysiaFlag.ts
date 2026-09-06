/**
 * Jalur Gemilang on empty infield grass — never on asphalt.
 * Placement is searched for max track clearance near circuit center.
 */
import * as THREE from "three";
import { getPoseAt, metresToUnits } from "@/lib/trackCurve";
import {
  footprintClearsTrack,
  footprintMinTrackDistanceM,
  pointClearsTrack,
  TRACK_CLEARANCE_M,
} from "@/lib/trackClearance";
import { sampleTerrainHeight } from "@/lib/terrainHeight";
import { prepareStaticMesh } from "@/lib/staticMesh";

const FLAG_RED = "#CC0001";
const FLAG_WHITE = "#FFFFFF";
const FLAG_BLUE = "#010066";
const FLAG_YELLOW = "#FFCC00";

/** Readable from overview, still fits empty grass pockets. */
const FLAG_FLY_M = 55;
const FLAG_HOIST_M = 27.5;
/** Extra buffer beyond TRACK_CLEARANCE_M so the plate never kisses kerb. */
const FLAG_MARGIN_M = 12;

export type MalaysiaFlagHandle = {
  group: THREE.Group;
  dispose: () => void;
};

const drawFourteenPointStar = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  outerR: number,
): void => {
  const points = 14;
  const innerR = outerR * 0.42;
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
};

/** Canvas Jalur Gemilang — white stripes are real #FFF (PNG had transparent “white”). */
export const buildJalurGemilangCanvas = (flyPx = 1024): HTMLCanvasElement => {
  const hoistPx = Math.round(flyPx / 2);
  const canvas = document.createElement("canvas");
  canvas.width = flyPx;
  canvas.height = hoistPx;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const stripeH = hoistPx / 14;
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = i % 2 === 0 ? FLAG_RED : FLAG_WHITE;
    ctx.fillRect(0, i * stripeH, flyPx, stripeH + 1);
  }

  const cantonW = (flyPx * 16) / 28;
  const cantonH = hoistPx / 2;
  ctx.fillStyle = FLAG_BLUE;
  ctx.fillRect(0, 0, cantonW, cantonH);

  const cx = cantonW * 0.52;
  const cy = cantonH * 0.5;
  const starR = cantonH * 0.28;
  const crescentR = cantonH * 0.34;

  ctx.fillStyle = FLAG_YELLOW;
  ctx.beginPath();
  ctx.arc(cx - cantonW * 0.12, cy, crescentR, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = FLAG_BLUE;
  ctx.beginPath();
  ctx.arc(cx - cantonW * 0.02, cy, crescentR * 0.78, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = FLAG_YELLOW;
  drawFourteenPointStar(ctx, cx + cantonW * 0.18, cy, starR);

  return canvas;
};

const flagRingAt = (
  cx: number,
  cz: number,
  yaw: number,
): { x: number; z: number }[] => {
  const hw = metresToUnits(FLAG_FLY_M) / 2;
  const hh = metresToUnits(FLAG_HOIST_M) / 2;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const corners: [number, number][] = [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ];
  return corners.map(([lx, lz]) => ({
    x: cx + lx * c - lz * s,
    z: cz + lx * s + lz * c,
  }));
};

/**
 * Pick empty grass near the circuit centre — never the centerline centroid
 * (Sepang’s middle often lands on asphalt).
 */
const findEmptyGrassSpot = (): { x: number; z: number; yaw: number } => {
  let sx = 0;
  let sz = 0;
  const n = 96;
  for (let i = 0; i < n; i++) {
    const p = getPoseAt(i / n).position;
    sx += p.x;
    sz += p.z;
  }
  const cx0 = sx / n;
  const cz0 = sz / n;
  const sf = getPoseAt(0);
  const yaw = Math.atan2(sf.tangent.x, sf.tangent.z);
  const limit = TRACK_CLEARANCE_M + FLAG_MARGIN_M;

  let best: { x: number; z: number; score: number } | null = null;
  const step = 4;
  for (let dx = -95; dx <= 95; dx += step) {
    for (let dz = -95; dz <= 95; dz += step) {
      const x = cx0 + dx;
      const z = cz0 + dz;
      if (!pointClearsTrack(x, z, limit)) continue;
      const ring = flagRingAt(x, z, yaw);
      if (!footprintClearsTrack(ring, limit)) continue;
      const d = footprintMinTrackDistanceM(ring);
      const r = Math.hypot(dx, dz);
      // Prefer deep grass, but keep the plate readable near the infield (not far outfield).
      const score = d * 0.4 - r * 0.18;
      if (!best || score > best.score) best = { x, z, score };
    }
  }

  if (best) return { x: best.x, z: best.z, yaw };

  // Fallback: step laterally off S/F toward the pit-opposite side until clear.
  for (let lat = 40; lat <= 120; lat += 5) {
    for (const sign of [-1, 1] as const) {
      const x = sf.position.x + sf.side.x * metresToUnits(sign * lat);
      const z = sf.position.z + sf.side.z * metresToUnits(sign * lat);
      const ring = flagRingAt(x, z, yaw);
      if (footprintClearsTrack(ring, limit)) return { x, z, yaw };
    }
  }
  return { x: cx0, z: cz0, yaw };
};

/**
 * Giant Jalur Gemilang painted on empty infield grass —
 * readable from bird's-eye, clear of the racing ribbon.
 */
export const createMalaysiaFlag = (): MalaysiaFlagHandle => {
  const group = new THREE.Group();
  group.name = "malaysia-flag";

  const canvas = buildJalurGemilangCanvas(1536);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;

  const fly = metresToUnits(FLAG_FLY_M);
  const hoist = metresToUnits(FLAG_HOIST_M);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(fly, hoist), mat);
  mesh.name = "jalur-gemilang-infield";
  mesh.rotation.x = -Math.PI / 2;

  const spot = findEmptyGrassSpot();
  const y = sampleTerrainHeight(spot.x, spot.z) + metresToUnits(0.08);
  mesh.position.set(spot.x, y, spot.z);
  mesh.rotation.z = -spot.yaw;
  group.add(mesh);

  prepareStaticMesh(group);

  const dispose = (): void => {
    tex.dispose();
    mesh.geometry.dispose();
    mat.dispose();
    group.clear();
  };

  return { group, dispose };
};
