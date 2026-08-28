import * as THREE from "three";
import { getHeightmapData, sampleTerrainHeight } from "@/lib/terrainHeight";

export type TerrainBuildResult = {
  mesh: THREE.Mesh;
  dispose: () => void;
};

const SEGMENTS = 128;
const GRASS_COLOR = "#1a4d2e";

export { sampleTerrainHeight };

export const buildTerrain = (): TerrainBuildResult => {
  const hm = getHeightmapData();
  const { minX, maxX, minZ, maxZ } = hm.boundsWorld;

  const geo = new THREE.PlaneGeometry(maxX - minX, maxZ - minZ, SEGMENTS, SEGMENTS);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position as THREE.BufferAttribute;

  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i);
    const lz = pos.getZ(i);
    const wx = lx + (minX + maxX) / 2;
    const wz = lz + (minZ + maxZ) / 2;
    pos.setXYZ(i, wx, sampleTerrainHeight(wx, wz), wz);
  }

  geo.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: GRASS_COLOR,
    roughness: 0.94,
    metalness: 0,
  });

  const mesh = new THREE.Mesh(geo, material);
  mesh.name = "sepang-terrain";
  mesh.receiveShadow = true;

  return {
    mesh,
    dispose: () => {
      geo.dispose();
      material.dispose();
    },
  };
};
