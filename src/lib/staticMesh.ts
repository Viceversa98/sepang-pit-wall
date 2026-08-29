import * as THREE from "three";

/** Large static world meshes — keep visible in overview / chase (bad AABB cull on mobile). */
export const prepareStaticMesh = (root: THREE.Object3D): void => {
  root.traverse((obj) => {
    if (obj instanceof THREE.InstancedMesh) {
      obj.frustumCulled = false;
      obj.geometry?.computeBoundingSphere();
      return;
    }
    if (!(obj instanceof THREE.Mesh)) return;
    obj.frustumCulled = false;
    obj.geometry?.computeBoundingSphere();
  });
};
