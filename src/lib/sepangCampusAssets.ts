import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { CampusBuildingId } from "@/lib/sepangCampusLayout";

/**
 * Optional artist GLB overrides. When absent, `/models/sepang/{id}.glb` is probed at runtime.
 */
export const CAMPUS_GLB: Partial<Record<CampusBuildingId, string>> = {};

export const defaultCampusGlbUrl = (id: CampusBuildingId): string =>
  `/models/sepang/${id}.glb`;

export const campusGltfUrl = (id: CampusBuildingId): string =>
  CAMPUS_GLB[id] ?? defaultCampusGlbUrl(id);

const loader = new GLTFLoader();

export const campusGlbExists = async (url: string): Promise<boolean> => {
  try {
    const res = await fetch(url, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
};

export const preloadCampusGlbs = (): void => {
  for (const url of Object.values(CAMPUS_GLB)) {
    if (url) void loader.loadAsync(url);
  }
};

export const loadCampusGltf = (url: string) => loader.loadAsync(url);
