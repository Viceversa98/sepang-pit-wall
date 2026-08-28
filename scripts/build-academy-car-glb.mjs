/**
 * Bake Academy-style open-wheel body with WIDE plan silhouette.
 * Run: node scripts/build-academy-car-glb.mjs
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
const OUT = path.join(__dirname, "../public/models/car/academy-body.glb");
const METRES_PER_UNIT = 4;
const u = (m) => m / METRES_PER_UNIT;

const wheelbase = u(3.7);
const frontZ = wheelbase * 0.5;
const rearZ = -wheelbase * 0.5;

const bodyMat = new THREE.MeshStandardMaterial({
  color: "#38bdf8",
  metalness: 0.45,
  roughness: 0.35,
  name: "bodyPaint",
});
const carbonMat = new THREE.MeshStandardMaterial({
  color: "#111114",
  metalness: 0.3,
  roughness: 0.65,
  name: "carbon",
});

/** Top-view F1 silhouette: tip → fat sidepods → coke-bottle → gearbox */
const buildPlanHull = (depth, yLift, bevel) => {
  const tipZ = frontZ + u(1.3);
  const shape = new THREE.Shape();
  // Right half (x = lateral, y = long Z in shape space)
  const right = [
    [0.0, tipZ],
    [u(0.06), tipZ - u(0.25)],
    [u(0.12), tipZ - u(0.55)],
    [u(0.2), frontZ + u(0.15)],
    [u(0.28), frontZ - u(0.15)],
    [u(0.55), u(1.2)],
    [u(0.85), u(0.75)],
    [u(0.95), u(0.25)],
    [u(0.92), u(-0.15)],
    [u(0.7), u(-0.55)],
    [u(0.42), u(-0.95)],
    [u(0.22), u(-1.3)],
    [u(0.12), rearZ + u(0.25)],
  ];
  shape.moveTo(right[0][0], right[0][1]);
  for (let i = 1; i < right.length; i++) shape.lineTo(right[i][0], right[i][1]);
  for (let i = right.length - 2; i >= 0; i--) shape.lineTo(-right[i][0], right[i][1]);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel * 0.85,
    bevelSegments: 3,
    curveSegments: 6,
  });
  geo.rotateX(Math.PI / 2);
  geo.translate(0, depth + yLift, 0);
  geo.computeVertexNormals();
  return geo;
};

const root = new THREE.Group();
root.name = "academyBody";

const hull = new THREE.Mesh(buildPlanHull(u(0.28), u(0.08), u(0.05)), bodyMat);
hull.name = "hull";
hull.castShadow = true;
hull.receiveShadow = true;
root.add(hull);

const cover = new THREE.Mesh(buildPlanHull(u(0.22), u(0.32), u(0.04)), bodyMat);
cover.name = "cover";
cover.scale.set(0.55, 1, 0.85);
cover.position.z = u(-0.15);
cover.castShadow = true;
root.add(cover);

// Sidepod volume boost — offset capsules along Z
const addPod = (side) => {
  const zs = [u(0.9), u(0.45), u(0.0), u(-0.4), u(-0.8)];
  const radii = [u(0.22), u(0.28), u(0.3), u(0.24), u(0.16)];
  for (let i = 0; i < zs.length; i++) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(radii[i], 14, 12),
      bodyMat,
    );
    m.position.set(side * u(0.55), u(0.32), zs[i]);
    m.scale.set(1.15, 0.85, 1.35);
    m.name = `pod_${side}_${i}`;
    m.castShadow = true;
    root.add(m);
  }
};
addPod(-1);
addPod(1);

const fin = new THREE.Mesh(new THREE.BoxGeometry(u(0.028), u(0.45), u(0.95)), bodyMat);
fin.position.set(0, u(0.75), u(-0.95));
fin.name = "fin";
fin.castShadow = true;
root.add(fin);

const airbox = new THREE.Mesh(new THREE.SphereGeometry(u(0.16), 14, 12), bodyMat);
airbox.position.set(0, u(0.85), u(-0.25));
airbox.scale.set(1.1, 0.9, 1.2);
airbox.name = "airbox";
airbox.castShadow = true;
root.add(airbox);

const floor = new THREE.Mesh(new THREE.BoxGeometry(u(1.6), u(0.04), u(3.5)), carbonMat);
floor.position.set(0, u(0.04), u(0.0));
floor.name = "floor";
floor.castShadow = true;
root.add(floor);

const exporter = new GLTFExporter();
const result = await new Promise((resolve, reject) => {
  exporter.parse(root, resolve, reject, { binary: true });
});
const buf = Buffer.from(result);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, buf);
console.log(`Wrote ${OUT} (${buf.length} bytes)`);
