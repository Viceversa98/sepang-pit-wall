import * as THREE from "three";
import type { CampusPlacement } from "@/lib/sepangCampusLayout";
import { prepareStaticMesh } from "@/lib/staticMesh";

const EPS = 1e-6;

/** True when the loaded asset contains at least one mesh. */
export const campusGlbHasMeshes = (root: THREE.Object3D): boolean => {
  let found = false;
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) found = true;
  });
  return found;
};

/**
 * Scale + center a campus GLB to match procedural kit footprint (placement.size).
 * Procedural kits sit on the root origin with vertical center at y=0.
 */
export const fitCampusGlbToPlacement = (
  model: THREE.Object3D,
  placement: CampusPlacement,
): void => {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  if (box.isEmpty()) return;

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
};

/** Reject fits that collapse geometry or produce non-finite transforms. */
export const isCampusGlbFitValid = (
  model: THREE.Object3D,
  placement: CampusPlacement,
): boolean => {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  if (box.isEmpty()) return false;

  const size = new THREE.Vector3();
  box.getSize(size);
  const minDim = Math.min(size.x, size.y, size.z);
  if (!Number.isFinite(minDim) || minDim < EPS) return false;

  const { x, y, z } = model.scale;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return false;
  if (x <= EPS || y <= EPS || z <= EPS) return false;

  const target = placement.size;
  const maxScale = 8;
  if (x > maxScale || y > maxScale || z > maxScale) return false;
  if (size.x > target.x * maxScale || size.y > target.y * maxScale || size.z > target.z * maxScale) {
    return false;
  }

  return true;
};

/** Mobile-safe defaults — avoid bad bounds culling on large instanced GLBs. */
export const prepareCampusGlbForScene = (model: THREE.Object3D): void => {
  prepareStaticMesh(model);
  model.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    obj.castShadow = true;
    obj.receiveShadow = true;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      if (mat instanceof THREE.MeshStandardMaterial) {
        mat.side = THREE.FrontSide;
      }
    }
  });
};
