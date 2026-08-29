import * as THREE from "three";
import { getTerrainBounds } from "@/lib/terrainHeight";

const CLOUD_CLUSTER_COUNT = 22;
const PUFF_GEOMETRY = new THREE.SphereGeometry(1, 10, 8);

/** Rain spawns from this altitude band — matches the cloud deck. */
export const RAIN_DECK_Y_MIN = 48;
export const RAIN_DECK_Y_MAX = 60;

export type CloudsHandle = {
  group: THREE.Group;
  updateRain: (rainIntensity: number) => void;
  update: (elapsed: number) => void;
  dispose: () => void;
};

const mulberry32 = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

let cachedBounds: ReturnType<typeof getTerrainBounds> | null = null;
const fieldBounds = () => cachedBounds ?? (cachedBounds = getTerrainBounds());

/** Uniform rain across the full circuit footprint, falling from the cloud deck. */
export const sampleRainInField = (
  out: THREE.Vector3,
  randomHeight = false,
): void => {
  const { minX, maxX, minZ, maxZ } = fieldBounds();
  out.x = minX + Math.random() * (maxX - minX);
  out.z = minZ + Math.random() * (maxZ - minZ);
  out.y = randomHeight
    ? RAIN_DECK_Y_MIN + Math.random() * (RAIN_DECK_Y_MAX - RAIN_DECK_Y_MIN)
    : RAIN_DECK_Y_MIN + Math.random() * 2.5;
};

export const createClouds = (): CloudsHandle => {
  const group = new THREE.Group();
  group.name = "skyClouds";

  const { minX, maxX, minZ, maxZ } = fieldBounds();
  const spanX = maxX - minX;
  const spanZ = maxZ - minZ;

  const basePositions: { x: number; z: number; baseY: number }[] = [];
  const puffMaterials: THREE.MeshLambertMaterial[] = [];
  const clusters: THREE.Group[] = [];
  const rand = mulberry32(0xc0ffee42);

  const dryColor = new THREE.Color("#f8fafc");
  const stormColor = new THREE.Color("#64748b");

  for (let c = 0; c < CLOUD_CLUSTER_COUNT; c++) {
    const cluster = new THREE.Group();
    cluster.name = `cloud-${c}`;

    const x = minX + rand() * spanX;
    const z = minZ + rand() * spanZ;
    const baseY = RAIN_DECK_Y_MIN + rand() * (RAIN_DECK_Y_MAX - RAIN_DECK_Y_MIN);
    const radius = 18 + rand() * 28;

    basePositions.push({ x, z, baseY });

    const puffCount = 6 + Math.floor(rand() * 6);
    for (let p = 0; p < puffCount; p++) {
      const scale = 5 + rand() * 12;
      const mat = new THREE.MeshLambertMaterial({
        color: dryColor.clone(),
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
        flatShading: true,
      });
      puffMaterials.push(mat);

      const puff = new THREE.Mesh(PUFF_GEOMETRY, mat);
      puff.position.set(
        (rand() - 0.5) * radius * 1.6,
        rand() * 10 + scale * 0.2,
        (rand() - 0.5) * radius * 1.4,
      );
      puff.scale.setScalar(scale);
      cluster.add(puff);
    }

    cluster.position.set(x, baseY, z);
    group.add(cluster);
    clusters.push(cluster);
  }

  let rainIntensity = 0;
  let lastRainIntensity = -1;

  const applyRainLook = (rain: number) => {
    if (rain === lastRainIntensity) return;
    lastRainIntensity = rain;

    const stormMix = Math.min(1, Math.max(0, (rain - 0.08) / 0.75));
    const fairCount = Math.ceil(lerp(CLOUD_CLUSTER_COUNT * 0.3, CLOUD_CLUSTER_COUNT, stormMix));

    for (let i = 0; i < clusters.length; i++) {
      const visible = i < fairCount;
      clusters[i].visible = visible;
      clusters[i].scale.setScalar(lerp(0.9, 1.35, stormMix));
    }

    const color = dryColor.clone().lerp(stormColor, stormMix);
    const opacity = lerp(0.5, 0.92, stormMix);

    for (const mat of puffMaterials) {
      mat.color.copy(color);
      mat.opacity = opacity;
    }
  };

  return {
    group,
    updateRain: (rain: number) => {
      rainIntensity = rain;
      applyRainLook(rain);
    },
    update: (elapsed: number) => {
      const drift = rainIntensity > 0.12 ? 0.35 : 0.12;
      const t = elapsed * drift;
      for (let i = 0; i < clusters.length; i++) {
        const cluster = clusters[i];
        if (!cluster.visible) continue;
        const base = basePositions[i];
        const dx = Math.sin(t * 0.15 + i * 1.7) * 4;
        const dz = Math.cos(t * 0.12 + i * 2.1) * 3.5;
        cluster.position.set(base.x + dx, base.baseY, base.z + dz);
      }
    },
    dispose: () => {
      for (const mat of puffMaterials) mat.dispose();
      PUFF_GEOMETRY.dispose();
    },
  };
};
