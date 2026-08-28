import * as THREE from "three";
import {
  FIA,
  getPitCurve,
  getPoseAt,
  metresToUnits,
  PIT_EXIT_T,
  PIT_LANE_OFFSET,
  PIT_SEG_ENTRY_END,
  PIT_SEG_GARAGE_END,
  TRACK_LENGTH_M,
} from "./trackCurve";
import { sampleTerrainHeight } from "./terrainHeight";

export type CampusBuildingId =
  | "pit"
  | "mainGrandstandNorth"
  | "mainGrandstandSouth"
  | "tower"
  | "twinTowers"
  | "k1"
  | "grandstandF"
  | "welcome"
  | "paddockChalets"
  | "southPaddock"
  | "hillstandK2"
  | "hillstandC2"
  | "medicalCenter"
  | "controlPostWelcome"
  | "motorsportPark";

export type CampusKit =
  | "pit"
  | "mainStand"
  | "tower"
  | "twin"
  | "covered"
  | "openHill"
  | "hillCanopy"
  | "welcome"
  | "chalets"
  | "southPaddock"
  | "workshops"
  | "medical"
  | "controlPost";

export type CampusBuildingDef = {
  id: CampusBuildingId;
  kit: CampusKit;
  /** Track progress 0–1 (S/F = 0). */
  t: number;
  /** +1 outside / V-island, −1 infield. */
  bank: 1 | -1;
  /** Grass/runoff between kerb (or pit edge) and track-facing face, metres. */
  lateralClearanceM: number;
  /** x = depth (lateral), y = height, z = along-track, metres. */
  sizeM: { x: number; y: number; z: number };
  alongM: number;
  includePit?: boolean;
  /** Arc length along track to follow, metres. */
  tSpanM?: number;
  segmentCount?: number;
  yawOverride?: number;
  /** Skip track offset — place at fixed world XZ (Three.js units). */
  fixedWorld?: { x: number; z: number };
  shadow: "cast" | "receive";
  lod: "hero" | "mid" | "far";
};

/**
  * Official / spectator-map footprints in real metres, placed on the FIA-scaled curve.
  * Pit: 33 × 8 m boxes × 24 m deep. Main grandstand ~1.2 km V (split N/S).
  */
export const CAMPUS_BUILDINGS: readonly CampusBuildingDef[] = [
  {
    id: "pit",
    kit: "pit",
    t: 0.018,
    bank: -1,
    lateralClearanceM: 8,
    sizeM: { x: 20, y: 14, z: 264 },
    alongM: 0,
    includePit: false,
    tSpanM: 264,
    segmentCount: 11,
    shadow: "cast",
    lod: "hero",
  },
  {
    id: "mainGrandstandNorth",
    kit: "mainStand",
    t: 0.012,
    bank: 1,
    lateralClearanceM: 36,
    sizeM: { x: 22, y: 16, z: 480 },
    alongM: 0,
    tSpanM: 480,
    segmentCount: 10,
    shadow: "cast",
    lod: "hero",
  },
  {
    id: "mainGrandstandSouth",
    kit: "mainStand",
    t: 0.94,
    bank: 1,
    lateralClearanceM: 44,
    sizeM: { x: 20, y: 16, z: 360 },
    alongM: 0,
    tSpanM: 360,
    segmentCount: 8,
    shadow: "cast",
    lod: "hero",
  },
  {
    id: "tower",
    kit: "tower",
    t: 0.986,
    bank: 1,
    lateralClearanceM: 34,
    sizeM: { x: 36, y: 28, z: 42 },
    alongM: 0,
    shadow: "cast",
    lod: "hero",
  },
  {
    id: "twinTowers",
    kit: "twin",
    t: PIT_EXIT_T - 0.012,
    bank: 1,
    lateralClearanceM: 38,
    sizeM: { x: 18, y: 36, z: 30 },
    alongM: 0,
    shadow: "cast",
    lod: "hero",
  },
  {
    id: "k1",
    kit: "covered",
    /** OSM world anchor — end of main straight / T1. */
    t: 0.107,
    bank: -1,
    lateralClearanceM: 0,
    sizeM: { x: 14, y: 12, z: 55 },
    alongM: 0,
    fixedWorld: { x: 19.246, z: 134.17 },
    yawOverride: -1.55,
    shadow: "cast",
    lod: "mid",
  },
  {
    id: "grandstandF",
    kit: "covered",
    /** OSM-aligned: Turns 7 & 8. */
    t: 0.436,
    bank: 1,
    lateralClearanceM: 36,
    sizeM: { x: 18, y: 12, z: 140 },
    alongM: 0,
    tSpanM: 140,
    segmentCount: 5,
    shadow: "cast",
    lod: "mid",
  },
  {
    id: "welcome",
    kit: "welcome",
    t: 0.089,
    bank: 1,
    lateralClearanceM: 0,
    sizeM: { x: 24, y: 12, z: 18 },
    alongM: 0,
    fixedWorld: { x: -16.615, z: 146.622 },
    yawOverride: -0.2,
    shadow: "receive",
    lod: "mid",
  },
  {
    id: "medicalCenter",
    kit: "medical",
    t: 0.946,
    bank: -1,
    lateralClearanceM: 32,
    sizeM: { x: 18, y: 8, z: 14 },
    alongM: 0,
    shadow: "receive",
    lod: "mid",
  },
  {
    id: "controlPostWelcome",
    kit: "controlPost",
    t: 0.089,
    bank: 1,
    lateralClearanceM: 0,
    sizeM: { x: 12, y: 6, z: 10 },
    alongM: 0,
    fixedWorld: { x: -23.28, z: 169.15 },
    yawOverride: 0.35,
    shadow: "receive",
    lod: "mid",
  },
  {
    id: "paddockChalets",
    kit: "chalets",
    t: 0.02,
    bank: -1,
    /** Metres past pit centerline (behind garage block). */
    /** Runoff past pit asphalt edge; sits behind garage (~pit depth + gap). */
    lateralClearanceM: 32,
    sizeM: { x: 18, y: 8, z: 44 },
    alongM: 0,
    shadow: "receive",
    lod: "mid",
  },
  {
    id: "southPaddock",
    kit: "southPaddock",
    t: 0.825,
    bank: -1,
    lateralClearanceM: 28,
    sizeM: { x: 28, y: 10, z: 96 },
    alongM: 0,
    tSpanM: 96,
    segmentCount: 3,
    shadow: "receive",
    lod: "far",
  },
  {
    id: "hillstandK2",
    kit: "openHill",
    t: 0.31,
    bank: 1,
    lateralClearanceM: 36,
    sizeM: { x: 40, y: 8, z: 180 },
    alongM: 0,
    tSpanM: 180,
    segmentCount: 5,
    shadow: "receive",
    lod: "far",
  },
  {
    id: "hillstandC2",
    kit: "hillCanopy",
    /** Inferred from OSM support cluster — Turns 9–11 GA embankment. */
    t: 0.489,
    bank: -1,
    lateralClearanceM: 85,
    sizeM: { x: 45, y: 8, z: 90 },
    alongM: 0,
    tSpanM: 90,
    segmentCount: 1,
    shadow: "receive",
    lod: "far",
  },
  {
    id: "motorsportPark",
    kit: "workshops",
    t: 0.44,
    bank: -1,
    lateralClearanceM: 95,
    sizeM: { x: 80, y: 8, z: 180 },
    alongM: 0,
    shadow: "receive",
    lod: "far",
  },
] as const;

export const LOD_DISTANCES = {
  hero: [0, 90, 200] as [number, number, number],
  mid: [0, 70, 160] as [number, number, number],
  far: [0, 50, 120] as [number, number, number],
};

export const wrap01 = (t: number): number => ((t % 1) + 1) % 1;

export const yawFromTangent = (tangent: THREE.Vector3): number =>
  Math.atan2(tangent.x, tangent.z);

export const MAIN_HALF = metresToUnits(FIA.trackWidthStartM) / 2;
export const PIT_HALF = metresToUnits(FIA.pitWidthM) / 2;

export const offsetBesideTrack = (
  pose: { position: THREE.Vector3; side: THREE.Vector3; tangent: THREE.Vector3 },
  opts: {
    bank: 1 | -1;
    halfWidth: number;
    lift: number;
    along?: number;
    includePit?: boolean;
    runoffM: number;
  },
): THREE.Vector3 => {
  const pitOuter = opts.includePit ? PIT_LANE_OFFSET + PIT_HALF : MAIN_HALF;
  const edge = Math.max(MAIN_HALF, pitOuter);
  const lateral = edge + metresToUnits(opts.runoffM) + opts.halfWidth;
  const pos = pose.position
    .clone()
    .addScaledVector(pose.side, opts.bank * lateral)
    .addScaledVector(pose.tangent, opts.along ?? 0);
  pos.y = pose.position.y + opts.lift;
  return pos;
};

export type CampusPlacement = {
  id: CampusBuildingId;
  def: CampusBuildingDef;
  position: THREE.Vector3;
  yaw: number;
  size: { x: number; y: number; z: number };
  segmentIndex: number;
  segmentCount: number;
};

export const resolveCampusPlacements = (): CampusPlacement[] => {
  const out: CampusPlacement[] = [];
  const pitCurve = getPitCurve();
  const up = new THREE.Vector3(0, 1, 0);

  for (const def of CAMPUS_BUILDINGS) {
    const count = def.segmentCount ?? 1;
    const spanT = (def.tSpanM ?? 0) / TRACK_LENGTH_M;
    for (let i = 0; i < count; i++) {
      const size = {
        x: metresToUnits(def.sizeM.x),
        y: metresToUnits(def.sizeM.y),
        z: metresToUnits(def.sizeM.z) / count,
      };

      if (def.fixedWorld) {
        const position = new THREE.Vector3(
          def.fixedWorld.x,
          sampleTerrainHeight(def.fixedWorld.x, def.fixedWorld.z) + size.y / 2,
          def.fixedWorld.z,
        );
        const pose = getPoseAt(def.t);
        out.push({
          id: def.id,
          def,
          position,
          yaw: def.yawOverride ?? yawFromTangent(pose.tangent),
          size,
          segmentIndex: i,
          segmentCount: count,
        });
        continue;
      }

      // Pit garage + paddock chalets: on pit CAD, outside (away from racing line).
      if (def.kit === "pit" || def.kit === "chalets") {
        const garageSpan = PIT_SEG_GARAGE_END - PIT_SEG_ENTRY_END;
        const pitU =
          count === 1
            ? (PIT_SEG_ENTRY_END + PIT_SEG_GARAGE_END) * 0.5
            : PIT_SEG_ENTRY_END + ((i + 0.5) / count) * garageSpan;
        const clamped = Math.min(0.999, Math.max(0, pitU));
        const point = pitCurve.getPointAt(clamped);
        const tangent = pitCurve.getTangentAt(clamped).normalize();
        const side = new THREE.Vector3().crossVectors(up, tangent).normalize();
        // Pose already on pit centerline — do not re-add PIT_LANE_OFFSET.
        // bank -1 = outside of pit forward (paddock side, away from racing line).
        // From pit centerline: pit half-width + runoff + building half (no MAIN_HALF — already off racing line).
        const pitHalf = metresToUnits(FIA.pitWidthM) / 2;
        const lateral =
          pitHalf + metresToUnits(def.lateralClearanceM) + size.x / 2;
        const position = point
          .clone()
          .addScaledVector(side, -lateral)
          .addScaledVector(tangent, metresToUnits(def.alongM));
        position.y = point.y + size.y / 2;
        out.push({
          id: def.id,
          def,
          position,
          yaw: def.yawOverride ?? yawFromTangent(tangent),
          size,
          segmentIndex: i,
          segmentCount: count,
        });
        continue;
      }

      const u = count === 1 ? 0 : (i + 0.5) / count - 0.5;
      const t = wrap01(def.t + u * spanT);
      const pose = getPoseAt(t);
      const position = offsetBesideTrack(pose, {
        bank: def.bank,
        halfWidth: size.x / 2,
        lift: size.y / 2,
        along: metresToUnits(def.alongM),
        includePit: def.includePit,
        runoffM: def.lateralClearanceM,
      });
      out.push({
        id: def.id,
        def,
        position,
        yaw: def.yawOverride ?? yawFromTangent(pose.tangent),
        size,
        segmentIndex: i,
        segmentCount: count,
      });
    }
  }
  return out;
};

export const placementsFor = (
  all: CampusPlacement[],
  id: CampusBuildingId,
): CampusPlacement[] => all.filter((p) => p.id === id);

export const cornerWorld = (
  center: THREE.Vector3,
  yaw: number,
  lx: number,
  lz: number,
): THREE.Vector3 => {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return new THREE.Vector3(
    center.x + lx * c + lz * s,
    0,
    center.z + -lx * s + lz * c,
  );
};
