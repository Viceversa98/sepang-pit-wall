/**
 * Bake all campus procedural kits into one world-positioned GLB.
 * Run: nub x tsx --tsconfig tsconfig.json scripts/build-campus-env-glb.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { resolveCampusPlacements } from "../src/lib/sepangCampusLayout";
import { buildCampusKit } from "../src/scene/campus/buildKit";

if (typeof globalThis.FileReader === "undefined") {
  globalThis.FileReader = class FileReader {
    result: ArrayBuffer | null = null;
    onload: ((ev: { target: FileReader }) => void) | null = null;
    onloadend: ((ev: { target: FileReader }) => void) | null = null;
    onerror: ((err: unknown) => void) | null = null;
    readAsArrayBuffer(blob: Blob) {
      Promise.resolve(blob.arrayBuffer())
        .then((buf) => {
          this.result = buf;
          this.onload?.({ target: this });
          this.onloadend?.({ target: this });
        })
        .catch((err) => this.onerror?.(err));
    }
  } as unknown as typeof FileReader;
}

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(rootDir, "../public/models/sepang/campus-env.glb");

const scene = new THREE.Group();
scene.name = "sepang-campus-env";

for (const placement of resolveCampusPlacements()) {
  const anchor = new THREE.Group();
  anchor.name = `campus-${placement.id}-${placement.segmentIndex}`;
  anchor.position.copy(placement.position);
  anchor.rotation.y = placement.yaw;
  anchor.add(buildCampusKit(placement));
  scene.add(anchor);
}

const exporter = new GLTFExporter();
const binary = await new Promise<ArrayBuffer>((resolve, reject) => {
  exporter.parse(scene, resolve, reject, { binary: true });
});

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, Buffer.from(binary));
console.log(`Wrote ${outPath} (${binary.byteLength} bytes, ${scene.children.length} anchors)`);
