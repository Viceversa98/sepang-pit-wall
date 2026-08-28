import * as THREE from "three";
import {
  campusGlbExists,
  campusGltfUrl,
  loadCampusGltf,
  preloadCampusGlbs,
} from "@/lib/sepangCampusAssets";
import { LOD_DISTANCES, resolveCampusPlacements, type CampusPlacement } from "@/lib/sepangCampusLayout";
import { buildCampusKit } from "@/scene/campus/buildKit";

type CampusEntry = {
  root: THREE.Group;
  lod: "hero" | "mid" | "far";
  anchor: THREE.Vector3;
};

export type SepangCampusHandle = {
  group: THREE.Group;
  update: (camera: THREE.Camera) => void;
  dispose: () => void;
};

const lodThresholds = (lod: CampusEntry["lod"]): [number, number, number] => LOD_DISTANCES[lod];

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

const trySwapCampusGlb = async (
  placement: CampusPlacement,
  root: THREE.Group,
  procedural: THREE.Group,
): Promise<void> => {
  const url = campusGltfUrl(placement.id);
  if (!(await campusGlbExists(url))) return;

  try {
    const gltf = await loadCampusGltf(url);
    const model = gltf.scene.clone(true);
    model.name = `campus-glb-${placement.id}`;
    root.remove(procedural);
    disposeGroup(procedural);
    root.add(model);
  } catch {
    /* keep procedural kit */
  }
};

export const createSepangCampus = (): SepangCampusHandle => {
  preloadCampusGlbs();

  const group = new THREE.Group();
  group.name = "sepang-campus";
  const entries: CampusEntry[] = [];

  const placements = resolveCampusPlacements();
  for (const placement of placements) {
    const root = new THREE.Group();
    root.name = `campus-${placement.id}-${placement.segmentIndex}`;
    root.position.copy(placement.position);
    root.rotation.y = placement.yaw;

    const mesh = buildCampusKit(placement);
    root.add(mesh);
    group.add(root);
    void trySwapCampusGlb(placement, root, mesh);

    entries.push({
      root,
      lod: placement.def.lod,
      anchor: placement.position.clone(),
    });
  }

  const update = (camera: THREE.Camera): void => {
    const camPos = camera.position;
    for (const entry of entries) {
      const dist = camPos.distanceTo(entry.anchor);
      const [near, mid, far] = lodThresholds(entry.lod);
      entry.root.visible = dist <= far;
      entry.root.scale.setScalar(dist > mid ? 0.92 : dist > near ? 0.98 : 1);
    }
  };

  const dispose = (): void => {
    for (const entry of entries) {
      disposeGroup(entry.root);
    }
    group.clear();
  };

  return { group, update, dispose };
};
