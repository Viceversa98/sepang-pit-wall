import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import type { CampusBuildingId } from "@/lib/sepangCampusLayout";

/**
 * Optional artist GLB overrides. When absent, `/models/sepang/{id}.glb` is probed at runtime.
 */
export const CAMPUS_GLB: Partial<Record<CampusBuildingId, string>> = {};

const BASE = import.meta.env.BASE_URL;

export const defaultCampusGlbUrl = (id: CampusBuildingId): string =>
  `${BASE}models/sepang/${id}.glb`;

/** Single batched environment — one HTTP request instead of 15+ per-building GLBs. */
export const CAMPUS_ENV_GLB_URL = `${BASE}models/sepang/campus-env.glb`;

export const campusGltfUrl = (id: CampusBuildingId): string =>
  CAMPUS_GLB[id] ?? defaultCampusGlbUrl(id);

const loader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.7/");
loader.setDRACOLoader(dracoLoader);

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
  void loadCampusGltf(CAMPUS_ENV_GLB_URL);
};
