/**
 * Rebuild Sepang control points from TUMFTM OSM centerline CSV.
 * Patches Y elevation from public/terrain/sepang-heightmap.json (run terrain:fetch first).
 * Usage: node scripts/sample-sepang.js
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const csvPath = path.join(root, "public", "tracks", "sepang-centerline.csv");
const heightmapPath = path.join(root, "public", "terrain", "sepang-heightmap.json");
const trackCurvePath = path.join(root, "src", "lib", "trackCurve.ts");
/** 1 world unit = 4 real metres — F1 cars readable, road width real. */
const METRES_PER_UNIT = 4;
const TARGET_COUNT = 280;
const TRACK_LENGTH_M = 5543;

const rawLines = fs.readFileSync(csvPath, "utf8").trim().split(/\r?\n/);
const raw = [];
for (const line of rawLines) {
  if (!line || line.startsWith("#")) continue;
  const [x, y] = line.split(",").map(Number);
  if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
  raw.push({ x, y });
}

if (raw.length < 50) {
  console.error("too few centerline points");
  process.exit(1);
}

/** Cumulative arc lengths along raw polyline */
const segLens = [];
let totalLen = 0;
for (let i = 0; i < raw.length; i++) {
  const a = raw[i];
  const b = raw[(i + 1) % raw.length];
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  segLens.push(d);
  totalLen += d;
}

const windowM = 900;
const windowFrac = Math.min(0.25, windowM / totalLen);
const windowPts = Math.max(20, Math.floor(raw.length * windowFrac));

let bestI = 0;
let bestScore = Infinity;
for (let i = 0; i < raw.length; i++) {
  let turn = 0;
  let len = 0;
  for (let k = 0; k < windowPts; k++) {
    const i0 = (i + k) % raw.length;
    const i1 = (i + k + 1) % raw.length;
    const i2 = (i + k + 2) % raw.length;
    const ax = raw[i1].x - raw[i0].x;
    const ay = raw[i1].y - raw[i0].y;
    const bx = raw[i2].x - raw[i1].x;
    const by = raw[i2].y - raw[i1].y;
    const la = Math.hypot(ax, ay) || 1;
    const lb = Math.hypot(bx, by) || 1;
    const cross = Math.abs(ax * by - ay * bx) / (la * lb);
    turn += cross;
    len += segLens[i0];
  }
  const score = turn / Math.max(len, 1);
  if (score < bestScore) {
    bestScore = score;
    bestI = i;
  }
}

const sfIndex = (bestI + Math.floor(windowPts / 2)) % raw.length;
const rotated = raw.slice(sfIndex).concat(raw.slice(0, sfIndex));

const rotSeg = [];
let rotTotal = 0;
for (let i = 0; i < rotated.length; i++) {
  const a = rotated[i];
  const b = rotated[(i + 1) % rotated.length];
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  rotSeg.push(d);
  rotTotal += d;
}

const sampleAt = (s) => {
  let dist = ((s % rotTotal) + rotTotal) % rotTotal;
  for (let i = 0; i < rotated.length; i++) {
    const d = rotSeg[i];
    if (dist <= d || i === rotated.length - 1) {
      const t = d > 0 ? dist / d : 0;
      const a = rotated[i];
      const b = rotated[(i + 1) % rotated.length];
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    dist -= d;
  }
  return { ...rotated[0] };
};

const sampled = [];
for (let i = 0; i < TARGET_COUNT; i++) {
  sampled.push(sampleAt((i / TARGET_COUNT) * rotTotal));
}

let minX = Infinity;
let maxX = -Infinity;
let minY = Infinity;
let maxY = -Infinity;
for (const p of sampled) {
  minX = Math.min(minX, p.x);
  maxX = Math.max(maxX, p.x);
  minY = Math.min(minY, p.y);
  maxY = Math.max(maxY, p.y);
}
const cx = (minX + maxX) / 2;
const cy = (minY + maxY) / 2;
const span = Math.max(maxX - minX, maxY - minY);
const scale = 1 / METRES_PER_UNIT;

const sfA = sampled[0];
const sfB = sampled[Math.min(8, sampled.length - 1)];
const tx = (sfB.x - sfA.x) * scale;
const tz = (sfB.y - sfA.y) * scale;
const angle = Math.atan2(tx, tz);
const cos = Math.cos(-angle);
const sin = Math.sin(-angle);

const mapPoint = (p) => {
  const lx = (p.x - cx) * scale;
  const lz = (p.y - cy) * scale;
  const rx = lx * cos - lz * sin;
  const rz = lx * sin + lz * cos;
  return { x: rx, z: rz };
};

let pts = sampled.map(mapPoint);

let area = 0;
for (let i = 0; i < pts.length; i++) {
  const a = pts[i];
  const b = pts[(i + 1) % pts.length];
  area += a.x * b.z - b.x * a.z;
}
if (area > 0) {
  pts = pts.map((p) => ({ x: -p.x, z: p.z }));
  pts = [pts[0], ...pts.slice(1).reverse()];
}

const bilinearSample = (grid, width, height, u, v) => {
  const x = Math.max(0, Math.min(width - 1.001, u * (width - 1)));
  const y = Math.max(0, Math.min(height - 1.001, v * (height - 1)));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, width - 1);
  const y1 = Math.min(y0 + 1, height - 1);
  const fx = x - x0;
  const fy = y - y0;
  const i00 = y0 * width + x0;
  const i10 = y0 * width + x1;
  const i01 = y1 * width + x0;
  const i11 = y1 * width + x1;
  return (
    grid[i00] * (1 - fx) * (1 - fy) +
    grid[i10] * fx * (1 - fy) +
    grid[i01] * (1 - fx) * fy +
    grid[i11] * fx * fy
  );
};

/** Sample real DEM; fallback to gentle sine if heightmap missing. */
const loadHeightSampler = () => {
  if (!fs.existsSync(heightmapPath)) {
    console.warn("No heightmap — run: npm run terrain:fetch");
    return (t) => {
      const u = ((t % 1) + 1) % 1;
      const wave = Math.sin(u * Math.PI * 2) * 1.2 + Math.sin(u * Math.PI * 4) * 0.4;
      return 2.0 + wave;
    };
  }
  const hm = JSON.parse(fs.readFileSync(heightmapPath, "utf8"));
  const { boundsWorld, width, height, elevations, trackYOffsetM = 1.5 } = hm;
  const { minX, maxX, minZ, maxZ } = boundsWorld;
  const rawM = pts.map((p) => {
    const u = (p.x - minX) / (maxX - minX);
    const v = (p.z - minZ) / (maxZ - minZ);
    return bilinearSample(elevations, width, height, u, v);
  });
  const minElev = Math.min(...rawM);
  const offset = trackYOffsetM;
  return (wx, wz) => {
    const u = (wx - minX) / (maxX - minX);
    const v = (wz - minZ) / (maxZ - minZ);
    const m = bilinearSample(elevations, width, height, u, v);
    return m - minElev + offset;
  };
};

const heightAt = loadHeightSampler();

const finalPts = pts.map((p) => ({
  x: +p.x.toFixed(4),
  y: +(heightAt(p.x, p.z) / METRES_PER_UNIT).toFixed(4),
  z: +p.z.toFixed(4),
}));

fs.writeFileSync(
  path.join(root, "public", "tracks", "sepang-points.json"),
  JSON.stringify(finalPts, null, 2),
);

const vectorLines = finalPts
  .map((p) => `  new THREE.Vector3(${p.x}, ${p.y}, ${p.z}),`)
  .join("\n");

/** Patch only SEPANG_CONTROL_POINTS in src/lib/trackCurve.ts (preserve pit CAD, FIA, etc.). */
const patchTrackCurve = () => {
  if (!fs.existsSync(trackCurvePath)) {
    console.warn("trackCurve.ts not found — wrote sepang-points.json only");
    return;
  }
  const src = fs.readFileSync(trackCurvePath, "utf8");
  const startMarker = "export const SEPANG_CONTROL_POINTS: THREE.Vector3[] = [";
  const endMarker = "];";
  const startIdx = src.indexOf(startMarker);
  if (startIdx < 0) {
    console.error("Could not find SEPANG_CONTROL_POINTS in trackCurve.ts");
    process.exit(1);
  }
  const afterStart = startIdx + startMarker.length;
  const endIdx = src.indexOf(endMarker, afterStart);
  if (endIdx < 0) {
    console.error("Could not find end of SEPANG_CONTROL_POINTS array");
    process.exit(1);
  }
  const patched =
    src.slice(0, afterStart) +
    "\n" +
    vectorLines +
    "\n" +
    src.slice(endIdx);
  fs.writeFileSync(trackCurvePath, patched);
  console.log(`Patched ${finalPts.length} control points in src/lib/trackCurve.ts`);
};

patchTrackCurve();

console.log(
  `Wrote ${finalPts.length} points; S/F from raw index ${sfIndex}; span=${span.toFixed(1)}m → ${(span * scale).toFixed(1)}u @ ${METRES_PER_UNIT}m/u`,
);
