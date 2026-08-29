import * as THREE from "three";
import {
  createCurbRibbon,
  createRoadRibbon,
  createRunoffRibbon,
  getKerbStripeTexture,
} from "@/lib/roadGeometry";
import {
  FIA,
  getGridSlot,
  getPitBoxLaneCurve,
  getPitBoxPose,
  getPitCurve,
  getStartFinishPose,
  getTrackCurve,
  metresToUnits,
} from "@/lib/trackCurve";
import { sampleTerrainHeight } from "@/lib/terrainHeight";
import { prepareStaticMesh } from "@/lib/staticMesh";
import { createAsphaltTextures } from "@/scene/textures/asphaltTextures";
import { FIELD_META } from "@/stores/raceStore";

const MAIN_WIDTH = metresToUnits(FIA.trackWidthStartM);
const PIT_FAST_WIDTH = metresToUnits(FIA.pitWidthM);
const PIT_BOX_LANE_WIDTH = metresToUnits(4.5);
const BOX_W = metresToUnits(FIA.gridBoxWidthM);
const BOX_L = metresToUnits(FIA.gridBoxLengthM);
const LINE_W = metresToUnits(FIA.startLineWidthM);
const LINE_H = 0.04;
const CURB_W = metresToUnits(0.55);
const RUNOFF_W = metresToUnits(4.5);

export type TrackBuildResult = {
  group: THREE.Group;
  mainGeo: THREE.BufferGeometry;
  asphaltMaterials: THREE.MeshStandardMaterial[];
  setRainIntensity: (intensity: number) => void;
  dispose: () => void;
};

const createPaintStripe = (
  position: THREE.Vector3,
  rotationY: number,
  width: number,
  length: number,
  color = "#f8fafc",
  y = 0.05,
): THREE.Mesh => {
  const material = new THREE.MeshStandardMaterial({
    color,
    emissive: color === "#f8fafc" ? "#e2e8f0" : "#000000",
    emissiveIntensity: color === "#f8fafc" ? 0.22 : 0,
    roughness: 0.55,
    metalness: 0.05,
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, LINE_H, length), material);
  mesh.position.set(position.x, position.y + y, position.z);
  mesh.rotation.y = rotationY;
  mesh.receiveShadow = true;
  return mesh;
};

const applyRainToAsphalt = (
  materials: THREE.MeshStandardMaterial[],
  intensity: number,
): void => {
  const wet = intensity > 0.35;
  const roughness = wet ? 0.35 : 0.82;
  const metalness = wet ? 0.4 : 0.08;
  for (const mat of materials) {
    mat.roughness = roughness;
    mat.metalness = metalness;
  }
};

export const buildTrack = (
  rainIntensity: number,
  playerPitBox: number,
  playerColor = "#f43f5e",
): TrackBuildResult => {
  const trackCurve = getTrackCurve();
  const pitCurve = getPitCurve();
  const heightSampler = (wx: number, wz: number) => sampleTerrainHeight(wx, wz);
  const ribbonOpts = { heightSampler };

  const mainGeo = createRoadRibbon(trackCurve, {
    width: MAIN_WIDTH,
    segments: 640,
    closed: true,
    yOffset: 0.02,
    ...ribbonOpts,
  });
  const pitGeo = createRoadRibbon(pitCurve, {
    width: PIT_FAST_WIDTH,
    segments: 160,
    closed: false,
    yOffset: 0.015,
    ...ribbonOpts,
  });
  const pitBoxLaneGeo = createRoadRibbon(getPitBoxLaneCurve(), {
    width: PIT_BOX_LANE_WIDTH,
    segments: 160,
    closed: false,
    yOffset: 0.012,
    ...ribbonOpts,
  });
  const curbL = createCurbRibbon(trackCurve, {
    roadWidth: MAIN_WIDTH,
    curbWidth: CURB_W,
    side: -1,
    segments: 640,
    closed: true,
    ...ribbonOpts,
  });
  const curbR = createCurbRibbon(trackCurve, {
    roadWidth: MAIN_WIDTH,
    curbWidth: CURB_W,
    side: 1,
    segments: 640,
    closed: true,
    ...ribbonOpts,
  });
  const runoffL = createRunoffRibbon(trackCurve, {
    roadWidth: MAIN_WIDTH,
    curbWidth: CURB_W,
    runoffWidth: RUNOFF_W,
    side: -1,
    segments: 640,
    closed: true,
    ...ribbonOpts,
  });
  const runoffR = createRunoffRibbon(trackCurve, {
    roadWidth: MAIN_WIDTH,
    curbWidth: CURB_W,
    runoffWidth: RUNOFF_W,
    side: 1,
    segments: 640,
    closed: true,
    ...ribbonOpts,
  });

  const sf = getStartFinishPose();
  const gridPads = Array.from({ length: FIELD_META.length }, (_, i) => getGridSlot(i));
  const pitStalls = Array.from({ length: FIELD_META.length }, (_, i) => getPitBoxPose(i));

  const wet = rainIntensity > 0.35;
  const asphaltRoughness = wet ? 0.35 : 0.82;
  const asphaltMetalness = wet ? 0.4 : 0.08;

  const { map: asphaltMap, normalMap: asphaltNormal } = createAsphaltTextures();
  asphaltMap.repeat.set(4, 4);
  asphaltNormal.repeat.set(4, 4);

  const asphaltMaterials: THREE.MeshStandardMaterial[] = [];
  const disposableTextures: THREE.Texture[] = [asphaltMap, asphaltNormal, getKerbStripeTexture()];

  const makeAsphalt = (color: string) => {
    const mat = new THREE.MeshStandardMaterial({
      color,
      map: asphaltMap,
      normalMap: asphaltNormal,
      normalScale: new THREE.Vector2(0.35, 0.35),
      roughness: asphaltRoughness,
      metalness: asphaltMetalness,
      side: THREE.DoubleSide,
    });
    asphaltMaterials.push(mat);
    return mat;
  };

  const kerbMat = new THREE.MeshStandardMaterial({
    map: getKerbStripeTexture(),
    roughness: 0.55,
    metalness: 0.08,
    side: THREE.DoubleSide,
  });

  const runoffMat = new THREE.MeshStandardMaterial({
    color: "#166534",
    roughness: 0.95,
    metalness: 0,
    side: THREE.DoubleSide,
  });

  const group = new THREE.Group();
  const stripeMeshes: THREE.Mesh[] = [];
  const extraMeshes: THREE.Mesh[] = [];

  const mainMesh = new THREE.Mesh(mainGeo, makeAsphalt("#475569"));
  mainMesh.receiveShadow = true;
  mainMesh.castShadow = true;
  group.add(mainMesh);

  const runoffLMesh = new THREE.Mesh(runoffL, runoffMat);
  runoffLMesh.receiveShadow = true;
  group.add(runoffLMesh);
  extraMeshes.push(runoffLMesh);

  const curbLMesh = new THREE.Mesh(curbL, kerbMat);
  curbLMesh.receiveShadow = true;
  group.add(curbLMesh);
  extraMeshes.push(curbLMesh);

  const curbRMesh = new THREE.Mesh(curbR, kerbMat.clone());
  curbRMesh.receiveShadow = true;
  group.add(curbRMesh);
  extraMeshes.push(curbRMesh);

  const runoffRMesh = new THREE.Mesh(runoffR, runoffMat.clone());
  runoffRMesh.receiveShadow = true;
  group.add(runoffRMesh);
  extraMeshes.push(runoffRMesh);

  const pitMesh = new THREE.Mesh(pitGeo, makeAsphalt("#334155"));
  pitMesh.receiveShadow = true;
  group.add(pitMesh);

  const pitBoxLaneMesh = new THREE.Mesh(pitBoxLaneGeo, makeAsphalt("#1e293b"));
  pitBoxLaneMesh.receiveShadow = true;
  group.add(pitBoxLaneMesh);

  const stripeYaw = Math.atan2(sf.tangent.x, sf.tangent.z);
  const edge = metresToUnits(0.12);

  stripeMeshes.push(
    createPaintStripe(sf.position, stripeYaw, MAIN_WIDTH * 0.98, LINE_W, "#f8fafc", 0.055),
  );

  for (const pad of gridPads) {
    const front = pad.position.clone().addScaledVector(pad.tangent, BOX_L * 0.5);
    const rear = pad.position.clone().addScaledVector(pad.tangent, -BOX_L * 0.5);
    const left = pad.position.clone().addScaledVector(pad.side, -BOX_W * 0.5);
    const right = pad.position.clone().addScaledVector(pad.side, BOX_W * 0.5);

    stripeMeshes.push(
      createPaintStripe(left, pad.rotationY, edge, BOX_L),
      createPaintStripe(right, pad.rotationY, edge, BOX_L),
      createPaintStripe(rear, pad.rotationY, BOX_W, edge),
      createPaintStripe(front, pad.rotationY, BOX_W, edge * 1.4, "#facc15", 0.052),
      createPaintStripe(pad.position, pad.rotationY, edge * 0.55, BOX_L * 0.85, "#cbd5e1", 0.048),
    );
  }

  for (let i = 0; i < pitStalls.length; i++) {
    const stall = pitStalls[i];
    const isPlayer = i === playerPitBox;
    stripeMeshes.push(
      createPaintStripe(
        stall.position,
        stall.rotationY,
        metresToUnits(2.4),
        metresToUnits(5.5),
        isPlayer ? playerColor : "#94a3b8",
        0.04,
      ),
      createPaintStripe(
        stall.position.clone().addScaledVector(stall.tangent, metresToUnits(2.8)),
        stall.rotationY,
        metresToUnits(2.4),
        edge * 1.2,
        isPlayer ? playerColor : "#facc15",
        0.045,
      ),
    );
  }

  for (const stripe of stripeMeshes) group.add(stripe);

  prepareStaticMesh(group);

  return {
    group,
    mainGeo,
    asphaltMaterials,
    setRainIntensity: (intensity: number) => applyRainToAsphalt(asphaltMaterials, intensity),
    dispose: () => {
      mainGeo.dispose();
      pitGeo.dispose();
      pitBoxLaneGeo.dispose();
      curbL.dispose();
      curbR.dispose();
      runoffL.dispose();
      runoffR.dispose();
      for (const mat of asphaltMaterials) mat.dispose();
      for (const mesh of extraMeshes) {
        (mesh.material as THREE.Material).dispose();
      }
      for (const tex of disposableTextures) tex.dispose();
      for (const stripe of stripeMeshes) {
        stripe.geometry.dispose();
        (stripe.material as THREE.Material).dispose();
      }
    },
  };
};
