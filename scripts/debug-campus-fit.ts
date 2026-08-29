import fs from "node:fs";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { resolveCampusPlacements } from "../src/lib/sepangCampusLayout";

const EPS = 1e-6;

const fit = (
  model: THREE.Object3D,
  placement: { size: { x: number; y: number; z: number } },
) => {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  if (box.isEmpty()) return "EMPTY" as const;
  const current = new THREE.Vector3();
  box.getSize(current);
  const target = placement.size;
  model.scale.set(
    current.x > EPS ? target.x / current.x : 1,
    current.y > EPS ? target.y / current.y : 1,
    current.z > EPS ? target.z / current.z : 1,
  );
  model.updateMatrixWorld(true);
  box.setFromObject(model);
  const center = new THREE.Vector3();
  box.getCenter(center);
  model.position.sub(center);
  model.updateMatrixWorld(true);
  box.setFromObject(model);
  model.position.y += -target.y / 2 - box.min.y;
  model.updateMatrixWorld(true);
  box.setFromObject(model);
  return {
    scale: model.scale.toArray(),
    pos: model.position.toArray(),
    boxMin: box.min.toArray(),
    boxMax: box.max.toArray(),
    target,
  };
};

const loader = new GLTFLoader();
const placements = resolveCampusPlacements();
console.log("placement count", placements.length);

for (const id of ["pit", "mainGrandstandNorth", "tower", "k1"]) {
  const buf = fs.readFileSync(`public/models/sepang/${id}.glb`);
  const gltf = await new Promise<GLTF>((resolve, reject) =>
    loader.parse(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      "",
      resolve,
      reject,
    ),
  );
  const p = placements.find((x) => x.id === id)!;
  const model = gltf.scene.clone(true);
  const r = fit(model, p);
  console.log(
    `\n${id} seg0 world=(${p.position.x.toFixed(1)},${p.position.y.toFixed(1)},${p.position.z.toFixed(1)})`,
    r,
  );
}
