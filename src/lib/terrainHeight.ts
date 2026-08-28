import heightmapJson from "@/data/sepang-heightmap.json";
import { METRES_PER_UNIT } from "@/lib/trackCurve";

export type SepangHeightmap = {
  width: number;
  height: number;
  boundsWorld: { minX: number; maxX: number; minZ: number; maxZ: number };
  elevations: number[];
  minElevationM: number;
  trackYOffsetM: number;
  metresPerUnit: number;
};

const hm = heightmapJson as SepangHeightmap;

const bilinear = (wx: number, wz: number): number => {
  const { boundsWorld, width, height, elevations } = hm;
  const { minX, maxX, minZ, maxZ } = boundsWorld;
  const u = (wx - minX) / (maxX - minX);
  const v = (wz - minZ) / (maxZ - minZ);
  const x = Math.max(0, Math.min(width - 1.001, u * (width - 1)));
  const y = Math.max(0, Math.min(height - 1.001, v * (height - 1)));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, width - 1);
  const y1 = Math.min(y0 + 1, height - 1);
  const fx = x - x0;
  const fy = y - y0;
  const i00 = y0 * width + x0;
  const i10 = y0 * width + x1;
  const i01 = y1 * width + x0;
  const i11 = y1 * width + x1;
  return (
    elevations[i00] * (1 - fx) * (1 - fy) +
    elevations[i10] * fx * (1 - fy) +
    elevations[i01] * (1 - fx) * fy +
    elevations[i11] * fx * fy
  );
};

/** Terrain surface height in world units (Three.js Y). */
export const sampleTerrainHeight = (wx: number, wz: number): number => {
  const elevM = bilinear(wx, wz);
  const relM = elevM - hm.minElevationM + hm.trackYOffsetM;
  return relM / METRES_PER_UNIT;
};

export const getTerrainBounds = (): SepangHeightmap["boundsWorld"] => hm.boundsWorld;

export const getTerrainMinY = (): number => {
  const { minX, maxX, minZ, maxZ } = hm.boundsWorld;
  let minY = Infinity;
  const steps = 8;
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      const wx = minX + (i / steps) * (maxX - minX);
      const wz = minZ + (j / steps) * (maxZ - minZ);
      minY = Math.min(minY, sampleTerrainHeight(wx, wz));
    }
  }
  return minY;
};

export const getHeightmapData = (): SepangHeightmap => hm;
