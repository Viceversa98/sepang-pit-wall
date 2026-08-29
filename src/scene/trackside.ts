import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { prepareStaticMesh } from "@/lib/staticMesh";
import { getPitCurve, getTrackCurve, metresToUnits } from "@/lib/trackCurve";
import { sampleTerrainHeight } from "@/lib/terrainHeight";

/**
 * Procedural trackside surroundings: barrier walls, catch fences, painted
 * runoff, tire stacks, sponsor hoardings, marshal posts and palm trees.
 * Everything is placed from track-curvature analysis so it follows the
 * circuit automatically; instanced meshes keep draw calls low.
 */

const SAMPLES = 640;
/** Pit complex sits driver-right near S/F — keep that stretch clear. */
const PIT_ZONE_START_T = 0.955;
const PIT_ZONE_END_T = 0.08;
const PIT_SIDE: 1 | -1 = 1;

/** Lateral distances from track centerline (metres). Track half = 7.5 m. */
const PAINT_INNER_M = 12.7;
const PAINT_OUTER_M = 19;
const BARRIER_M = 20.5;
const FENCE_M = 21.4;
const BOARD_M = 13.6;
const TIRE_M = 16;
const MARSHAL_M = 18;

const BARRIER_H_M = 1.1;
const FENCE_H_M = 4.2;

export type TracksideHandle = {
  group: THREE.Group;
  dispose: () => void;
};

type TrackSample = {
  t: number;
  point: THREE.Vector3;
  tangent: THREE.Vector3;
  side: THREE.Vector3;
  /** Normalised curvature 0..1 (box-smoothed). */
  kn: number;
  /** Multiplier on `side` pointing to the outside of the local corner. */
  outSign: 1 | -1;
};

type CornerRun = { start: number; end: number; apex: number; outSign: 1 | -1 };

const UP = new THREE.Vector3(0, 1, 0);

const mulberry32 = (seed: number) => (): number => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
};

const inPitZone = (t: number): boolean => t >= PIT_ZONE_START_T || t <= PIT_ZONE_END_T;

const groundY = (x: number, z: number): number => sampleTerrainHeight(x, z);

const buildSamples = (): TrackSample[] => {
  const curve = getTrackCurve();
  const raw: Array<Omit<TrackSample, "kn" | "outSign">> = [];
  let prevSide: THREE.Vector3 | null = null;

  for (let i = 0; i < SAMPLES; i += 1) {
    const t = i / SAMPLES;
    const point = curve.getPointAt(t);
    const tangent = curve.getTangentAt(Math.min(t, 0.999999)).normalize();
    const side = new THREE.Vector3().crossVectors(UP, tangent);
    if (side.lengthSq() < 1e-10) side.set(1, 0, 0);
    else side.normalize();
    if (prevSide && side.dot(prevSide) < 0) side.negate();
    prevSide = side.clone();
    raw.push({ t, point, tangent, side });
  }

  const signedK = new Float32Array(SAMPLES);
  let maxK = 1e-6;
  const dTan = new THREE.Vector3();
  for (let i = 0; i < SAMPLES; i += 1) {
    const prev = raw[(i - 1 + SAMPLES) % SAMPLES];
    const next = raw[(i + 1) % SAMPLES];
    dTan.copy(next.tangent).sub(prev.tangent);
    signedK[i] = dTan.dot(raw[i].side);
    maxK = Math.max(maxK, Math.abs(signedK[i]));
  }

  const smooth = new Float32Array(SAMPLES);
  for (let i = 0; i < SAMPLES; i += 1) {
    let acc = 0;
    for (let j = -2; j <= 2; j += 1) {
      acc += Math.abs(signedK[(i + j + SAMPLES) % SAMPLES]);
    }
    smooth[i] = acc / 5 / maxK;
  }

  return raw.map((s, i) => ({
    ...s,
    kn: smooth[i],
    outSign: signedK[i] > 0 ? -1 : 1,
  }));
};

const lateralPos = (
  sample: TrackSample,
  lateralM: number,
  sign: number,
  out: THREE.Vector3,
): THREE.Vector3 => {
  out.copy(sample.point).addScaledVector(sample.side, sign * metresToUnits(lateralM));
  out.y = groundY(out.x, out.z);
  return out;
};

/** Contiguous corner regions (kn above threshold), with wrap handling. */
const findCornerRuns = (samples: TrackSample[]): CornerRun[] => {
  const threshold = 0.2;
  const margin = 4;
  // Scan from the straightest sample so no run straddles the scan origin.
  let scanStart = 0;
  for (let i = 1; i < SAMPLES; i += 1) {
    if (samples[i].kn < samples[scanStart].kn) scanStart = i;
  }

  const runs: CornerRun[] = [];
  let runBegin = -1;
  for (let off = 0; off <= SAMPLES; off += 1) {
    const i = (scanStart + off) % SAMPLES;
    const inCorner = off < SAMPLES && samples[i].kn > threshold;
    if (inCorner && runBegin === -1) {
      runBegin = off;
    } else if (!inCorner && runBegin !== -1) {
      const len = off - runBegin;
      if (len >= 3) {
        let apexOff = runBegin;
        for (let o = runBegin; o < off; o += 1) {
          const idx = (scanStart + o) % SAMPLES;
          if (samples[idx].kn > samples[(scanStart + apexOff) % SAMPLES].kn) apexOff = o;
        }
        const apex = (scanStart + apexOff) % SAMPLES;
        runs.push({
          start: (scanStart + runBegin - margin + SAMPLES) % SAMPLES,
          end: (scanStart + off - 1 + margin) % SAMPLES,
          apex,
          outSign: samples[apex].outSign,
        });
      }
      runBegin = -1;
    }
  }
  return runs;
};

/** Iterate indices of a possibly wrapping run (inclusive). */
const runIndices = (start: number, end: number): number[] => {
  const len = ((end - start + SAMPLES) % SAMPLES) + 1;
  return Array.from({ length: len }, (_, j) => (start + j) % SAMPLES);
};

type ClearanceTest = (x: number, z: number, minDistM: number) => boolean;

/**
 * Sepang loops back on itself, so an offset from one section can land on
 * another section (or the pit lane). This tests a world point against every
 * centerline sample of both the race track and the pit complex.
 */
const buildClearanceTest = (samples: TrackSample[]): ClearanceTest => {
  const pts: number[] = [];
  for (const s of samples) pts.push(s.point.x, s.point.z);
  const pit = getPitCurve();
  const PIT_PTS = 140;
  for (let i = 0; i <= PIT_PTS; i += 1) {
    const p = pit.getPointAt(i / PIT_PTS);
    pts.push(p.x, p.z);
  }
  return (x, z, minDistM) => {
    const r = metresToUnits(minDistM);
    const r2 = r * r;
    for (let i = 0; i < pts.length; i += 2) {
      const dx = pts[i] - x;
      const dz = pts[i + 1] - z;
      if (dx * dx + dz * dz < r2) return false;
    }
    return true;
  };
};

/** Min distance (m) between a ribbon vertex and any track/pit centerline. */
const RIBBON_CLEAR_M = 12;
/** Min distance (m) for point objects (boards, tires, marshals, posts). */
const OBJECT_CLEAR_M = 13;
/** Palm canopies are wide — keep them further out. */
const TREE_CLEAR_M = 17;

/**
 * Vertical ribbon (wall / fence) along a run at a fixed lateral offset.
 * Samples that fail the clearance test are skipped, leaving gaps instead of
 * walls crossing another part of the circuit.
 */
const buildVerticalRibbon = (
  samples: TrackSample[],
  indices: number[],
  sign: number,
  lateralM: number,
  baseLift: number,
  heightM: number,
  uPerSample: number,
  clear?: ClearanceTest,
): THREE.BufferGeometry => {
  const positions: number[] = [];
  const uvs: number[] = [];
  const tris: number[] = [];
  const h = metresToUnits(heightM);
  const p = new THREE.Vector3();
  let prevPair = -1;

  for (let j = 0; j < indices.length; j += 1) {
    const s = samples[indices[j]];
    lateralPos(s, lateralM, sign, p);
    if (clear && !clear(p.x, p.z, RIBBON_CLEAR_M)) {
      prevPair = -1;
      continue;
    }
    const yBase = p.y + baseLift;
    const pair = positions.length / 3;
    positions.push(p.x, yBase, p.z, p.x, yBase + h, p.z);
    uvs.push(j * uPerSample, 0, j * uPerSample, 1);
    if (prevPair >= 0) {
      tris.push(prevPair, prevPair + 1, pair, prevPair + 1, pair + 1, pair);
    }
    prevPair = pair;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(tris);
  geo.computeVertexNormals();
  return geo;
};

/** Flat ground ribbon between two lateral offsets along a run, with gaps. */
const buildFlatRibbon = (
  samples: TrackSample[],
  indices: number[],
  sign: number,
  innerM: number,
  outerM: number,
  yLift: number,
  uPerSample: number,
  clear?: ClearanceTest,
): THREE.BufferGeometry => {
  const positions: number[] = [];
  const uvs: number[] = [];
  const tris: number[] = [];
  const pi = new THREE.Vector3();
  const po = new THREE.Vector3();
  let prevPair = -1;

  for (let j = 0; j < indices.length; j += 1) {
    const s = samples[indices[j]];
    lateralPos(s, innerM, sign, pi);
    lateralPos(s, outerM, sign, po);
    if (clear && (!clear(po.x, po.z, RIBBON_CLEAR_M) || !clear(pi.x, pi.z, RIBBON_CLEAR_M))) {
      prevPair = -1;
      continue;
    }
    const pair = positions.length / 3;
    positions.push(pi.x, pi.y + yLift, pi.z, po.x, po.y + yLift, po.z);
    uvs.push(j * uPerSample, 0, j * uPerSample, 1);
    if (prevPair >= 0) {
      tris.push(prevPair, prevPair + 1, pair, prevPair + 1, pair + 1, pair);
    }
    prevPair = pair;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(tris);
  geo.computeVertexNormals();
  return geo;
};

const makeBarrierTexture = (): THREE.CanvasTexture => {
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 32;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#e2e8f0";
  ctx.fillRect(0, 0, 8, 32);
  ctx.fillStyle = "#0d9488";
  ctx.fillRect(0, 0, 8, 9);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};

const makeFenceTexture = (): THREE.CanvasTexture => {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = "rgba(148, 163, 184, 0.9)";
  ctx.lineWidth = 1.6;
  for (let d = -size; d <= size * 2; d += 8) {
    ctx.beginPath();
    ctx.moveTo(d, 0);
    ctx.lineTo(d + size, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(d + size, 0);
    ctx.lineTo(d, size);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
};

const makeRunoffPaintTexture = (): THREE.CanvasTexture => {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 8;
  const ctx = canvas.getContext("2d")!;
  for (let x = 0; x < 64; x += 1) {
    ctx.fillStyle = Math.floor(x / 8) % 2 === 0 ? "#1d4ed8" : "#f1f5f9";
    ctx.fillRect(x, 0, 1, 8);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};

const makeBoardTexture = (text: string, bg: string, fg: string): THREE.CanvasTexture => {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 112;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 112);
  ctx.fillStyle = fg;
  ctx.fillRect(0, 0, 512, 6);
  ctx.fillRect(0, 106, 512, 6);
  ctx.font = "bold 62px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 256, 60);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};

/** Merged low-poly palm: trunk handled separately, this is the frond crown. */
const makeFrondGeometry = (): THREE.BufferGeometry => {
  const fronds: THREE.BufferGeometry[] = [];
  const frondLen = metresToUnits(4.2);
  const frondR = metresToUnits(0.55);
  for (let i = 0; i < 7; i += 1) {
    const cone = new THREE.ConeGeometry(frondR, frondLen, 4, 1);
    cone.translate(0, frondLen / 2, 0);
    cone.rotateX(Math.PI / 2 - 0.42 - (i % 2) * 0.28);
    cone.rotateY((i / 7) * Math.PI * 2);
    fronds.push(cone);
  }
  const merged = mergeGeometries(fronds);
  for (const f of fronds) f.dispose();
  return merged;
};

const setInstances = (
  mesh: THREE.InstancedMesh,
  matrices: THREE.Matrix4[],
): void => {
  for (let i = 0; i < matrices.length; i += 1) {
    mesh.setMatrixAt(i, matrices[i]);
  }
  mesh.instanceMatrix.needsUpdate = true;
};

const composeMatrix = (
  pos: THREE.Vector3,
  yaw: number,
  scale: number,
): THREE.Matrix4 =>
  new THREE.Matrix4().compose(
    pos.clone(),
    new THREE.Quaternion().setFromAxisAngle(UP, yaw),
    new THREE.Vector3(scale, scale, scale),
  );

/** Yaw so local +z faces the track centerline from an offset position. */
const faceTrackYaw = (sample: TrackSample, sign: number): number => {
  const dirX = -sample.side.x * sign;
  const dirZ = -sample.side.z * sign;
  return Math.atan2(dirX, dirZ);
};

export const buildTrackside = (): TracksideHandle => {
  const samples = buildSamples();
  const corners = findCornerRuns(samples);
  const clear = buildClearanceTest(samples);
  const rng = mulberry32(1337);
  const group = new THREE.Group();
  group.name = "trackside";

  const disposables: Array<{ dispose: () => void }> = [];
  const track = <T extends { dispose: () => void }>(d: T): T => {
    disposables.push(d);
    return d;
  };

  const scratch = new THREE.Vector3();

  // ── Barrier walls ────────────────────────────────────────────────────
  const barrierTex = track(makeBarrierTexture());
  const barrierMat = track(
    new THREE.MeshStandardMaterial({
      map: barrierTex,
      roughness: 0.7,
      metalness: 0.1,
      side: THREE.DoubleSide,
    }),
  );

  const pitGapStart = Math.ceil(PIT_ZONE_START_T * SAMPLES);
  const pitGapEnd = Math.floor(PIT_ZONE_END_T * SAMPLES);
  const barrierRuns: Array<{ indices: number[]; sign: number }> = [
    { indices: runIndices(0, SAMPLES - 1), sign: -PIT_SIDE },
    { indices: runIndices(pitGapEnd, pitGapStart), sign: PIT_SIDE },
  ];
  for (const { indices, sign } of barrierRuns) {
    const geo = track(
      buildVerticalRibbon(samples, indices, sign, BARRIER_M, -0.06, BARRIER_H_M, 2.2, clear),
    );
    const mesh = new THREE.Mesh(geo, barrierMat);
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // ── Catch fence along the main straight (grandstand zone) ───────────
  const fenceTex = track(makeFenceTexture());
  fenceTex.repeat.set(1, 1);
  const fenceMat = track(
    new THREE.MeshBasicMaterial({
      map: fenceTex,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  // Fence only on the grandstand side — the pit complex owns the other side,
  // and a fence there would cut across the pit lane.
  const fenceSign = -PIT_SIDE;
  const fenceStart = Math.floor(0.94 * SAMPLES);
  const fenceEnd = Math.floor(0.065 * SAMPLES);
  const fenceIndices = runIndices(fenceStart, fenceEnd);
  {
    const geo = track(
      buildVerticalRibbon(samples, fenceIndices, fenceSign, FENCE_M, 0, FENCE_H_M, 4, clear),
    );
    const mesh = new THREE.Mesh(geo, fenceMat);
    group.add(mesh);
  }

  const postGeo = track(
    new THREE.BoxGeometry(metresToUnits(0.18), metresToUnits(FENCE_H_M), metresToUnits(0.18)),
  );
  const postMat = track(
    new THREE.MeshStandardMaterial({ color: "#475569", roughness: 0.6, metalness: 0.5 }),
  );
  const postMatrices: THREE.Matrix4[] = [];
  for (let j = 0; j < fenceIndices.length; j += 2) {
    const s = samples[fenceIndices[j]];
    lateralPos(s, FENCE_M, fenceSign, scratch);
    if (!clear(scratch.x, scratch.z, RIBBON_CLEAR_M)) continue;
    scratch.y += metresToUnits(FENCE_H_M) / 2;
    postMatrices.push(composeMatrix(scratch, 0, 1));
  }
  const posts = new THREE.InstancedMesh(postGeo, postMat, postMatrices.length);
  setInstances(posts, postMatrices);
  posts.castShadow = true;
  group.add(posts);

  // ── Painted runoff at corners ────────────────────────────────────────
  const paintTex = track(makeRunoffPaintTexture());
  const paintMat = track(
    new THREE.MeshStandardMaterial({
      map: paintTex,
      roughness: 0.9,
      metalness: 0,
      side: THREE.DoubleSide,
    }),
  );
  for (const corner of corners) {
    const indices = runIndices(corner.start, corner.end);
    const geo = track(
      buildFlatRibbon(samples, indices, corner.outSign, PAINT_INNER_M, PAINT_OUTER_M, 0.028, 0.5),
    );
    const mesh = new THREE.Mesh(geo, paintMat);
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // ── Tire stacks on corner outsides ───────────────────────────────────
  const tireGeo = track(
    new THREE.CylinderGeometry(metresToUnits(0.8), metresToUnits(0.8), metresToUnits(1.35), 10),
  );
  const tireMat = track(
    new THREE.MeshStandardMaterial({ color: "#1e293b", roughness: 0.95, metalness: 0 }),
  );
  const bandGeo = track(
    new THREE.CylinderGeometry(metresToUnits(0.82), metresToUnits(0.82), metresToUnits(0.3), 10),
  );
  const bandMat = track(
    new THREE.MeshStandardMaterial({ color: "#f8fafc", roughness: 0.85, metalness: 0 }),
  );
  const tireMatrices: THREE.Matrix4[] = [];
  const bandMatrices: THREE.Matrix4[] = [];
  for (const corner of corners) {
    for (let j = -8; j <= 8; j += 2) {
      const idx = (corner.apex + j + SAMPLES) % SAMPLES;
      const s = samples[idx];
      if (inPitZone(s.t) && corner.outSign === PIT_SIDE) continue;
      const lateral = TIRE_M + rng() * 1.6;
      lateralPos(s, lateral, corner.outSign, scratch);
      if (!clear(scratch.x, scratch.z, OBJECT_CLEAR_M)) continue;
      scratch.y += metresToUnits(1.35) / 2;
      tireMatrices.push(composeMatrix(scratch, rng() * Math.PI, 1));
      scratch.y += metresToUnits(0.35);
      bandMatrices.push(composeMatrix(scratch, 0, 1));
    }
  }
  const tires = new THREE.InstancedMesh(tireGeo, tireMat, tireMatrices.length);
  setInstances(tires, tireMatrices);
  tires.castShadow = true;
  group.add(tires);
  const bands = new THREE.InstancedMesh(bandGeo, bandMat, bandMatrices.length);
  setInstances(bands, bandMatrices);
  group.add(bands);

  // ── Sponsor hoardings along straights ────────────────────────────────
  const boardDesigns: Array<[string, string, string]> = [
    ["SEPANG", "#0d9488", "#f8fafc"],
    ["MALAYSIA GP", "#1d4ed8", "#facc15"],
    ["PIT WALL", "#0f172a", "#facc15"],
    ["SEPANG INT'L CIRCUIT", "#dc2626", "#f8fafc"],
  ];
  const boardGeo = track(
    new THREE.BoxGeometry(metresToUnits(6.5), metresToUnits(1.35), metresToUnits(0.12)),
  );
  const boardMatrixSets: THREE.Matrix4[][] = boardDesigns.map(() => []);
  let boardCursor = 0;
  for (let i = 0; i < SAMPLES; i += 5) {
    const s = samples[i];
    if (s.kn > 0.05) continue;
    const sign = boardCursor % 2 === 0 ? 1 : -1;
    boardCursor += 1;
    if (sign === PIT_SIDE && inPitZone(s.t)) continue;
    lateralPos(s, BOARD_M, sign, scratch);
    if (!clear(scratch.x, scratch.z, OBJECT_CLEAR_M)) continue;
    scratch.y += metresToUnits(1.35) / 2 + 0.02;
    boardMatrixSets[boardCursor % boardDesigns.length].push(
      composeMatrix(scratch, faceTrackYaw(s, sign), 1),
    );
  }
  boardDesigns.forEach(([text, bg, fg], i) => {
    if (boardMatrixSets[i].length === 0) return;
    const tex = track(makeBoardTexture(text, bg, fg));
    const mat = track(
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0.05 }),
    );
    const mesh = new THREE.InstancedMesh(boardGeo, mat, boardMatrixSets[i].length);
    setInstances(mesh, boardMatrixSets[i]);
    mesh.castShadow = true;
    group.add(mesh);
  });

  // ── Marshal posts at corner entries ──────────────────────────────────
  const hutGeo = track(
    new THREE.BoxGeometry(metresToUnits(3), metresToUnits(2.6), metresToUnits(3)),
  );
  const hutMat = track(
    new THREE.MeshStandardMaterial({ color: "#f1f5f9", roughness: 0.8, metalness: 0 }),
  );
  const roofGeo = track(new THREE.ConeGeometry(metresToUnits(2.4), metresToUnits(1.1), 4));
  const roofMat = track(
    new THREE.MeshStandardMaterial({ color: "#ea580c", roughness: 0.7, metalness: 0 }),
  );
  const poleGeo = track(
    new THREE.CylinderGeometry(metresToUnits(0.06), metresToUnits(0.06), metresToUnits(4.6), 6),
  );
  const flagGeo = track(new THREE.PlaneGeometry(metresToUnits(1.2), metresToUnits(0.8)));
  const flagMat = track(
    new THREE.MeshStandardMaterial({
      color: "#facc15",
      roughness: 0.7,
      metalness: 0,
      side: THREE.DoubleSide,
    }),
  );

  const hutMatrices: THREE.Matrix4[] = [];
  const roofMatrices: THREE.Matrix4[] = [];
  const poleMatrices: THREE.Matrix4[] = [];
  const flagMatrices: THREE.Matrix4[] = [];
  for (const corner of corners) {
    const idx = (corner.apex - 14 + SAMPLES) % SAMPLES;
    const s = samples[idx];
    if (inPitZone(s.t) && corner.outSign === PIT_SIDE) continue;
    const yaw = faceTrackYaw(s, corner.outSign);
    lateralPos(s, MARSHAL_M, corner.outSign, scratch);
    if (!clear(scratch.x, scratch.z, OBJECT_CLEAR_M + 2)) continue;
    const base = scratch.clone();
    scratch.y = base.y + metresToUnits(1.3);
    hutMatrices.push(composeMatrix(scratch, yaw, 1));
    scratch.y = base.y + metresToUnits(2.6 + 0.55);
    roofMatrices.push(composeMatrix(scratch, yaw + Math.PI / 4, 1));
    const poleBase = base
      .clone()
      .addScaledVector(s.side, corner.outSign * metresToUnits(2.2));
    poleBase.y += metresToUnits(2.3);
    poleMatrices.push(composeMatrix(poleBase, 0, 1));
    const flagPos = poleBase.clone();
    flagPos.y += metresToUnits(1.9);
    flagPos.addScaledVector(s.tangent, metresToUnits(0.6));
    flagMatrices.push(composeMatrix(flagPos, yaw + Math.PI / 2, 1));
  }
  const huts = new THREE.InstancedMesh(hutGeo, hutMat, hutMatrices.length);
  setInstances(huts, hutMatrices);
  huts.castShadow = true;
  group.add(huts);
  const roofs = new THREE.InstancedMesh(roofGeo, roofMat, roofMatrices.length);
  setInstances(roofs, roofMatrices);
  roofs.castShadow = true;
  group.add(roofs);
  const poles = new THREE.InstancedMesh(poleGeo, postMat, poleMatrices.length);
  setInstances(poles, poleMatrices);
  group.add(poles);
  const flags = new THREE.InstancedMesh(flagGeo, flagMat, flagMatrices.length);
  setInstances(flags, flagMatrices);
  group.add(flags);

  // ── Palm trees ───────────────────────────────────────────────────────
  const trunkGeo = track(
    new THREE.CylinderGeometry(metresToUnits(0.22), metresToUnits(0.38), metresToUnits(9.5), 6),
  );
  const trunkMat = track(
    new THREE.MeshStandardMaterial({ color: "#92764e", roughness: 0.95, metalness: 0 }),
  );
  const frondGeo = track(makeFrondGeometry());
  const frondMat = track(
    new THREE.MeshStandardMaterial({
      color: "#3f7d3a",
      roughness: 0.9,
      metalness: 0,
      side: THREE.DoubleSide,
    }),
  );
  const trunkMatrices: THREE.Matrix4[] = [];
  const frondMatrices: THREE.Matrix4[] = [];
  const TREE_ATTEMPTS = 320;
  for (let n = 0; n < TREE_ATTEMPTS; n += 1) {
    const i = Math.floor(rng() * SAMPLES);
    const s = samples[i];
    // Keep the S/F straight clear — pit complex and grandstands live there.
    if (s.t >= 0.93 || s.t <= 0.1) continue;
    const sign = rng() < 0.5 ? 1 : -1;
    const lateral = 26 + rng() * 38;
    const scale = 0.75 + rng() * 0.6;
    lateralPos(s, lateral, sign, scratch);
    // Jitter along the tangent so rows don't look sampled.
    scratch.addScaledVector(s.tangent, (rng() - 0.5) * metresToUnits(14));
    if (!clear(scratch.x, scratch.z, TREE_CLEAR_M)) continue;
    scratch.y = groundY(scratch.x, scratch.z);
    const base = scratch.clone();
    scratch.y = base.y + metresToUnits(9.5 * scale) / 2;
    trunkMatrices.push(composeMatrix(scratch, rng() * Math.PI * 2, scale));
    scratch.y = base.y + metresToUnits(9.5) * scale;
    frondMatrices.push(composeMatrix(scratch, rng() * Math.PI * 2, scale));
  }
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, trunkMatrices.length);
  setInstances(trunks, trunkMatrices);
  trunks.castShadow = true;
  group.add(trunks);
  const fronds = new THREE.InstancedMesh(frondGeo, frondMat, frondMatrices.length);
  setInstances(fronds, frondMatrices);
  fronds.castShadow = true;
  group.add(fronds);

  prepareStaticMesh(group);

  return {
    group,
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
};
