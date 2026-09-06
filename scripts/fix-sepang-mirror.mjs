/**
 * Un-mirror Sepang: real circuit T1 is a right-hander; baked points turn left.
 * Negate world X on centerline JSON + rewrite TS control-point sources.
 *
 * Usage: node scripts/fix-sepang-mirror.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const heading = (arr, i) => {
  const a = arr[i];
  const b = arr[(i + 1) % arr.length];
  return Math.atan2(b.x - a.x, b.z - a.z);
};

const t1Sign = (arr) => {
  const i = Math.min(24, arr.length - 4);
  let d = heading(arr, i + 3) - heading(arr, i);
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d; // <0 = RIGHT with atan2(dx,dz)
};

const formatVecs = (arr) =>
  arr
    .map(
      (p) =>
        `  new THREE.Vector3(${Number(p.x.toFixed(4))}, ${Number(p.y.toFixed(4))}, ${Number(p.z.toFixed(4))}),`,
    )
    .join("\n");

/** Replace `export const NAME: THREE.Vector3[] = [ ... ]` body. */
const rewriteVector3Array = (fileRel, exportName, arr) => {
  const file = path.join(root, fileRel);
  let src = fs.readFileSync(file, "utf8");
  const needle = `export const ${exportName}: THREE.Vector3[] = [`;
  const start = src.indexOf(needle);
  if (start < 0) throw new Error(`missing ${needle} in ${fileRel}`);
  const open = start + needle.length - 1; // '['
  let depth = 0;
  let end = open;
  for (; end < src.length; end++) {
    if (src[end] === "[") depth++;
    else if (src[end] === "]") {
      depth--;
      if (depth === 0) break;
    }
  }
  if (depth !== 0) throw new Error(`unclosed array for ${exportName}`);
  const semi = src.indexOf(";", end);
  const replacement = `${needle.slice(0, -1)}[\n${formatVecs(arr)}\n]`;
  src = src.slice(0, start) + replacement + src.slice(semi);
  fs.writeFileSync(file, src);
  console.log("Rewrote", fileRel, exportName, arr.length);
};

const parseVector3Array = (fileRel, exportName) => {
  const file = path.join(root, fileRel);
  const src = fs.readFileSync(file, "utf8");
  const needle = `export const ${exportName}: THREE.Vector3[] = [`;
  const start = src.indexOf(needle);
  if (start < 0) throw new Error(`missing ${exportName}`);
  const open = start + needle.length - 1;
  let depth = 0;
  let end = open;
  for (; end < src.length; end++) {
    if (src[end] === "[") depth++;
    else if (src[end] === "]") {
      depth--;
      if (depth === 0) break;
    }
  }
  const block = src.slice(open, end + 1);
  const pts = [];
  for (const m of block.matchAll(
    /Vector3\(([-0-9.eE+]+),\s*([-0-9.eE+]+),\s*([-0-9.eE+]+)\)/g,
  )) {
    pts.push({ x: Number(m[1]), y: Number(m[2]), z: Number(m[3]) });
  }
  return pts;
};

const pointsPath = path.join(root, "public", "tracks", "sepang-points.json");
const pts = JSON.parse(fs.readFileSync(pointsPath, "utf8"));

const before = t1Sign(pts);
console.log(
  "T1 dYaw before",
  ((before * 180) / Math.PI).toFixed(1),
  before < 0 ? "RIGHT" : "LEFT",
);

if (before < 0) {
  console.log("Already right-hand T1 — no change.");
  process.exit(0);
}

const flipped = pts.map((p) => ({ x: -p.x, y: p.y, z: p.z }));
const after = t1Sign(flipped);
console.log(
  "T1 dYaw after",
  ((after * 180) / Math.PI).toFixed(1),
  after < 0 ? "RIGHT" : "LEFT",
);
if (after >= 0) {
  console.error("Flip X did not make T1 a right-hander — abort.");
  process.exit(1);
}

fs.writeFileSync(pointsPath, JSON.stringify(flipped, null, 2) + "\n");
console.log("Wrote", pointsPath);

rewriteVector3Array("src/lib/trackCurve.ts", "SEPANG_CONTROL_POINTS", flipped);

const pitPts = parseVector3Array("src/lib/sepangPitCad.ts", "SEPANG_PIT_CONTROL_POINTS");
const pitFlipped = pitPts.map((p) => ({ x: -p.x, y: p.y, z: p.z }));
rewriteVector3Array("src/lib/sepangPitCad.ts", "SEPANG_PIT_CONTROL_POINTS", pitFlipped);

console.log("Done. Restart dev server so workers reload waypoints.");
