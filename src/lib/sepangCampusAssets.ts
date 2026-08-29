import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { CampusBuildingId } from "@/lib/sepangCampusLayout";

/**
 * Optional artist GLB overrides. When absent, `/models/sepang/{id}.glb` is probed at runtime.
 */
export const CAMPUS_GLB: Partial<Record<CampusBuildingId, string>> = {};

const BASE = import.meta.env.BASE_URL;

export const defaultCampusGlbUrl = (id: CampusBuildingId): string =>
  `${BASE}models/sepang/${id}.glb`;

export const campusGltfUrl = (id: CampusBuildingId): string =>
  CAMPUS_GLB[id] ?? defaultCampusGlbUrl(id);

const loader = new GLTFLoader();
const gltfCache = new Map<string, Promise<GLTF>>();

export const loadCampusGltf = (url: string): Promise<GLTF> => {
  let pending = gltfCache.get(url);
  if (!pending) {
    pending = loader.loadAsync(url).catch((err) => {
      gltfCache.delete(url);
      throw err;
    });
    gltfCache.set(url, pending);
  }
  return pending;
};

export const preloadCampusGlbs = (): void => {
  for (const url of Object.values(CAMPUS_GLB)) {
    if (url) void loadCampusGltf(url);
  }
};
