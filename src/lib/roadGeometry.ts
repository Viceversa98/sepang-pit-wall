import * as THREE from "three";
import { metresToUnits } from "@/lib/trackCurve";
import { sampleTerrainHeight } from "@/lib/terrainHeight";

export type HeightSampler = (wx: number, wz: number) => number;

export type RoadRibbonOptions = {
  width: number;
  segments?: number;
  closed?: boolean;
  yOffset?: number;
  heightSampler?: HeightSampler;
};

const UP = new THREE.Vector3(0, 1, 0);

const defaultHeightSampler: HeightSampler = (wx, wz) => sampleTerrainHeight(wx, wz);

const liftY = (
  p: THREE.Vector3,
  yOffset: number,
  sampler: HeightSampler,
): void => {
  p.y = sampler(p.x, p.z) + yOffset;
};

/**
 * Sample curve with flip-stable side vectors so the ribbon never twists
 * inside-out (which looked like gaps / cars driving "off" the kerbs).
 */
const sampleCenterline = (
  curve: THREE.Curve<THREE.Vector3>,
  segments: number,
  closed: boolean,
): { point: THREE.Vector3; side: THREE.Vector3 }[] => {
  const count = closed ? segments : segments + 1;
  const samples: { point: THREE.Vector3; side: THREE.Vector3 }[] = [];
  let prevSide: THREE.Vector3 | null = null;

  for (let i = 0; i < count; i++) {
    const t = closed ? i / segments : i / segments;
    const point = curve.getPointAt(Math.min(t, 1));
    const tangent = curve.getTangentAt(Math.min(t, 0.999999)).normalize();
    let side = new THREE.Vector3().crossVectors(UP, tangent);
    if (side.lengthSq() < 1e-10) {
      side.set(1, 0, 0);
    } else {
      side.normalize();
    }
    if (prevSide && side.dot(prevSide) < 0) {
      side.negate();
    }
    prevSide = side.clone();
    samples.push({ point, side });
  }

  return samples;
};

/**
 * Flat asphalt strip along a 3D curve (race road, not a tube).
 */
export const createRoadRibbon = (
  curve: THREE.Curve<THREE.Vector3>,
  options: RoadRibbonOptions,
): THREE.BufferGeometry => {
  const width = options.width;
  const segments = options.segments ?? 400;
  const closed = options.closed ?? false;
  const yOffset = options.yOffset ?? 0.02;
  const sampler = options.heightSampler ?? defaultHeightSampler;
  const half = width / 2;

  const samples = sampleCenterline(curve, segments, closed);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < samples.length; i++) {
    const { point, side } = samples[i];
    const left = point.clone().addScaledVector(side, -half);
    const right = point.clone().addScaledVector(side, half);
    liftY(left, yOffset, sampler);
    liftY(right, yOffset, sampler);
    positions.push(left.x, left.y, left.z, right.x, right.y, right.z);
    normals.push(0, 1, 0, 0, 1, 0);
    const u = i / Math.max(samples.length - 1, 1);
    uvs.push(0, u * 24, 1, u * 24);
  }

  const edgeCount = closed ? samples.length : samples.length - 1;
  for (let i = 0; i < edgeCount; i++) {
    const i0 = i;
    const i1 = closed ? (i + 1) % samples.length : i + 1;
    const a = i0 * 2;
    const b = a + 1;
    const c = i1 * 2;
    const d = c + 1;
    indices.push(a, b, c, b, d, c);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
};

const makeKerbStripeTexture = (): THREE.CanvasTexture => {
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  for (let y = 0; y < 64; y++) {
    const white = Math.floor(y / 8) % 2 === 0;
    ctx.fillStyle = white ? "#f8fafc" : "#ef4444";
    ctx.fillRect(0, y, 4, 1);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};

let kerbStripeTex: THREE.CanvasTexture | null = null;

export const getKerbStripeTexture = (): THREE.CanvasTexture => {
  if (!kerbStripeTex) kerbStripeTex = makeKerbStripeTexture();
  return kerbStripeTex;
};

/** Thin edge stripe along one side of the road (curb). */
export const createCurbRibbon = (
  curve: THREE.Curve<THREE.Vector3>,
  options: {
    roadWidth: number;
    curbWidth?: number;
    side: 1 | -1;
    segments?: number;
    closed?: boolean;
    yOffset?: number;
    heightSampler?: HeightSampler;
  },
): THREE.BufferGeometry => {
  const roadHalf = options.roadWidth / 2;
  const curbW = options.curbWidth ?? 0.14;
  const segments = options.segments ?? 400;
  const closed = options.closed ?? false;
  const yOffset = options.yOffset ?? 0.045;
  const sampler = options.heightSampler ?? defaultHeightSampler;
  const sign = options.side;

  const samples = sampleCenterline(curve, segments, closed);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < samples.length; i++) {
    const { point, side } = samples[i];
    const inner = point.clone().addScaledVector(side, sign * (roadHalf - curbW));
    const outer = point.clone().addScaledVector(side, sign * (roadHalf + 0.02));
    liftY(inner, yOffset, sampler);
    liftY(outer, yOffset, sampler);
    positions.push(inner.x, inner.y, inner.z, outer.x, outer.y, outer.z);
    normals.push(0, 1, 0, 0, 1, 0);
    const u = i / Math.max(samples.length - 1, 1);
    uvs.push(0, u * 48, 1, u * 48);
  }

  const edgeCount = closed ? samples.length : samples.length - 1;
  for (let i = 0; i < edgeCount; i++) {
    const i0 = i;
    const i1 = closed ? (i + 1) % samples.length : i + 1;
    const a = i0 * 2;
    const b = a + 1;
    const c = i1 * 2;
    const d = c + 1;
    indices.push(a, b, c, b, d, c);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
};

/** Grass / runoff strip outside kerbs. */
export const createRunoffRibbon = (
  curve: THREE.Curve<THREE.Vector3>,
  options: {
    roadWidth: number;
    curbWidth?: number;
    runoffWidth?: number;
    side: 1 | -1;
    segments?: number;
    closed?: boolean;
    yOffset?: number;
    heightSampler?: HeightSampler;
  },
): THREE.BufferGeometry => {
  const roadHalf = options.roadWidth / 2;
  const curbW = options.curbWidth ?? metresToUnits(0.55);
  const runoffW = options.runoffWidth ?? metresToUnits(4);
  const segments = options.segments ?? 400;
  const closed = options.closed ?? false;
  const yOffset = options.yOffset ?? 0.01;
  const sampler = options.heightSampler ?? defaultHeightSampler;
  const sign = options.side;

  const samples = sampleCenterline(curve, segments, closed);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < samples.length; i++) {
    const { point, side } = samples[i];
    const inner = point.clone().addScaledVector(side, sign * (roadHalf + curbW));
    const outer = point.clone().addScaledVector(side, sign * (roadHalf + curbW + runoffW));
    liftY(inner, yOffset, sampler);
    liftY(outer, yOffset, sampler);
    positions.push(inner.x, inner.y, inner.z, outer.x, outer.y, outer.z);
    normals.push(0, 1, 0, 0, 1, 0);
    const u = i / Math.max(samples.length - 1, 1);
    uvs.push(0, u * 16, 1, u * 16);
  }

  const edgeCount = closed ? samples.length : samples.length - 1;
  for (let i = 0; i < edgeCount; i++) {
    const i0 = i;
    const i1 = closed ? (i + 1) % samples.length : i + 1;
    const a = i0 * 2;
    const b = a + 1;
    const c = i1 * 2;
    const d = c + 1;
    indices.push(a, b, c, b, d, c);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
};
