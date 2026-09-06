import { setRaceAudioMuted } from "@/lib/raceAudio";
import { createStore } from "@/stores/createStore";
import {
  fetchSepangWeather,
  resolveRainIntensity,
  type SepangWeather,
  type WeatherOverride,
} from "@/lib/weather";
import { FIA, PIT_ENTRY_T, PIT_EXIT_T, TRACK_LENGTH_M } from "@/lib/trackCurve";
import {
  clampOverviewZoomLevel,
  OVERVIEW_ZOOM_DEFAULT,
  type OverviewZoomLevel,
} from "@/lib/overviewZoom";
import { gameSpeedToDisplay } from "@/lib/speedUnits";
import { projectWorldToTrack } from "@/lib/trackProjection";
import {
  gridLaneOffsetM,
  nearestCarAhead,
  raceDistance,
  raceDistanceAchievedM,
  resolveTraffic,
  standingsDistance,
} from "@/lib/raceTraffic";
import {
  clearRaceTelemetryCsv as clearTelemetryCsvBuffer,
  downloadRaceTelemetryCsv as downloadTelemetryCsvFile,
  noteRaceTelemetryDebug,
  recordRaceTelemetryCsv,
  startRaceTelemetryCsv,
  stopRaceTelemetryCsv,
} from "@/lib/raceTelemetryCsv";
import {
  availableGrip,
  baseWearRatePerSec,
  integrateSpeedInto,
  SEPANG_AVG_SPEED_MPS,
  strategyPaceScale,
  targetSpeedMps,
  TIRE_WEAR_AUTHORITY,
  type CarPhysicsStatus,
  type IncidentKind,
  type IntegrateResult,
} from "@/lib/racePhysics";
import {
  applyServiceComplete,
  beginPitExit,
  isPitReleaseBlocked,
  pitExitRaceScale,
  pitProgressRate,
  pitSpeedMps,
  PIT_ENTRY_HANDOFF_KMH,
  PIT_EXIT_FLARE_KMH,
  PIT_EXIT_MERGE_LANE_M,
  PIT_EXIT_RACE_BLEND_S,
  PIT_LANE_LIMIT_KMH,
  PIT_POSE_BLEND,
  PIT_STOP_DURATION_S,
  pitBoxTFor,
  type PitPhase,
} from "@/lib/pitStop";
import { emitRaceSnapshot, resetMissionSnapshotPrev } from "@/lib/academy/missionBridge";
import { getLiveRaceCars, setLiveRaceCars } from "@/lib/raceLiveCars";
import { getRaceSimShared } from "@/sim/raceSimContext";
import {
  vehicleBaseIndex,
  VehicleField,
  vehicleFlagsDecode,
} from "@/shared/sharedState";
import { headingFromQuaternion } from "@/lib/vehicleOrientation";
import {
  controlSpeedMult,
  crossedDetection,
  isInDrsZone,
  PENALTY_MS,
  DRS_SPEED_MULT,
  DRS_ZONE_END,
} from "@/lib/academy/raceControl";
import type { PenaltyKind, RaceControlFlag } from "@/lib/academy/types";

export type TyreCompound = "soft" | "medium" | "hard" | "intermediate" | "wet";
export type EngineMode = "push" | "standard" | "save";
export type RacePhase = "landing" | "ready" | "starting" | "racing" | "finished";
export type CameraMode = "overview" | "follow";
export type PlayMode = "free" | "mission";
export type { PitPhase, RaceControlFlag, PenaltyKind };

/** Liveries the player can pick on landing. */
export const PLAYER_LIVERIES = [
  { id: "rose", name: "Rose", color: "#f43f5e" },
  { id: "sky", name: "Sky", color: "#38bdf8" },
  { id: "violet", name: "Violet", color: "#a78bfa" },
  { id: "lime", name: "Lime", color: "#84cc16" },
  { id: "amber", name: "Amber", color: "#fbbf24" },
  { id: "orange", name: "Orange", color: "#fb923c" },
  { id: "fuchsia", name: "Fuchsia", color: "#e879f9" },
  { id: "teal", name: "Teal", color: "#2dd4bf" },
] as const;

export const PIT_STALL_COUNT = 10;

export type CarState = {
  id: string;
  name: string;
  color: string;
  isPlayer: boolean;
  lapProgress: number;
  currentLap: number;
  tireWear: number;
  currentCompound: TyreCompound;
  engineMode: EngineMode;
  isBoxing: boolean;
  pendingBox: boolean;
  pendingCompound: TyreCompound | null;
  pitProgress: number;
  pitPhase: PitPhase | null;
  pitStopElapsed: number;
  pitBoxIndex: number;
  /** FIA grid slot 0 = pole … 9 = back row (from pit stall pick on landing). */
  gridSlot: number;
  pitHoldTraffic: boolean;
  pitServiceDone: boolean;
  unsafeReleasePenaltyMs: number;
  currentLapTimeMs: number;
  lastLapTimeMs: number;
  finished: boolean;
  finishTimeMs: number;
  /** Post-race: peel into pit lane and park in garage (race time already recorded). */
  garageReturn: boolean;
  /** Metres from centerline (−left / +right). */
  laneOffsetM: number;
  /** Desired lane for smooth lerp / overtake cuts. */
  laneTargetM: number;
  /**
   * Path-rail follow factor (1 = open track). Gap/attack logic writes this;
   * desk folds it into gripScale so AI-owned targetSpeed still packs up.
   */
  trafficPaceScale: number;
  /** Id of car currently blocking us (traffic debug). */
  blockId: string | null;
  /**
   * Pit entry is before S/F; exit is after. When true, merge at pit exit
   * must currentLap++ (normal box). False if lap already counted via on-track wrap.
   */
  pitLapPending: boolean;
  /** 0 just after pit merge → 1 full race pace (see PIT_EXIT_RACE_BLEND_S). */
  pitExitBlend: number;
  /** Steward time penalties applied to finish (ms). */
  timePenaltyMs: number;
  /** Within 1s at detection — eligible for DRS this lap. */
  drsEligible: boolean;
  /**
   * World pose when boxing starts — peel from path-rail into pit CAD
   * instead of teleporting to centerline at PIT_ENTRY_T.
   */
  pitEntryPos: { x: number; y: number; z: number } | null;
  pitEntryTan: { x: number; z: number } | null;
  /** Along-track speed (gameplay m/s). */
  speedMps: number;
  /** Grip-limited dynamics status. */
  status: CarPhysicsStatus;
  /** Accumulated crash / slide damage 0–100. */
  damage: number;
  /** Seconds remaining in slide/spin. */
  incidentTimer: number;
  /** Last incident for HUD flash. */
  incidentKind: IncidentKind;
  /** 0–1 brake demand for rear light visuals. */
  brakeIntensity: number;
  /** True after the grid ghost lap wraps at S/F — first wrap never counts. */
  sfCrossedOnce: boolean;
};

export type StandingsRow = {
  id: string;
  name: string;
  color: string;
  isPlayer: boolean;
  position: number;
  currentLap: number;
  lapProgress: number;
  gapLabel: string;
  /** Display speed in SPEED_DISPLAY_UNIT. */
  speedDisplay: number;
  /** Race distance achieved in kilometres. */
  distanceKm: number;
  tireWear: number;
  compound: TyreCompound;
  finished: boolean;
  /** DNF / incident status for timing tower. */
  carStatus: CarPhysicsStatus;
};

type RaceStore = {
  phase: RacePhase;
  totalLaps: number;
  elapsedMs: number;
  cars: CarState[];
  playerId: string;
  // Convenience mirrors of player car for simple UI selectors
  lapProgress: number;
  currentLap: number;
  tireWear: number;
  currentCompound: TyreCompound;
  engineMode: EngineMode;
  isBoxing: boolean;
  /** Queued box call — car still on track until pit entry. */
  pendingBox: boolean;
  pitPhase: PitPhase | null;
  pitHoldTraffic: boolean;
  pitServiceDone: boolean;
  unsafeReleasePenaltyMs: number;
  currentLapTimeMs: number;
  lastLapTimeMs: number;
  speedMps: number;
  grip: number;
  damage: number;
  carStatus: CarPhysicsStatus;
  incidentKind: IncidentKind;
  weather: SepangWeather | null;
  weatherOverride: WeatherOverride;
  rainIntensity: number;
  standings: StandingsRow[];
  winnerId: string | null;
  isRunning: boolean;
  /** How many of the five FIA reds are lit (0–5) during starting */
  startLightCount: number;
  startLightsGreen: boolean;
  startLightsOut: boolean;
  cameraMode: CameraMode;
  /** Overview tracks YOU until the user orbits; Overview click re-locks. */
  overviewFollow: boolean;
  /** Bird's-eye follow distance: 1 close … 5 ants. */
  overviewZoomLevel: OverviewZoomLevel;
  /** Landing picks — applied when building the grid. */
  selectedPlayerColor: string;
  selectedPitBoxIndex: number;
  start: () => void;
  stop: () => void;
  /** Landing → race desk (grid visible, wait for Start). */
  enterRaceDesk: () => void;
  /** Race desk Start → FIA lights sequence. */
  beginRace: () => void;
  goRacing: () => void;
  /** Download in-memory race analytics CSV (1 ms rows, hold-forward). */
  downloadRaceTelemetryCsv: () => boolean;
  clearRaceTelemetryCsv: () => void;
  resetToLanding: () => void;
  setPlayerLivery: (color: string) => void;
  setPlayerPitBox: (index: number) => void;
  setTotalLaps: (laps: number) => void;
  setCompound: (compound: TyreCompound) => void;
  setEngineMode: (mode: EngineMode) => void;
  requestBoxNextLap: () => void;
  /** Player: leave box after service (unsafe if traffic ahead). */
  releaseFromBox: () => void;
  setWeatherOverride: (override: WeatherOverride) => void;
  setCameraMode: (mode: CameraMode) => void;
  /** User dragged overview — stop tracking YOU until Overview is clicked again. */
  unlockOverviewFollow: () => void;
  setOverviewZoomLevel: (level: number) => void;
  audioMuted: boolean;
  setAudioMuted: (muted: boolean) => void;
  loadWeather: () => Promise<void>;
  /** free race vs academy mission */
  playMode: PlayMode;
  /** Coach overlay open — freeze race clock */
  missionPaused: boolean;
  raceControl: RaceControlFlag;
  drsEnabled: boolean;
  drsActive: boolean;
  blueFlagActive: boolean;
  playerPenalties: PenaltyKind[];
  setMissionPaused: (paused: boolean) => void;
  setRaceControl: (flag: RaceControlFlag) => void;
  clearRaceControl: () => void;
  startMissionRace: (opts: {
    totalLaps: number;
    weatherOverride?: WeatherOverride;
    startCompound?: TyreCompound;
    autoBegin?: boolean;
  }) => void;
  forcePlayerWear: (wear: number) => void;
  spawnPitTraffic: () => void;
  setDrsEnabled: (on: boolean) => void;
  setBlueFlagActive: (on: boolean) => void;
  addPlayerPenalty: (kind: PenaltyKind) => void;
  releasePlayerForced: (unsafe: boolean) => void;
  abortStartSequence: () => void;
  clearPlayMode: () => void;
};

const TOTAL_LAPS = 3;
export const PLAYER_ID = "you";

export const FIELD_META = [
  { id: PLAYER_ID, name: "YOU", color: "#f43f5e", isPlayer: true },
  { id: "r1", name: "KD-01", color: "#38bdf8", isPlayer: false },
  { id: "r2", name: "KD-07", color: "#a78bfa", isPlayer: false },
  { id: "r3", name: "MY-22", color: "#34d399", isPlayer: false },
  { id: "r4", name: "SG-44", color: "#fbbf24", isPlayer: false },
  { id: "r5", name: "TH-11", color: "#fb923c", isPlayer: false },
  { id: "r6", name: "ID-18", color: "#e879f9", isPlayer: false },
  { id: "r7", name: "VN-03", color: "#2dd4bf", isPlayer: false },
  { id: "r8", name: "PH-55", color: "#94a3b8", isPlayer: false },
  { id: "r9", name: "BN-09", color: "#c084fc", isPlayer: false },
] as const;

const CAR_INDEX_BY_ID = new Map<string, number>(
  FIELD_META.map((m, i) => [m.id, i]),
);

/** Stable grid slot index for a car id (matches GRID / FIELD_META order). */
export const gridIndexForCar = (carId: string): number => CAR_INDEX_BY_ID.get(carId) ?? 0;

/** Starting grid slot — pit stall pick sets player slot; AI use FIELD_META order fallback. */
export const gridSlotForCar = (car: Pick<CarState, "id" | "gridSlot">): number =>
  car.gridSlot ?? gridIndexForCar(car.id);

export const RACE_LAP_OPTIONS = [3, 5, 6, 10, 12] as const;

/** Reused every car, every frame — avoids 10 IntegrateResult allocations per tick. */
const PHYS_SCRATCH: IntegrateResult = {
  speedMps: 0,
  status: "racing",
  damage: 0,
  incidentTimer: 0,
  incidentKind: null,
  tireWear: 100,
  extraWear: 0,
  grip: 1,
  brakeIntensity: 0,
};

const GRID: Omit<
  CarState,
  | "lapProgress"
  | "currentLap"
  | "tireWear"
  | "isBoxing"
  | "pendingBox"
  | "pendingCompound"
  | "pitProgress"
  | "pitPhase"
  | "pitStopElapsed"
  | "pitBoxIndex"
  | "gridSlot"
  | "pitHoldTraffic"
  | "pitServiceDone"
  | "unsafeReleasePenaltyMs"
  | "currentLapTimeMs"
  | "lastLapTimeMs"
  | "finished"
  | "finishTimeMs"
  | "garageReturn"
  | "laneOffsetM"
  | "laneTargetM"
  | "trafficPaceScale"
  | "blockId"
  | "pitLapPending"
  | "pitExitBlend"
  | "timePenaltyMs"
  | "drsEligible"
  | "pitEntryPos"
  | "pitEntryTan"
  | "speedMps"
  | "status"
  | "damage"
  | "incidentTimer"
  | "incidentKind"
  | "brakeIntensity"
  | "sfCrossedOnce"
>[] = [
  // AI stints stay near medium/standard so the pack launches together.
  // Soft+push is a player lever — not a 3-car breakaway template.
  { id: PLAYER_ID, name: "YOU", color: "#f43f5e", isPlayer: true, currentCompound: "medium", engineMode: "standard" },
  { id: "r1", name: "KD-01", color: "#38bdf8", isPlayer: false, currentCompound: "medium", engineMode: "standard" },
  { id: "r2", name: "KD-07", color: "#a78bfa", isPlayer: false, currentCompound: "medium", engineMode: "standard" },
  { id: "r3", name: "MY-22", color: "#34d399", isPlayer: false, currentCompound: "soft", engineMode: "standard" },
  { id: "r4", name: "SG-44", color: "#fbbf24", isPlayer: false, currentCompound: "medium", engineMode: "push" },
  { id: "r5", name: "TH-11", color: "#fb923c", isPlayer: false, currentCompound: "hard", engineMode: "standard" },
  { id: "r6", name: "ID-18", color: "#e879f9", isPlayer: false, currentCompound: "medium", engineMode: "standard" },
  { id: "r7", name: "VN-03", color: "#2dd4bf", isPlayer: false, currentCompound: "medium", engineMode: "save" },
  { id: "r8", name: "PH-55", color: "#94a3b8", isPlayer: false, currentCompound: "medium", engineMode: "standard" },
  { id: "r9", name: "BN-09", color: "#c084fc", isPlayer: false, currentCompound: "hard", engineMode: "standard" },
];

const createGrid = (playerColor: string, playerPitBox: number): CarState[] => {
  const pitBox = Math.max(0, Math.min(PIT_STALL_COUNT - 1, Math.floor(playerPitBox)));
  /** Pit stall N → start on grid row N (stall 8 = P8, not pole). */
  const playerGridSlot = pitBox;
  const aiGridSlots = Array.from({ length: GRID.length }, (_, i) => i).filter(
    (i) => i !== playerGridSlot,
  );

  const used = new Set<number>([pitBox]);
  let cursor = 0;
  const nextFreePit = (): number => {
    while (used.has(cursor)) cursor += 1;
    const i = cursor;
    used.add(i);
    cursor += 1;
    return i;
  };

  let aiSlotIdx = 0;
  return GRID.map((car) => {
    const gridSlot = car.isPlayer ? playerGridSlot : aiGridSlots[aiSlotIdx++]!;
    const behindM = FIA.gridFrontGapM + gridSlot * FIA.gridRowSpacingM;
    const lapProgress = ((1 - behindM / TRACK_LENGTH_M) % 1 + 1) % 1;
    const lane = gridLaneOffsetM(gridSlot);
    const pitBoxIndex = car.isPlayer ? pitBox : nextFreePit();
    return {
      ...car,
      color: car.isPlayer ? playerColor : car.color,
      lapProgress,
      currentLap: 1,
      tireWear: 100 - gridSlot * 0.5,
      isBoxing: false,
      pendingBox: false,
      pendingCompound: null,
      pitProgress: 0,
      pitPhase: null,
      pitStopElapsed: 0,
      pitBoxIndex,
      gridSlot,
      pitHoldTraffic: false,
      pitServiceDone: false,
      unsafeReleasePenaltyMs: 0,
      currentLapTimeMs: 0,
      lastLapTimeMs: 0,
      finished: false,
      finishTimeMs: 0,
      garageReturn: false,
      laneOffsetM: lane,
      laneTargetM: lane,
      trafficPaceScale: 1,
      blockId: null,
      pitLapPending: false,
      pitExitBlend: 1,
      timePenaltyMs: 0,
      drsEligible: false,
      pitEntryPos: null,
      pitEntryTan: null,
      speedMps: 0,
      status: "racing",
      damage: 0,
      incidentTimer: 0,
      incidentKind: null,
      brakeIntensity: 0,
      sfCrossedOnce: false,
    };
  });
};

/** Apply grid/stint choices before lights out — not a pit stop. */
const applyPlayerGridStint = (
  cars: CarState[],
  compound: TyreCompound,
  engineMode: EngineMode,
): CarState[] =>
  cars.map((car) =>
    car.isPlayer
      ? {
          ...car,
          currentCompound: compound,
          engineMode,
          pendingCompound: null,
          pendingBox: false,
        }
      : car,
  );

const isPreRaceSetup = (phase: RacePhase): boolean =>
  phase === "landing" || phase === "ready";

const pickAiCompound = (rain: number, tireWear: number): TyreCompound => {
  if (rain >= 0.65) return "wet";
  if (rain >= 0.35) return "intermediate";
  if (tireWear < 28) return "soft";
  if (rain > 0.18) return "hard";
  return "medium";
};

const needsWetStrategyBox = (car: CarState, rain: number): boolean => {
  const c = car.currentCompound;
  if (rain >= 0.65 && c !== "wet") return true;
  if (rain >= 0.35 && rain < 0.65 && c !== "intermediate" && c !== "wet") return true;
  if (rain < 0.15 && (c === "intermediate" || c === "wet")) return true;
  if (rain > 0.5 && (c === "soft" || c === "medium")) return true;
  return false;
};

/** Ignore ultra-short S/F wraps (pit teleport glitches). Grid ghost lap uses sfCrossedOnce. */
const MIN_LAP_MS = 2500;

export const resolveTargetMps = (
  car: CarState,
  rain: number,
  control: RaceControlFlag,
  drsOn: boolean,
): number => {
  const drs =
    drsOn && car.drsEligible && isInDrsZone(car.lapProgress) ? DRS_SPEED_MULT : 1;
  return targetSpeedMps({
    compound: car.currentCompound,
    engineMode: car.engineMode,
    rain,
    tireWear: car.tireWear,
    damage: car.damage,
    lapProgress: car.lapProgress,
    controlMult: controlSpeedMult(control),
    drsMult: drs,
    pitExitBlend: car.pitExitBlend,
    pitExitScale: pitExitRaceScale,
  });
};

const raceComplete = (car: CarState): boolean => car.finished || car.garageReturn;

const isGridStandingsPhase = (phase: RacePhase): boolean =>
  phase === "ready" || phase === "starting";

const buildStandings = (
  cars: CarState[],
  totalLaps: number,
  phase: RacePhase,
): StandingsRow[] => {
  const gridOrder = isGridStandingsPhase(phase);
  // DNF only if retired before taking the chequered flag. Post-race in-lap
  // (garageReturn) can falsely retire from kinematic brake lockups — still a finisher.
  const isDnf = (car: CarState): boolean =>
    car.status === "retired" && !car.garageReturn;
  const isRaceFinisher = (car: CarState): boolean =>
    car.garageReturn || (car.finished && !isDnf(car));

  const sorted = [...cars].sort((a, b) => {
    const aOut = isDnf(a);
    const bOut = isDnf(b);
    if (aOut && bOut) {
      return standingsDistance(b, gridOrder) - standingsDistance(a, gridOrder);
    }
    if (aOut) return 1;
    if (bOut) return -1;

    const aDone = isRaceFinisher(a);
    const bDone = isRaceFinisher(b);
    if (aDone && bDone) return a.finishTimeMs - b.finishTimeMs;
    if (aDone) return -1;
    if (bDone) return 1;
    return standingsDistance(b, gridOrder) - standingsDistance(a, gridOrder);
  });

  const leader = sorted.find((car) => !isDnf(car)) ?? sorted[0];
  return sorted.map((car, i) => {
    let gapLabel = "LEADER";
    if (isDnf(car)) {
      gapLabel = "OUT";
    } else if (i > 0 && !isDnf(car)) {
      if (isRaceFinisher(car) && isRaceFinisher(leader)) {
        const gap = ((car.finishTimeMs - leader.finishTimeMs) / 1000).toFixed(2);
        gapLabel = `+${gap}s`;
      } else {
        const gapM =
          (standingsDistance(leader, gridOrder) - standingsDistance(car, gridOrder)) *
          TRACK_LENGTH_M;
        if (gapM > TRACK_LENGTH_M * 0.95) {
          gapLabel = `+${Math.ceil(gapM / TRACK_LENGTH_M)} LAP`;
        } else {
          gapLabel = `+${(gapM / SEPANG_AVG_SPEED_MPS).toFixed(1)}s`;
        }
      }
    }
    const distM = raceDistanceAchievedM(car);
    return {
      id: car.id,
      name: car.isPlayer ? `YOU · #${car.pitBoxIndex + 1}` : car.name,
      color: car.color,
      isPlayer: car.isPlayer,
      position: i + 1,
      currentLap: Math.min(car.currentLap, totalLaps),
      lapProgress: car.lapProgress,
      gapLabel,
      speedDisplay: Math.round(gameSpeedToDisplay(car.speedMps)),
      distanceKm: Math.round(distM / 10) / 100,
      tireWear: car.tireWear,
      compound: car.currentCompound,
      finished: raceComplete(car),
      carStatus: car.status,
    };
  });
};

const syncPlayerMirrors = (cars: CarState[], rain = 0.2) => {
  const player = cars.find((c) => c.isPlayer) ?? cars[0];
  return {
    lapProgress: player.lapProgress,
    currentLap: player.currentLap,
    tireWear: player.tireWear,
    currentCompound: player.currentCompound,
    engineMode: player.engineMode,
    isBoxing: !!player.isBoxing,
    pendingBox: !!player.pendingBox && !player.isBoxing,
    pitPhase: player.pitPhase,
    pitHoldTraffic: player.pitHoldTraffic,
    pitServiceDone: player.pitServiceDone,
    unsafeReleasePenaltyMs: player.unsafeReleasePenaltyMs,
    currentLapTimeMs: player.currentLapTimeMs,
    lastLapTimeMs: player.lastLapTimeMs,
    speedMps: player.speedMps,
    grip: availableGrip(
      player.currentCompound,
      rain,
      player.tireWear,
      player.damage,
      player.engineMode,
    ),
    damage: player.damage,
    carStatus: player.status,
    incidentKind: player.incidentKind,
  };
};

const clearPitFlags = (car: CarState): CarState => ({
  ...car,
  isBoxing: false,
  pitProgress: 0,
  pitPhase: null,
  pitStopElapsed: 0,
  pitHoldTraffic: false,
  pitServiceDone: false,
  pitEntryPos: null,
  pitEntryTan: null,
});

/** Capture path-rail SAB pose so pit peel starts where the car actually is. */
const capturePitEntryPose = (
  carId: string,
): Pick<CarState, "pitEntryPos" | "pitEntryTan"> => {
  const shared = getRaceSimShared();
  const index = CAR_INDEX_BY_ID.get(carId);
  if (!shared || index === undefined) {
    return { pitEntryPos: null, pitEntryTan: null };
  }
  const base = vehicleBaseIndex(index);
  const f = shared.floats;
  const yaw = headingFromQuaternion(
    f[base + VehicleField.quatX],
    f[base + VehicleField.quatY],
    f[base + VehicleField.quatZ],
    f[base + VehicleField.quatW],
  );
  return {
    pitEntryPos: {
      x: f[base + VehicleField.posX],
      y: f[base + VehicleField.posY],
      z: f[base + VehicleField.posZ],
    },
    pitEntryTan: { x: Math.sin(yaw), z: Math.cos(yaw) },
  };
};

/** Flip free → boxing without a mid-track teleport/stop. */
const beginPitEntry = (car: CarState, pitProgressSeed = 0): void => {
  const from = capturePitEntryPose(car.id);
  car.isBoxing = true;
  car.pitPhase = "in";
  car.pitProgress = pitProgressSeed;
  car.pitStopElapsed = 0;
  car.pitHoldTraffic = false;
  car.pitServiceDone = false;
  car.lapProgress = PIT_ENTRY_T;
  car.pitEntryPos = from.pitEntryPos;
  car.pitEntryTan = from.pitEntryTan;
  // Keep rolling into the lane — handoff ceiling, never a dead stop.
  const handoff = PIT_ENTRY_HANDOFF_KMH / 3.6;
  car.speedMps =
    car.speedMps > 1 ? Math.min(car.speedMps, handoff) : handoff * 0.9;
};

/** Record finish time at S/F then drive in-lap to pit garage (F1 post-race). */
const beginGarageReturn = (
  car: CarState,
  elapsedMs: number,
  dt: number,
  totalLaps: number,
): CarState => {
  const finishTimeMs =
    car.finishTimeMs > 0
      ? car.finishTimeMs
      : elapsedMs + dt * 1000 + car.unsafeReleasePenaltyMs + car.timePenaltyMs;
  return {
    ...clearPitFlags(car),
    finishTimeMs,
    currentLap: totalLaps,
    garageReturn: true,
    pendingBox: true,
    pendingCompound: null,
    pitLapPending: false,
    finished: false,
    speedMps: Math.min(car.speedMps, PIT_LANE_LIMIT_KMH / 3.6),
  };
};

/**
 * Chequered at S/F is after PIT_ENTRY_T (~42 m). A pending-box in-lap would
 * force nearly a full circuit at handoff speed (~110 km/h) before pits — feels
 * like a softlock. Peel into the lane immediately; podium can arm on garageReturn.
 */
const applyGarageReturn = (
  car: CarState,
  elapsedMs: number,
  dt: number,
  totalLaps: number,
): void => {
  Object.assign(car, beginGarageReturn(car, elapsedMs, dt, totalLaps));
  beginPitEntry(car, 0);
};

const completeGarageReturn = (car: CarState): CarState => ({
  ...car,
  finished: true,
  garageReturn: false,
  pendingBox: false,
  isBoxing: true,
  pitPhase: "stopped",
  pitHoldTraffic: true,
  pitServiceDone: true,
  speedMps: 0,
  // Keep classified as finisher even if in-lap falsely marked retired.
  status: car.status === "retired" ? "racing" : car.status,
});

const finishPitExit = (car: CarState, elapsedMs: number, totalLaps: number, dt: number): CarState => {
  let next = clearPitFlags(car);
  next.pitExitBlend = 0;
  next.lapProgress = PIT_EXIT_T;
  // Seed pit-side lane so path-rail boot does not drop mid then peel like lights-out.
  next.laneOffsetM = PIT_EXIT_MERGE_LANE_M;
  next.laneTargetM = PIT_EXIT_MERGE_LANE_M;
  // Merge at flare pace — do not keep stale race speed or drop to 0.
  next.speedMps = PIT_EXIT_FLARE_KMH / 3.6;
  next.status = next.status === "retired" ? "retired" : "racing";
  next.incidentTimer = 0;
  next.incidentKind = null;
  if (next.pitLapPending) {
    next.lastLapTimeMs = next.currentLapTimeMs;
    next.currentLapTimeMs = 0;
    next.currentLap += 1;
    next.pitLapPending = false;
  }
  if (next.currentLap > totalLaps) {
    return beginGarageReturn(next, elapsedMs, dt, totalLaps);
  }
  return next;
};

let uiSyncAccum = 0;
let simElapsedMs = 0;
const UI_SYNC_INTERVAL_S = 0.05;
let startTimers: ReturnType<typeof setTimeout>[] = [];

const clearStartTimers = () => {
  for (const id of startTimers) clearTimeout(id);
  startTimers = [];
};

const DEFAULT_PLAYER_COLOR = PLAYER_LIVERIES[0].color;
const DEFAULT_PIT_BOX = 0;

const rebuildPreRaceGrid = (
  color: string,
  pitBox: number,
  compound: TyreCompound,
  engineMode: EngineMode,
): CarState[] =>
  applyPlayerGridStint(createGrid(color, pitBox), compound, engineMode);

const buildGridFromSelection = (
  color: string = DEFAULT_PLAYER_COLOR,
  pitBox: number = DEFAULT_PIT_BOX,
): CarState[] => createGrid(color, pitBox);

const initialCars = buildGridFromSelection();
setLiveRaceCars(initialCars);

/**
 * Mutate cars through the LIVE per-frame array (the sim's source of truth),
 * commit it, and return it for the store snapshot. Mapping over `state.cars`
 * would edit a stale 20 Hz UI snapshot and the sim would never see the change.
 */
const mutateCars = (
  fn: (car: CarState, cars: CarState[]) => CarState,
): CarState[] => {
  const live = getLiveRaceCars();
  for (let i = 0; i < live.length; i += 1) {
    Object.assign(live[i], fn(live[i], live));
  }
  return live;
};

export const useRaceStore = createStore<RaceStore>((set, get) => ({
  phase: "landing",
  totalLaps: TOTAL_LAPS,
  elapsedMs: 0,
  cars: initialCars,
  playerId: PLAYER_ID,
  ...syncPlayerMirrors(initialCars),
  weather: null,
  weatherOverride: "auto",
  rainIntensity: 0.2,
  standings: buildStandings(initialCars, TOTAL_LAPS, "landing"),
  winnerId: null,
  isRunning: false,
  startLightCount: 0,
  startLightsGreen: false,
  startLightsOut: false,
  cameraMode: "overview",
  overviewFollow: true,
  overviewZoomLevel: OVERVIEW_ZOOM_DEFAULT,
  audioMuted: false,
  selectedPlayerColor: DEFAULT_PLAYER_COLOR,
  selectedPitBoxIndex: DEFAULT_PIT_BOX,
  playMode: "free",
  missionPaused: false,
  raceControl: "green",
  drsEnabled: false,
  drsActive: false,
  blueFlagActive: false,
  playerPenalties: [],

  start: () => {
    if (get().isRunning) return;
    uiSyncAccum = 0;
    set({ isRunning: true });
  },

  stop: () => {
    set({ isRunning: false });
  },

  beginRace: () => {
    if (get().phase !== "ready") return;
    clearStartTimers();
    clearTelemetryCsvBuffer();
    simElapsedMs = 0;
    uiSyncAccum = 0;
    const { selectedPlayerColor, selectedPitBoxIndex, totalLaps, currentCompound, engineMode } =
      get();
    const cars = applyPlayerGridStint(
      createGrid(selectedPlayerColor, selectedPitBoxIndex),
      currentCompound,
      engineMode,
    );
    setLiveRaceCars(cars);
    get().stop();
    set({
      phase: "starting",
      elapsedMs: 0,
      cars,
      standings: buildStandings(cars, totalLaps, "starting"),
      winnerId: null,
      startLightCount: 0,
      startLightsGreen: false,
      startLightsOut: false,
      raceControl: "green",
      missionPaused: false,
      drsActive: false,
      blueFlagActive: false,
      ...syncPlayerMirrors(cars),
      rainIntensity: resolveRainIntensity(get().weatherOverride, get().weather),
    });
    get().start();

    // FIA: 0.5s settle, then five reds at 1s, then random 0.2–3s, lights out
    const settleMs = 500;
    for (let n = 1; n <= 5; n++) {
      const delay = settleMs + (n - 1) * 1000;
      startTimers.push(
        setTimeout(() => {
          if (get().phase !== "starting") return;
          set({ startLightCount: n });
        }, delay),
      );
    }
    const holdMs = 200 + Math.random() * 2800;
    const greenMs = 650;
    startTimers.push(
      setTimeout(() => {
        if (get().phase !== "starting") return;
        set({ startLightsGreen: true, startLightCount: 5 });
        startTimers.push(
          setTimeout(() => {
            if (get().phase !== "starting") return;
            set({ startLightsGreen: false });
            get().goRacing();
          }, greenMs),
        );
      }, settleMs + 5 * 1000 + holdMs),
    );
  },

  enterRaceDesk: () => {
    clearStartTimers();
    simElapsedMs = 0;
    uiSyncAccum = 0;
    get().stop();
    resetMissionSnapshotPrev();
    const { selectedPlayerColor, selectedPitBoxIndex, totalLaps, currentCompound, engineMode } =
      get();
    const cars = applyPlayerGridStint(
      createGrid(selectedPlayerColor, selectedPitBoxIndex),
      currentCompound,
      engineMode,
    );
    setLiveRaceCars(cars);
    set({
      phase: "ready",
      playMode: get().playMode === "mission" ? "mission" : "free",
      elapsedMs: 0,
      cars,
      standings: buildStandings(cars, totalLaps, "ready"),
      winnerId: null,
      startLightCount: 0,
      startLightsGreen: false,
      startLightsOut: false,
      cameraMode: "overview",
      overviewFollow: true,
      overviewZoomLevel: OVERVIEW_ZOOM_DEFAULT,
      raceControl: "green",
      missionPaused: false,
      drsActive: false,
      blueFlagActive: get().blueFlagActive,
      ...syncPlayerMirrors(cars),
      rainIntensity: resolveRainIntensity(get().weatherOverride, get().weather),
    });
    const player = cars.find((c) => c.isPlayer);
    emitRaceSnapshot({
      phase: "ready",
      elapsedMs: 0,
      currentLap: player?.currentLap ?? 1,
      lapProgress: player?.lapProgress ?? 0,
      pitPhase: null,
      pitHoldTraffic: false,
      pitServiceDone: false,
      isBoxing: false,
      raceControl: "green",
      startLightsOut: false,
    });
  },

  setPlayerLivery: (color) => {
    set((s) => {
      const isPreRace = s.phase === "landing" || s.phase === "ready";
      const cars = isPreRace
        ? rebuildPreRaceGrid(color, s.selectedPitBoxIndex, s.currentCompound, s.engineMode)
        : s.cars.map((car) => (car.isPlayer ? { ...car, color } : car));
      if (isPreRace) setLiveRaceCars(cars);
      return {
        selectedPlayerColor: color,
        cars,
        standings: buildStandings(cars, s.totalLaps, s.phase),
        ...(isPreRace ? syncPlayerMirrors(cars, s.rainIntensity) : {}),
      };
    });
  },

  setPlayerPitBox: (index) => {
    const pit = Math.max(0, Math.min(PIT_STALL_COUNT - 1, Math.floor(index)));
    set((s) => {
      const isPreRace = s.phase === "landing" || s.phase === "ready";
      if (!isPreRace) return { selectedPitBoxIndex: pit };
      const cars = rebuildPreRaceGrid(
        s.selectedPlayerColor,
        pit,
        s.currentCompound,
        s.engineMode,
      );
      setLiveRaceCars(cars);
      return {
        selectedPitBoxIndex: pit,
        cars,
        standings: buildStandings(cars, s.totalLaps, s.phase),
        ...syncPlayerMirrors(cars, s.rainIntensity),
      };
    });
  },

  setTotalLaps: (laps) => {
    const totalLaps = Math.max(1, Math.min(12, Math.floor(laps)));
    set((s) => ({
      totalLaps,
      standings: buildStandings(s.cars, totalLaps, s.phase),
    }));
  },

  goRacing: () => {
    clearStartTimers();
    if (get().phase !== "starting") return;
    startRaceTelemetryCsv(CAR_INDEX_BY_ID);
    set({
      phase: "racing",
      startLightCount: 0,
      startLightsGreen: false,
      startLightsOut: true,
      raceControl: "green",
      ...syncPlayerMirrors(get().cars),
    });
    const s = get();
    const player = s.cars.find((c) => c.isPlayer);
    emitRaceSnapshot({
      phase: "racing",
      elapsedMs: s.elapsedMs,
      currentLap: player?.currentLap ?? 1,
      lapProgress: player?.lapProgress ?? 0,
      pitPhase: player?.pitPhase ?? null,
      pitHoldTraffic: !!player?.pitHoldTraffic,
      pitServiceDone: !!player?.pitServiceDone,
      isBoxing: !!player?.isBoxing,
      raceControl: "green",
      startLightsOut: true,
    });
    startTimers.push(
      setTimeout(() => {
        set({ startLightsOut: false });
      }, 2500),
    );
  },

  downloadRaceTelemetryCsv: () => downloadTelemetryCsvFile(),

  clearRaceTelemetryCsv: () => {
    clearTelemetryCsvBuffer();
  },

  resetToLanding: () => {
    clearStartTimers();
    stopRaceTelemetryCsv();
    simElapsedMs = 0;
    get().stop();
    resetMissionSnapshotPrev();
    const { selectedPlayerColor, selectedPitBoxIndex, totalLaps } = get();
    const cars = createGrid(selectedPlayerColor, selectedPitBoxIndex);
    setLiveRaceCars(cars);
    set({
      phase: "landing",
      playMode: "free",
      elapsedMs: 0,
      cars,
      standings: buildStandings(cars, totalLaps, "landing"),
      winnerId: null,
      startLightCount: 0,
      startLightsGreen: false,
      startLightsOut: false,
      cameraMode: "overview",
      overviewFollow: true,
      overviewZoomLevel: OVERVIEW_ZOOM_DEFAULT,
      missionPaused: false,
      raceControl: "green",
      drsEnabled: false,
      drsActive: false,
      blueFlagActive: false,
      playerPenalties: [],
      ...syncPlayerMirrors(cars),
    });
  },

  setCompound: (compound) => {
    const phase = get().phase;
    const cars = mutateCars((car) => {
      if (!car.isPlayer) return car;
      if (isPreRaceSetup(phase)) {
        return {
          ...car,
          currentCompound: compound,
          pendingCompound: null,
          pendingBox: false,
        };
      }
      if (car.pendingBox || car.isBoxing) {
        return { ...car, pendingCompound: compound };
      }
      // Stint compound change requires a box
      return { ...car, pendingCompound: compound, pendingBox: true };
    });
    set((state) => ({
      cars,
      ...syncPlayerMirrors(cars, state.rainIntensity),
      standings: buildStandings(cars, state.totalLaps, state.phase),
    }));
  },

  setEngineMode: (mode) => {
    const cars = mutateCars((car) => (car.isPlayer ? { ...car, engineMode: mode } : car));
    set((state) => ({
      cars,
      ...syncPlayerMirrors(cars, state.rainIntensity),
    }));
  },

  setCameraMode: (mode) => {
    // Overview click always re-locks tracking on YOU (closer snap handled in scene).
    set({
      cameraMode: mode,
      ...(mode === "overview" ? { overviewFollow: true } : {}),
    });
  },

  unlockOverviewFollow: () => {
    if (!get().overviewFollow) return;
    set({ overviewFollow: false });
  },
  setOverviewZoomLevel: (level) => {
    const overviewZoomLevel = clampOverviewZoomLevel(level);
    set({
      overviewZoomLevel,
      cameraMode: "overview",
      overviewFollow: true,
    });
  },

  setAudioMuted: (muted) => {
    setRaceAudioMuted(muted);
    set({ audioMuted: muted });
  },

  requestBoxNextLap: () => {
    const cars = mutateCars((car) => {
      if (!car.isPlayer) return car;
      return {
        ...car,
        pendingBox: true,
        pendingCompound: car.pendingCompound ?? car.currentCompound,
      };
    });
    set({ cars, ...syncPlayerMirrors(cars) });
  },

  releaseFromBox: () => {
    const cars = mutateCars((car, all) => {
      if (!car.isPlayer || !car.isBoxing || car.pitPhase !== "stopped" || !car.pitServiceDone) {
        return car;
      }
      const unsafe = isPitReleaseBlocked(all, car);
      return beginPitExit(car, unsafe);
    });
    set((state) => ({
      cars,
      ...syncPlayerMirrors(cars),
      standings: buildStandings(cars, state.totalLaps, state.phase),
    }));
  },

  setWeatherOverride: (override) => {
    const rainIntensity = resolveRainIntensity(override, get().weather);
    set({
      weatherOverride: override,
      rainIntensity,
      weather:
        override === "auto"
          ? get().weather
          : {
              rainIntensity,
              precipProbability: override === "dry" ? 5 : override === "light" ? 55 : 90,
              rainMm: override === "dry" ? 0 : override === "light" ? 1.2 : 4,
              label: override === "dry" ? "Override: Dry" : override === "light" ? "Override: Light rain" : "Override: Heavy rain",
              source: "override",
              fetchedAt: new Date().toISOString(),
              timezone: "Asia/Kuala_Lumpur",
            },
    });
  },

  setMissionPaused: (paused) => {
    set({ missionPaused: paused });
  },

  setRaceControl: (flag) => {
    set({ raceControl: flag });
    const s = get();
    const player = s.cars.find((c) => c.isPlayer);
    emitRaceSnapshot({
      phase: s.phase,
      elapsedMs: s.elapsedMs,
      currentLap: player?.currentLap ?? 1,
      lapProgress: player?.lapProgress ?? 0,
      pitPhase: player?.pitPhase ?? null,
      pitHoldTraffic: !!player?.pitHoldTraffic,
      pitServiceDone: !!player?.pitServiceDone,
      isBoxing: !!player?.isBoxing,
      raceControl: flag,
      startLightsOut: s.startLightsOut,
    });
  },

  clearRaceControl: () => {
    get().setRaceControl("green");
  },

  startMissionRace: (opts) => {
    clearStartTimers();
    simElapsedMs = 0;
    get().stop();
    resetMissionSnapshotPrev();
    const { selectedPlayerColor, selectedPitBoxIndex } = get();
    let cars = createGrid(selectedPlayerColor, selectedPitBoxIndex);
    if (opts.startCompound) {
      cars = cars.map((car) =>
        car.isPlayer
          ? { ...car, currentCompound: opts.startCompound!, pendingCompound: null }
          : car,
      );
    }
    setLiveRaceCars(cars);
    const totalLaps = Math.max(1, Math.min(12, opts.totalLaps));
    const weatherOverride = opts.weatherOverride ?? get().weatherOverride;
    set({
      playMode: "mission",
      totalLaps,
      weatherOverride,
      rainIntensity: resolveRainIntensity(weatherOverride, get().weather),
      phase: "ready",
      elapsedMs: 0,
      cars,
      standings: buildStandings(cars, totalLaps, "ready"),
      winnerId: null,
      startLightCount: 0,
      startLightsGreen: false,
      startLightsOut: false,
      cameraMode: "overview",
      overviewFollow: true,
      overviewZoomLevel: OVERVIEW_ZOOM_DEFAULT,
      missionPaused: false,
      raceControl: "green",
      drsEnabled: false,
      drsActive: false,
      blueFlagActive: false,
      playerPenalties: [],
      ...syncPlayerMirrors(cars),
    });
    if (weatherOverride !== "auto") {
      get().setWeatherOverride(weatherOverride);
    }
    const player = cars.find((c) => c.isPlayer);
    emitRaceSnapshot({
      phase: "ready",
      elapsedMs: 0,
      currentLap: player?.currentLap ?? 1,
      lapProgress: player?.lapProgress ?? 0,
      pitPhase: null,
      pitHoldTraffic: false,
      pitServiceDone: false,
      isBoxing: false,
      raceControl: "green",
      startLightsOut: false,
    });
    if (opts.autoBegin) {
      startTimers.push(
        setTimeout(() => {
          if (get().playMode !== "mission") return;
          get().beginRace();
        }, 600),
      );
    }
  },

  forcePlayerWear: (wear) => {
    const cars = mutateCars((car) =>
      car.isPlayer
        ? {
            ...car,
            tireWear: Math.max(0, Math.min(100, wear)),
            pendingBox: true,
            pendingCompound: car.pendingCompound ?? car.currentCompound,
          }
        : car,
    );
    set({ cars, ...syncPlayerMirrors(cars) });
  },

  spawnPitTraffic: () => {
    const player = getLiveRaceCars().find((c) => c.isPlayer);
    if (!player?.isBoxing) return;
    const boxT = pitBoxTFor(player);
    let spawned = false;
    const cars = mutateCars((car) => {
      if (car.isPlayer || spawned) return car;
      spawned = true;
      return {
        ...car,
        isBoxing: true,
        pendingBox: false,
        pitPhase: "out" as PitPhase,
        pitProgress: Math.min(0.95, boxT + 0.04),
        pitHoldTraffic: false,
        pitServiceDone: true,
        pitStopElapsed: PIT_STOP_DURATION_S,
      };
    });
    set((state) => ({
      cars,
      ...syncPlayerMirrors(cars),
      standings: buildStandings(cars, state.totalLaps, state.phase),
    }));
  },

  setDrsEnabled: (on) => {
    set({ drsEnabled: on });
  },

  setBlueFlagActive: (on) => {
    set({ blueFlagActive: on });
    if (on) get().setRaceControl("blue");
    else if (get().raceControl === "blue") get().setRaceControl("green");
  },

  addPlayerPenalty: (kind) => {
    const ms = PENALTY_MS[kind] ?? 0;
    const cars = mutateCars((car) =>
      car.isPlayer ? { ...car, timePenaltyMs: car.timePenaltyMs + ms } : car,
    );
    set((state) => ({
      cars,
      playerPenalties: [...state.playerPenalties, kind],
      ...syncPlayerMirrors(cars),
    }));
  },

  releasePlayerForced: (unsafe) => {
    const cars = mutateCars((car) => {
      if (!car.isPlayer || !car.isBoxing || car.pitPhase !== "stopped" || !car.pitServiceDone) {
        return car;
      }
      return beginPitExit(car, unsafe);
    });
    set((state) => ({
      cars,
      ...syncPlayerMirrors(cars),
      standings: buildStandings(cars, state.totalLaps, state.phase),
    }));
  },

  abortStartSequence: () => {
    clearStartTimers();
    get().stop();
    set({
      phase: "ready",
      startLightCount: 0,
      startLightsGreen: false,
      startLightsOut: false,
      missionPaused: false,
    });
  },

  clearPlayMode: () => {
    set({ playMode: "free", totalLaps: TOTAL_LAPS });
  },

  loadWeather: async () => {
    const override = get().weatherOverride;
    const weather = await fetchSepangWeather();
    set({
      weather: override === "auto" ? weather : get().weather,
      rainIntensity: resolveRainIntensity(override, weather),
    });
    if (override === "auto") {
      set({ weather });
    }
  },
}));

/** Main-thread race step — called from RaceDirector each animation frame. */
export const stepRaceSimulation = (dt: number): void => {
  const state = useRaceStore.getState();
  if (!state.isRunning || state.phase !== "racing" || state.missionPaused) return;

  const elapsedMs = simElapsedMs + dt * 1000;
  const rain = resolveRainIntensity(state.weatherOverride, state.weather);
  const control = state.raceControl;
  const drsOn = state.drsEnabled && control === "green";

  const shared = getRaceSimShared();

  const writePhysicsTarget = (next: CarState, targetMps: number): void => {
    if (!shared) return;
    const index = CAR_INDEX_BY_ID.get(next.id);
    if (index === undefined) return;
    const base = vehicleBaseIndex(index);
    // Free path-rail: AI owns targetSpeed. Desk early-brake (260 m look) was
    // stomping AI every frame and locking cars slow on open track.
    const freeOnTrack =
      !next.isBoxing &&
      !next.finished &&
      next.status !== "retired" &&
      !next.garageReturn;
    if (!freeOnTrack) {
      shared.floats[base + VehicleField.targetSpeedMps] = Math.max(0, targetMps);
    }
    shared.floats[base + VehicleField.laneOffsetM] = next.laneTargetM;
    // AI envelope inputs (always fresh from desk).
    const lapT = ((next.lapProgress % 1) + 1) % 1;
    shared.floats[base + VehicleField.lapProgress] = lapT;
    // Push/soft must reach path-rail (AI owns targetSpeed, not desk mps).
    // Tight field spread — pack launches as one; strategy still separates later.
    const fieldPace = next.isPlayer ? 1.01 : 0.97 + (index % 5) * 0.008;
    let grip =
      strategyPaceScale(
        next.currentCompound,
        next.engineMode,
        rain,
        next.tireWear,
        next.damage,
        controlSpeedMult(control),
      ) *
      fieldPace *
      Math.max(0.28, Math.min(1, next.trafficPaceScale ?? 1));
    // Free cars: AI owns targetSpeed — fold pit-exit pace here so merge
    // does not floor it like a lights-out launch.
    if (next.pitExitBlend < 1) {
      grip *= pitExitRaceScale(next.pitExitBlend);
    }
    shared.floats[base + VehicleField.gripScale] = Math.max(
      0.45,
      Math.min(1.4, grip),
    );
    shared.floats[base + VehicleField.drsMult] =
      drsOn && next.drsEligible && isInDrsZone(lapT) ? DRS_SPEED_MULT : 1;
  };

  const syncCarFromPhysicsSAB = (
    next: CarState,
    views: NonNullable<typeof shared>,
  ): boolean => {
    const index = CAR_INDEX_BY_ID.get(next.id);
    if (index === undefined) return false;
    const base = vehicleBaseIndex(index);
    const floats = views.floats;
    const flags = vehicleFlagsDecode(floats[base + VehicleField.flags]);
    if (flags.kinematic) return false;
    const px = floats[base + VehicleField.posX];
    const pz = floats[base + VehicleField.posZ];
    const proj = projectWorldToTrack(px, pz);
    next.lapProgress = proj.lapProgress;
    // Keep traffic/grid lane intent — do not stomp with projected center snap.
    next.laneOffsetM = next.laneTargetM;
    next.speedMps = Math.max(0, floats[base + VehicleField.speed]);
    // Follow SAB brake exactly — old max-only ratchet left lamps stuck on.
    next.brakeIntensity = Math.max(0, floats[base + VehicleField.brake]);
    return true;
  };

  // Mutate the live array in place — no {...car} copies per frame.
  // Tire wear: desk-only writers in this loop (see TIRE_WEAR_AUTHORITY).
  if (TIRE_WEAR_AUTHORITY !== "desk") {
    throw new Error("tire wear authority must remain desk");
  }
  const cars = getLiveRaceCars();
  for (let ci = 0; ci < cars.length; ci += 1) {
    const car = cars[ci];
    if (car.finished) continue;

    if (!car.isPlayer && !car.pendingBox && !car.isBoxing && !car.garageReturn) {
      if (car.tireWear < 28 || needsWetStrategyBox(car, rain)) {
        car.pendingBox = true;
        car.pendingCompound = pickAiCompound(rain, car.tireWear);
      } else if (Math.random() < 0.00025 && car.sfCrossedOnce) {
        // Rare mode flips only after S/F — random push at lights-out split the pack.
        const modes: EngineMode[] = ["push", "standard", "save"];
        car.engineMode = modes[Math.floor(Math.random() * modes.length)];
      }
    }

    if (car.isBoxing) {
      car.currentLapTimeMs += dt * 1000;
      car.brakeIntensity = car.pitPhase === "in" ? 0.75 : 0;
      const boxT = pitBoxTFor(car);
      const phase = car.pitPhase ?? "in";
      // Desk-authoritative wear continues in pit (lighter on the jacks).
      const wearRate = baseWearRatePerSec(car.currentCompound, rain, car.engineMode);
      const pitWearScale = phase === "stopped" ? 0.25 : 0.55;
      const pitWearPerSec = wearRate * pitWearScale;
      car.tireWear = Math.max(0, car.tireWear - pitWearPerSec * dt);
      const carIndex = CAR_INDEX_BY_ID.get(car.id) ?? 0;
      noteRaceTelemetryDebug(car.id, {
        deskTargetMps: car.speedMps,
        syncedFromPhysics: false,
        extraWearDelta: 0,
        fieldPace: car.isPlayer ? 1.01 : 0.97 + (carIndex % 5) * 0.008,
        pendingBoxScrub: 1,
        wearRatePerSec: pitWearPerSec,
      });

      if (phase === "in") {
        car.pitPhase = "in";
        const rate = pitProgressRate("in", car.pitProgress, boxT);
        car.pitProgress = Math.min(boxT, car.pitProgress + rate * dt);
        car.speedMps = pitSpeedMps("in", car.pitProgress, boxT);
        if (car.pitProgress >= PIT_POSE_BLEND && (car.pitEntryPos || car.pitEntryTan)) {
          car.pitEntryPos = null;
          car.pitEntryTan = null;
        }
        if (car.pitProgress >= boxT - 1e-4) {
          car.pitProgress = boxT;
          if (car.garageReturn) {
            Object.assign(car, completeGarageReturn(car));
          } else {
            car.pitPhase = "stopped";
            car.pitStopElapsed = 0;
            car.pitHoldTraffic = false;
            car.pitServiceDone = false;
            car.speedMps = 0;
          }
        }
      } else if (phase === "stopped") {
        car.pitProgress = boxT;
        car.speedMps = 0;
        car.pitStopElapsed += dt;
        if (!car.pitServiceDone && car.pitStopElapsed >= PIT_STOP_DURATION_S) {
          Object.assign(car, applyServiceComplete(car));
          car.pitServiceDone = true;
        }
        if (car.pitServiceDone) {
          car.pitHoldTraffic = true;
        }
      } else if (phase === "out") {
        car.pitHoldTraffic = false;
        const rate = pitProgressRate("out", car.pitProgress, boxT);
        car.pitProgress = Math.min(1, car.pitProgress + rate * dt);
        car.speedMps = pitSpeedMps("out", car.pitProgress, boxT);
        if (car.pitProgress >= 1) {
          Object.assign(car, finishPitExit(car, elapsedMs, state.totalLaps, dt));
          if (car.garageReturn && !car.isBoxing) {
            beginPitEntry(car, 0);
          }
        }
      }
    } else if (car.status === "retired" && !car.garageReturn) {
      car.speedMps = 0;
      car.brakeIntensity = 0;
      car.finished = true;
      if (!car.finishTimeMs) {
        car.finishTimeMs = elapsedMs + car.unsafeReleasePenaltyMs + car.timePenaltyMs;
      }
      noteRaceTelemetryDebug(car.id, {
        deskTargetMps: 0,
        syncedFromPhysics: false,
        extraWearDelta: 0,
        fieldPace: 1,
        pendingBoxScrub: 1,
        wearRatePerSec: 0,
      });
    } else {
      if (car.garageReturn && car.status === "retired") {
        car.status = "racing";
        car.finished = false;
      }
      let targetMps = resolveTargetMps(car, rain, control, drsOn);
      if (car.pitExitBlend < 1) {
        car.pitExitBlend = Math.min(1, car.pitExitBlend + dt / PIT_EXIT_RACE_BLEND_S);
      }
      if (car.garageReturn && !car.isBoxing) {
        targetMps = Math.min(targetMps, PIT_ENTRY_HANDOFF_KMH / 3.6);
      }
      let pendingBoxScrub = 1;
      if (car.pendingBox && !car.isBoxing) {
        const toEntry = ((PIT_ENTRY_T - car.lapProgress) + 1) % 1;
        if (toEntry > 0 && toEntry < 0.07) {
          pendingBoxScrub = 0.32 + 0.68 * (toEntry / 0.07);
          targetMps *= pendingBoxScrub;
        }
      }

      // Wear / incident telemetry only — world pose comes from Rapier SAB.
      writePhysicsTarget(car, targetMps);

      const prevProgress = car.lapProgress;
      const syncedFromPhysics = shared ? syncCarFromPhysicsSAB(car, shared) : false;
      const carIndex = CAR_INDEX_BY_ID.get(car.id) ?? 0;
      const fieldPace = car.isPlayer ? 1.01 : 0.97 + (carIndex % 5) * 0.008;
      const wearBefore = car.tireWear;

      // Parametric integrate drives wear / incidents for kinematic cars only.
      // Free path-rail: SAB owns speed/brake. Desk targetMps (kappa / pit-entry
      // scrub) diverges from SAB → integrateSpeedInto invents lockup/spin
      // extraWear (~10%/s cliffs). Skip that path; base stint wear only.
      const wearRate = baseWearRatePerSec(car.currentCompound, rain, car.engineMode);
      if (syncedFromPhysics) {
        car.tireWear = Math.max(0, car.tireWear - wearRate * dt);
      } else {
        integrateSpeedInto(PHYS_SCRATCH, {
          speedMps: car.speedMps,
          status: car.status,
          damage: car.damage,
          incidentTimer: car.incidentTimer,
          incidentKind: car.incidentKind,
          tireWear: car.tireWear,
          compound: car.currentCompound,
          engineMode: car.engineMode,
          rain,
          targetMps,
          dt,
        });

        if (car.garageReturn) {
          // Chequered already taken — kinematic in-lap brake dump must not DNF the result.
          car.brakeIntensity = PHYS_SCRATCH.brakeIntensity;
          car.speedMps = PHYS_SCRATCH.speedMps;
          car.lapProgress += (PHYS_SCRATCH.speedMps * dt) / TRACK_LENGTH_M;
          if (car.status === "retired") car.status = "racing";
        } else {
          car.status = PHYS_SCRATCH.status;
          car.damage = PHYS_SCRATCH.damage;
          car.incidentTimer = PHYS_SCRATCH.incidentTimer;
          car.incidentKind = PHYS_SCRATCH.incidentKind;
          car.brakeIntensity = PHYS_SCRATCH.brakeIntensity;
          car.speedMps = PHYS_SCRATCH.speedMps;
          car.lapProgress += (PHYS_SCRATCH.speedMps * dt) / TRACK_LENGTH_M;
        }
        car.tireWear = Math.max(0, PHYS_SCRATCH.tireWear - wearRate * dt);
      }

      const extraWearDelta = Math.max(
        0,
        wearBefore - car.tireWear - wearRate * dt,
      );
      noteRaceTelemetryDebug(car.id, {
        deskTargetMps: targetMps,
        syncedFromPhysics,
        extraWearDelta,
        fieldPace,
        pendingBoxScrub,
        wearRatePerSec: wearRate,
      });

      car.currentLapTimeMs += dt * 1000;
      if (drsOn && crossedDetection(prevProgress, car.lapProgress)) {
        const ahead = nearestCarAhead(cars, car, prevProgress);
        if (!ahead) {
          // Open track / P1 — still arm DRS so main & back straights can trap 300+.
          car.drsEligible = true;
        } else {
          const gapM =
            (raceDistance(ahead) - (car.currentLap + prevProgress)) * TRACK_LENGTH_M;
          const refSpeed = Math.max(SEPANG_AVG_SPEED_MPS * 0.5, car.speedMps);
          car.drsEligible = gapM > 0 && gapM < refSpeed;
        }
      }
      if (prevProgress <= DRS_ZONE_END && car.lapProgress > DRS_ZONE_END) {
        car.drsEligible = false;
      }

      if (car.status === "retired" && !car.garageReturn) {
        car.finished = true;
        car.finishTimeMs = elapsedMs + car.unsafeReleasePenaltyMs + car.timePenaltyMs;
        car.speedMps = 0;
      }

      if (car.pendingBox && !car.isBoxing) {
        const prev = prevProgress;
        const crossedEntry =
          (prev < PIT_ENTRY_T && car.lapProgress >= PIT_ENTRY_T) ||
          (prev > car.lapProgress && (prev < PIT_ENTRY_T || car.lapProgress >= PIT_ENTRY_T));
        if (crossedEntry) {
          beginPitEntry(car, 0);
          car.pitLapPending = !car.garageReturn;
        }
      }

      const crossedSf =
        syncedFromPhysics
          ? prevProgress > 0.7 && car.lapProgress < 0.3
          : car.lapProgress >= 1;
      if (crossedSf) {
        if (!syncedFromPhysics) car.lapProgress -= 1;
        if (car.garageReturn) {
          car.currentLap = state.totalLaps;
        } else if (!car.sfCrossedOnce) {
          // Grid sits at t≈0.998 — first wrap is not a lap for anyone.
          car.sfCrossedOnce = true;
        } else {
          const genuineLap = car.currentLapTimeMs >= MIN_LAP_MS;
          if (genuineLap) {
            car.lastLapTimeMs = car.currentLapTimeMs;
            car.currentLapTimeMs = 0;
            car.currentLap += 1;

            if (car.pendingBox && !car.isBoxing) {
              beginPitEntry(car, 0.02);
              car.lapProgress = PIT_EXIT_T;
              car.pitLapPending = false;
            }

            if (car.currentLap > state.totalLaps) {
              applyGarageReturn(car, elapsedMs, dt, state.totalLaps);
            }
          }
        }
      }
    }
  }

  for (let ci = 0; ci < cars.length; ci += 1) {
    const car = cars[ci];
    if (car.garageReturn) continue;
    if (!car.isBoxing || car.pitPhase !== "stopped" || !car.pitServiceDone) continue;
    const blocked = isPitReleaseBlocked(cars, car);
    if (car.isPlayer && state.playMode === "mission") {
      car.pitHoldTraffic = blocked;
      continue;
    }
    if (!blocked) {
      Object.assign(car, beginPitExit(car, false));
      continue;
    }
    if (!car.isPlayer && Math.random() < 0.08 * dt) {
      Object.assign(car, beginPitExit(car, true));
      continue;
    }
    car.pitHoldTraffic = true;
  }

  // Path-rail has no car-car bodies — gap/lane traffic only (no fake collision spins).
  resolveTraffic(cars, dt, true, elapsedMs);
  // Traffic mutates lanes + trafficPaceScale after the per-car write — push to SAB now.
  for (let ci = 0; ci < cars.length; ci += 1) {
    const car = cars[ci];
    if (car.finished || car.status === "retired") continue;
    writePhysicsTarget(car, car.speedMps);
  }

  recordRaceTelemetryCsv(elapsedMs, cars, {
    phase: "racing",
    raceControl: control,
    rainIntensity: rain,
    totalLaps: state.totalLaps,
    drsEnabled: state.drsEnabled,
  });

  simElapsedMs = elapsedMs;
  // garageReturn counts — otherwise podium waits on a cooldown lap / pit crawl.
  const allDone = cars.every(
    (c) =>
      c.finished ||
      c.garageReturn ||
      (c.status === "retired" && !c.garageReturn),
  );
  const nextPhase = allDone ? "finished" : "racing";
  if (allDone) {
    stopRaceTelemetryCsv();
  }

  uiSyncAccum += dt;
  const syncUi = allDone || uiSyncAccum >= UI_SYNC_INTERVAL_S;
  if (syncUi) uiSyncAccum = 0;

  if (syncUi) {
    const uiCars = cars.map((c) => ({ ...c }));
    const standings = buildStandings(uiCars, state.totalLaps, nextPhase);
    // Arm winner as soon as anyone takes the flag — podium can show while others finish.
    const winnerId =
      state.winnerId ?? standings.find((row) => row.finished)?.id ?? null;
    const playerCar = uiCars.find((c) => c.isPlayer);
    const drsActive =
      drsOn && !!playerCar && playerCar.drsEligible && isInDrsZone(playerCar.lapProgress);

    useRaceStore.setState({
      cars: uiCars,
      elapsedMs,
      standings,
      rainIntensity: rain,
      winnerId,
      phase: nextPhase,
      isRunning: allDone ? false : state.isRunning,
      drsActive,
      ...syncPlayerMirrors(uiCars, rain),
    });

    emitRaceSnapshot({
      phase: nextPhase,
      elapsedMs,
      currentLap: playerCar?.currentLap ?? 1,
      lapProgress: playerCar?.lapProgress ?? 0,
      pitPhase: playerCar?.pitPhase ?? null,
      pitHoldTraffic: !!playerCar?.pitHoldTraffic,
      pitServiceDone: !!playerCar?.pitServiceDone,
      isBoxing: !!playerCar?.isBoxing,
      raceControl: control,
      startLightsOut: state.startLightsOut,
    });
  }
};
