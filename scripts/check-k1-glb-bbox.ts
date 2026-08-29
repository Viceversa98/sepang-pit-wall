import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { resolveCampusPlacements, cornerWorld } from "../src/lib/sepangCampusLayout";
import { projectWorldToTrack } from "../src/lib/trackProjection";
import { FIA } from "../src/lib/trackCurve";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const glbUrl = pathToFileURL(path.join(rootDir, "../public/models/sepang/k1.glb")).href;

const loader = new GLTFLoader();
const half = FIA.trackWidthStartM / 2 + 0.5;

const k1Placements = resolveCampusPlacements().filter((p) => p.id === "k1");
const gltf = await loader.loadAsync(glbUrl);
const model = gltf.scene.clone(true);

for (const p of k1Placements) {
  const root = new THREE.Group();
  root.position.copy(p.position);
  root.rotation.y = p.yaw;
  root.add(model.clone(true));
  root.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(root);
  const corners = [
    new THREE.Vector3(box.min.x, 0, box.min.z),
    new THREE.Vector3(box.min.x, 0, box.max.z),
    new THREE.Vector3(box.max.x, 0, box.min.z),
    new THREE.Vector3(box.max.x, 0, box.max.z),
  ];

  console.log(`\n=== k1 seg ${p.segmentIndex} procedural box ===`);
  const hx = p.size.x / 2;
  const hz = p.size.z / 2;
  for (const [lx, lz] of [
    [-hx, -hz],
    [hx, -hz],
    [-hx, hz],
    [hx, hz],
  ]) {
    const c = cornerWorld(p.position, p.yaw, lx, lz);
    const pr = projectWorldToTrack(c.x, c.z);
    const on = Math.abs(pr.laneOffsetM) <= half;
    console.log(
      `proc corner lane=${pr.laneOffsetM.toFixed(2)}m t=${pr.lapProgress.toFixed(3)} ON=${on}`,
    );
  }

  console.log(`\n=== k1 seg ${p.segmentIndex} GLB world AABB ===`);
  for (const c of corners) {
    const pr = projectWorldToTrack(c.x, c.z);
    const on = Math.abs(pr.laneOffsetM) <= half;
    console.log(
      `glb corner (${c.x.toFixed(1)},${c.z.toFixed(1)}) lane=${pr.laneOffsetM.toFixed(2)}m t=${pr.lapProgress.toFixed(3)} ON=${on}`,
    );
  }
}
