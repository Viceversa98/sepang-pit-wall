/**
 * Draco-compress campus-env.glb for mobile VRAM (Phase 1 asset consolidation).
 * Run: node scripts/compress-campus-env.mjs
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const inPath = path.join(rootDir, "../public/models/sepang/campus-env.glb");
const outPath = path.join(rootDir, "../public/models/sepang/campus-env.draco.glb");
const finalPath = inPath;

if (!fs.existsSync(inPath)) {
  console.error("Missing campus-env.glb — run campus:export first.");
  process.exit(1);
}

const run = spawnSync(
  "npx",
  ["@gltf-transform/cli", "draco", inPath, outPath],
  { stdio: "inherit", shell: true },
);

if (run.status !== 0) {
  console.error("gltf-transform failed — keeping uncompressed campus-env.glb");
  process.exit(run.status ?? 1);
}

fs.renameSync(outPath, finalPath);
const size = fs.statSync(finalPath).size;
console.log(`Compressed ${finalPath} (${size} bytes, Draco)`);
