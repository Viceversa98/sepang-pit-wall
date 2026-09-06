/**
 * Find lap-progress peaks of curvature → map to Sepang T1–T15.
 * Run: nub x tsx --tsconfig tsconfig.json scripts/find-sepang-apexes.ts
 */
import { getTrackCurve, TRACK_LENGTH_M } from "../src/lib/trackCurve.ts";
import * as THREE from "three";

const N = 512;
const curve = getTrackCurve();
const pts: THREE.Vector3[] = [];
for (let i = 0; i < N; i++) pts.push(curve.getPointAt(i / N));

const kappa: number[] = [];
for (let i = 0; i < N; i++) {
  const a = pts[(i - 1 + N) % N];
  const b = pts[i];
  const c = pts[(i + 1) % N];
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const bcx = c.x - b.x;
  const bcz = c.z - b.z;
  const lab = Math.hypot(abx, abz) || 1e-6;
  const lbc = Math.hypot(bcx, bcz) || 1e-6;
  const h0 = Math.atan2(abx, abz);
  const h1 = Math.atan2(bcx, bcz);
  let d = h1 - h0;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  kappa.push(Math.abs(d) / ((lab + lbc) * 0.5));
}

// Smooth
const smooth = kappa.map((_, i) => {
  let s = 0;
  for (let k = -2; k <= 2; k++) s += kappa[(i + k + N) % N];
  return s / 5;
});

type Peak = { i: number; t: number; k: number };
const peaks: Peak[] = [];
for (let i = 0; i < N; i++) {
  const p = smooth[(i - 1 + N) % N];
  const n = smooth[(i + 1) % N];
  if (smooth[i] >= p && smooth[i] >= n && smooth[i] > 0.04) {
    peaks.push({ i, t: i / N, k: smooth[i] });
  }
}
// Non-max suppress within ~80 m
peaks.sort((a, b) => b.k - a.k);
const kept: Peak[] = [];
for (const p of peaks) {
  if (kept.some((q) => Math.min(Math.abs(p.t - q.t), 1 - Math.abs(p.t - q.t)) * TRACK_LENGTH_M < 80)) {
    continue;
  }
  kept.push(p);
  if (kept.length >= 16) break;
}
kept.sort((a, b) => a.t - b.t);
console.log(`TRACK_LENGTH_M=${TRACK_LENGTH_M}`);
for (const p of kept) {
  console.log(
    `t=${p.t.toFixed(3)}  m=${(p.t * TRACK_LENGTH_M).toFixed(0).padStart(4)}  k=${p.k.toFixed(3)}`,
  );
}
