/**
 * Flip all baked Sepang world assets in X to match the mirrored centerline
 * (real Sepang T1 = right-hander).
 *
 * Usage: node scripts/fix-sepang-assets-mirror.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const flipBoundsX = (b) => ({
  minX: -b.maxX,
  maxX: -b.minX,
  minZ: b.minZ,
  maxZ: b.maxZ,
});

const flipXz = (p) => {
  if (!p || typeof p.x !== "number") return p;
  return { ...p, x: -p.x };
};

/** Flip X on every {x,z} / {x,y,z} leaf in a JSON tree. */
const flipWorldTree = (node, keys = new Set(["x"])) => {
  if (Array.isArray(node)) return node.map((n) => flipWorldTree(n, keys));
  if (!node || typeof node !== "object") return node;
  const out = { ...node };
  // Known world-position containers
  for (const k of [
    "centroidWorld",
    "fixedWorld",
    "position",
    "ringWorld",
    "boundsWorld",
  ]) {
    if (k in out) {
      if (k === "boundsWorld") out[k] = flipBoundsX(out[k]);
      else if (Array.isArray(out[k])) out[k] = out[k].map(flipXz);
      else out[k] = flipXz(out[k]);
    }
  }
  // Point arrays like [{x,y,z}, ...]
  if (
    Array.isArray(out) === false &&
    "x" in out &&
    "z" in out &&
    typeof out.x === "number" &&
    typeof out.z === "number" &&
    !("widthM" in out) &&
    !("depthM" in out)
  ) {
    out.x = -out.x;
  }
  for (const [k, v] of Object.entries(out)) {
    if (
      k === "centroidWorld" ||
      k === "fixedWorld" ||
      k === "ringWorld" ||
      k === "boundsWorld"
    ) {
      continue;
    }
    if (v && typeof v === "object") out[k] = flipWorldTree(v, keys);
  }
  return out;
};

const writeJson = (rel, data) => {
  const file = path.join(root, rel);
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
  console.log("flipped", rel);
};

// --- OSM buildings (hardcoded world rings) ---
{
  const rel = "src/data/sepang-osm-buildings.json";
  const data = JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));
  for (const b of data.buildings ?? []) {
    if (b.centroidWorld) b.centroidWorld.x = -b.centroidWorld.x;
    if (Array.isArray(b.ringWorld)) {
      for (const p of b.ringWorld) p.x = -p.x;
    }
  }
  writeJson(rel, data);
}

// --- Heightmaps ---
for (const rel of [
  "src/data/sepang-heightmap.json",
  "public/terrain/sepang-heightmap.json",
]) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) {
    console.log("skip missing", rel);
    continue;
  }
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  data.boundsWorld = flipBoundsX(data.boundsWorld);
  if (data.transform) data.transform.flipX = !data.transform.flipX;
  writeJson(rel, data);
}

// --- Ortho meta ---
{
  const rel = "public/textures/sepang-ortho.meta.json";
  const file = path.join(root, rel);
  if (fs.existsSync(file)) {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    if (data.boundsWorld) data.boundsWorld = flipBoundsX(data.boundsWorld);
    writeJson(rel, data);
  }
}

// --- Pit points JSON ---
{
  const rel = "public/tracks/sepang-pit-points.json";
  const file = path.join(root, rel);
  if (fs.existsSync(file)) {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    const flipped = data.map((p) => ({ ...p, x: -p.x }));
    writeJson(rel, flipped);
  }
}

// --- Pit lane CSV ---
{
  const rel = "public/tracks/sepang-pit-lane.csv";
  const file = path.join(root, rel);
  if (fs.existsSync(file)) {
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    const out = lines.map((line) => {
      if (!line || line.startsWith("#")) return line;
      const parts = line.split(",");
      if (parts.length < 3) return line;
      const x = -Number(parts[0]);
      if (!Number.isFinite(x)) return line;
      parts[0] = String(Number(x.toFixed(4)));
      return parts.join(",");
    });
    fs.writeFileSync(file, out.join("\n"));
    console.log("flipped", rel);
  }
}

// --- Campus layout fixedWorld + yawOverride ---
{
  const rel = "src/lib/sepangCampusLayout.ts";
  let src = fs.readFileSync(path.join(root, rel), "utf8");
  src = src.replace(
    /fixedWorld:\s*\{\s*x:\s*(-?[\d.]+),\s*z:\s*(-?[\d.]+)\s*\}/g,
    (_, x, z) => `fixedWorld: { x: ${-Number(x)}, z: ${z} }`,
  );
  src = src.replace(
    /yawOverride:\s*(-?[\d.]+)/g,
    (_, y) => `yawOverride: ${-Number(y)}`,
  );
  fs.writeFileSync(path.join(root, rel), src);
  console.log("flipped", rel, "fixedWorld + yawOverride");
}

console.log("\nNext: rebuild campus-env.glb (world-baked) with:");
console.log("  nub x tsx --tsconfig tsconfig.json scripts/build-campus-env-glb.ts");
