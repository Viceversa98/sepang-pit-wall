import * as THREE from "three";
import osmBuildingsJson from "@/data/sepang-osm-buildings.json";
import {
  CAMPUS_BUILDINGS,
  cornerWorld,
  resolveCampusPlacements,
} from "@/lib/sepangCampusLayout";
import { METRES_PER_UNIT } from "@/lib/trackCurve";
import { sampleTerrainHeight } from "@/lib/terrainHeight";
import { createConcrete } from "@/scene/campus/materials";

type OsmBuildingRecord = {
  osmId: number;
  name: string | null;
  heroId: string | null;
  heightM: number;
  ringWorld: { x: number; z: number }[];
};

type OsmBuildingsFile = {
  buildings: OsmBuildingRecord[];
};

const heroFootprintContains = (
  cx: number,
  cz: number,
  placements: ReturnType<typeof resolveCampusPlacements>,
): boolean => {
  for (const p of placements) {
    const hx = p.size.x / 2 + 4;
    const hz = p.size.z / 2 + 4;
    const corners = [
      [-hx, -hz],
      [-hx, hz],
      [hx, -hz],
      [hx, hz],
    ].map(([x, z]) => cornerWorld(p.position, p.yaw, x, z));
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const c of corners) {
      minX = Math.min(minX, c.x);
      maxX = Math.max(maxX, c.x);
      minZ = Math.min(minZ, c.z);
      maxZ = Math.max(maxZ, c.z);
    }
    if (cx >= minX && cx <= maxX && cz >= minZ && cz <= maxZ) return true;
  }
  return false;
};

const extrudeFootprint = (
  ring: { x: number; z: number }[],
  heightU: number,
): THREE.BufferGeometry | null => {
  if (ring.length < 3) return null;
  const shape = new THREE.Shape();
  shape.moveTo(ring[0].x, ring[0].z);
  for (let i = 1; i < ring.length; i++) {
    shape.lineTo(ring[i].x, ring[i].z);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: heightU,
    bevelEnabled: false,
  });
  geo.rotateX(-Math.PI / 2);
  return geo;
};

export const buildOsmBackdrop = (): THREE.Group => {
  const group = new THREE.Group();
  group.name = "sepang-osm-backdrop";

  const data = osmBuildingsJson as OsmBuildingsFile;
  const placements = resolveCampusPlacements();
  const heroIds = new Set(CAMPUS_BUILDINGS.map((d) => d.id));

  const mat = createConcrete("#7c8594");
  mat.metalness = 0.04;

  const geos: THREE.BufferGeometry[] = [];

  for (const b of data.buildings) {
    if (b.heroId && heroIds.has(b.heroId as (typeof CAMPUS_BUILDINGS)[number]["id"])) {
      continue;
    }
    if ((b.name ?? "").toLowerCase() === "roof") continue;

    let cx = 0;
    let cz = 0;
    for (const p of b.ringWorld) {
      cx += p.x;
      cz += p.z;
    }
    cx /= b.ringWorld.length;
    cz /= b.ringWorld.length;

    if (heroFootprintContains(cx, cz, placements)) continue;

    const heightU = b.heightM / METRES_PER_UNIT;
    const geo = extrudeFootprint(b.ringWorld, heightU);
    if (!geo) continue;

    const baseY = sampleTerrainHeight(cx, cz);
    geo.translate(0, baseY, 0);
    geos.push(geo);
  }

  if (geos.length === 0) return group;

  const merged = mergeGeometriesCompat(geos);
  for (const g of geos) g.dispose();

  const mesh = new THREE.Mesh(merged, mat);
  mesh.name = "osm-backdrop-merged";
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  group.add(mesh);

  return group;
};

/** Merge without importing three/examples if unavailable at runtime bundle edge. */
const mergeGeometriesCompat = (geos: THREE.BufferGeometry[]): THREE.BufferGeometry => {
  if (geos.length === 1) return geos[0];
  const merged = new THREE.BufferGeometry();
  const positions: number[] = [];
  const normals: number[] = [];
  for (const geo of geos) {
    geo.computeVertexNormals();
    const pos = geo.getAttribute("position");
    const norm = geo.getAttribute("normal");
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      normals.push(norm.getX(i), norm.getY(i), norm.getZ(i));
    }
  }
  merged.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  return merged;
};

export const disposeOsmBackdrop = (group: THREE.Group): void => {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry?.dispose();
      if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
      else obj.material?.dispose();
    }
  });
};
