import * as THREE from "three";
import {
  campusGlbHasMeshes,
  fitCampusGlbToPlacement,
  isCampusGlbFitValid,
  prepareCampusGlbForScene,
} from "@/lib/fitCampusGlb";
import { detectRaceSceneQuality } from "@/lib/qualityTier";
import {
  CAMPUS_ENV_GLB_URL,
  campusGltfUrl,
  loadCampusGltf,
} from "@/lib/sepangCampusAssets";
import { resolveCampusPlacements, type CampusPlacement } from "@/lib/sepangCampusLayout";
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

const PER_BUILDING_CONCURRENCY = 2;

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
  alive: () => boolean,
): Promise<void> => {
  if (!alive()) return;

  const url = campusGltfUrl(placement.id);

  try {
    const gltf = await loadCampusGltf(url);
    if (!alive()) return;

    const model = gltf.scene.clone(true);
    if (!campusGlbHasMeshes(model)) return;

    fitCampusGlbToPlacement(model, placement);
    if (!isCampusGlbFitValid(model, placement)) return;

    prepareCampusGlbForScene(model);
    model.name = `campus-glb-${placement.id}-${placement.segmentIndex}`;

    if (!alive() || procedural.parent !== root) return;

    procedural.visible = false;
    root.add(model);
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn(`[campus] GLB swap failed for ${placement.id}:`, err);
    }
  }
};

const runPerBuildingSwaps = (
  placements: CampusPlacement[],
  entryByKey: Map<string, CampusEntry>,
  alive: () => boolean,
): void => {
  let cursor = 0;
  let active = 0;

  const pump = (): void => {
    while (active < PER_BUILDING_CONCURRENCY && cursor < placements.length) {
      const placement = placements[cursor++];
      const entry = entryByKey.get(`${placement.id}-${placement.segmentIndex}`);
      if (!entry) continue;
      active += 1;
      void trySwapCampusGlb(placement, entry.root, entry.procedural, alive).finally(() => {
        active -= 1;
        pump();
      });
    }
  };

  pump();
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
      console.warn("[campus] merged campus-env.glb unavailable, using procedural fallback:", err);
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
  const entryByKey = new Map<string, CampusEntry>();

  for (const placement of placements) {
    const root = new THREE.Group();
    root.name = `campus-${placement.id}-${placement.segmentIndex}`;
    root.position.copy(placement.position);
    root.rotation.y = placement.yaw;

    const procedural = buildCampusKit(placement);
    prepareStaticMesh(procedural);
    root.add(procedural);
    group.add(root);

    const entry = { root, procedural };
    entries.push(entry);
    entryByKey.set(`${placement.id}-${placement.segmentIndex}`, entry);
  }

  const quality = detectRaceSceneQuality();

  void tryLoadMergedCampusEnv(group, entries, alive).then((merged) => {
    if (!alive() || merged) return;
    if (quality.tier === "mobile") return;
    runPerBuildingSwaps(placements, entryByKey, alive);
  });

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
