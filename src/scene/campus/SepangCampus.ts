import * as THREE from "three";
import {
  campusGlbHasMeshes,
  prepareCampusGlbForScene,
} from "@/lib/fitCampusGlb";
import { CAMPUS_ENV_GLB_URL, loadCampusGltf } from "@/lib/sepangCampusAssets";
import { resolveCampusPlacements } from "@/lib/sepangCampusLayout";
import { prepareStaticMesh } from "@/lib/staticMesh";
import { buildCampusKit } from "@/scene/campus/buildKit";
import { buildOsmBackdrop, disposeOsmBackdrop } from "@/scene/campus/buildOsmBackdrop";

type CampusEntry = {
  root: THREE.Group;
  procedural: THREE.Group;
};

export type SepangCampusHandle = {
  group: THREE.Group;
  update: (camera: THREE.Camera) => void;
  dispose: () => void;
};

const disposeGroup = (group: THREE.Object3D): void => {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry?.dispose();
      const mat = obj.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    }
  });
};

const tryLoadMergedCampusEnv = async (
  group: THREE.Group,
  entries: CampusEntry[],
  alive: () => boolean,
): Promise<boolean> => {
  try {
    const gltf = await loadCampusGltf(CAMPUS_ENV_GLB_URL);
    if (!alive()) return false;

    const model = gltf.scene.clone(true);
    if (!campusGlbHasMeshes(model)) return false;

    prepareCampusGlbForScene(model);
    prepareStaticMesh(model);
    model.name = "campus-env-merged";

    for (const entry of entries) {
      group.remove(entry.root);
      disposeGroup(entry.root);
    }
    entries.length = 0;

    group.add(model);
    return true;
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn("[campus] campus-env.glb unavailable — procedural fallback:", err);
    }
    return false;
  }
};

export const createSepangCampus = (): SepangCampusHandle => {
  const group = new THREE.Group();
  group.name = "sepang-campus";
  const entries: CampusEntry[] = [];
  let disposed = false;
  const alive = (): boolean => !disposed;

  const backdrop = buildOsmBackdrop();
  prepareStaticMesh(backdrop);
  group.add(backdrop);

  const placements = resolveCampusPlacements();

  for (const placement of placements) {
    const root = new THREE.Group();
    root.name = `campus-${placement.id}-${placement.segmentIndex}`;
    root.position.copy(placement.position);
    root.rotation.y = placement.yaw;

    const procedural = buildCampusKit(placement);
    prepareStaticMesh(procedural);
    root.add(procedural);
    group.add(root);

    entries.push({ root, procedural });
  }

  void tryLoadMergedCampusEnv(group, entries, alive);

  const update = (_camera: THREE.Camera): void => {
    for (const entry of entries) {
      entry.root.visible = true;
      entry.root.scale.setScalar(1);
    }
  };

  const dispose = (): void => {
    disposed = true;
    for (const entry of entries) {
      disposeGroup(entry.root);
    }
    disposeOsmBackdrop(backdrop);
    group.clear();
  };

  return { group, update, dispose };
};
