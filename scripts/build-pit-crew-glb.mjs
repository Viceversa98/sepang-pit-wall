/**
 * Bake procedural pit crew mesh for PitStopCrew GLB swap.
 * Run: node scripts/build-pit-crew-glb.mjs
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

if (typeof globalThis.FileReader === "undefined") {
  globalThis.FileReader = class FileReader {
    result = null;
    onload = null;
    onloadend = null;
    onerror = null;
    readAsArrayBuffer(blob) {
      Promise.resolve(blob.arrayBuffer())
        .then((buf) => {
          this.result = buf;
          this.onload?.({ target: this });
          this.onloadend?.({ target: this });
        })
        .catch((err) => this.onerror?.(err));
    }
  };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "../public/models/pit/crew.glb");
const METRES_PER_UNIT = 4;
const u = (m) => m / METRES_PER_UNIT;

const suitMat = new THREE.MeshStandardMaterial({
  color: "#e2e8f0",
  roughness: 0.45,
  metalness: 0.15,
});
const helmetMat = new THREE.MeshStandardMaterial({
  color: "#0f172a",
  roughness: 0.25,
  metalness: 0.55,
});
const visorMat = new THREE.MeshStandardMaterial({
  color: "#38bdf8",
  emissive: "#0ea5e9",
  emissiveIntensity: 0.25,
  transparent: true,
  opacity: 0.65,
  roughness: 0.1,
  metalness: 0.8,
});
const gunMat = new THREE.MeshStandardMaterial({
  color: "#fbbf24",
  metalness: 0.7,
  roughness: 0.25,
});

const root = new THREE.Group();
root.name = "pitCrew";

const crouch = 0.35;
const legGeo = new THREE.CapsuleGeometry(u(0.09), u(0.45), 4, 8);
const leftLeg = new THREE.Mesh(legGeo, suitMat);
leftLeg.position.set(-u(0.12), u(0.35 - crouch * 0.2), 0);
leftLeg.name = "leftLeg";
root.add(leftLeg);

const rightLeg = new THREE.Mesh(legGeo, suitMat);
rightLeg.position.set(u(0.12), u(0.35 - crouch * 0.2), 0);
rightLeg.name = "rightLeg";
root.add(rightLeg);

const torso = new THREE.Mesh(
  new THREE.BoxGeometry(u(0.42), u(0.55), u(0.28)),
  suitMat,
);
torso.position.y = u(0.95 - crouch);
torso.name = "torso";
root.add(torso);

const armGeo = new THREE.CapsuleGeometry(u(0.07), u(0.4), 4, 6);
const leftArm = new THREE.Mesh(armGeo, suitMat);
leftArm.position.set(-u(0.32), u(0.95 - crouch), u(0.22));
leftArm.rotation.set(0.5, 0, -0.4);
leftArm.name = "leftArm";
root.add(leftArm);

const rightArm = new THREE.Mesh(armGeo, suitMat);
rightArm.position.set(u(0.32), u(0.95 - crouch), u(0.22));
rightArm.rotation.set(0.5, 0, 0.4);
rightArm.name = "rightArm";
root.add(rightArm);

const helmet = new THREE.Mesh(new THREE.SphereGeometry(u(0.18), 16, 16), helmetMat);
helmet.position.y = u(1.42 - crouch);
helmet.name = "helmet";
root.add(helmet);

const visor = new THREE.Mesh(
  new THREE.BoxGeometry(u(0.22), u(0.1), u(0.06)),
  visorMat,
);
visor.position.set(0, u(1.4 - crouch), u(0.12));
visor.name = "visor";
root.add(visor);

const gun = new THREE.Mesh(
  new THREE.CylinderGeometry(u(0.06), u(0.08), u(0.35), 8),
  gunMat,
);
gun.position.set(0, u(0.7 - crouch), u(0.55));
gun.name = "gun";
root.add(gun);

const exporter = new GLTFExporter();
const result = await new Promise((resolve, reject) => {
  exporter.parse(root, resolve, reject, { binary: true });
});
const buf = Buffer.from(result);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, buf);
console.log(`Wrote ${OUT} (${buf.length} bytes)`);
