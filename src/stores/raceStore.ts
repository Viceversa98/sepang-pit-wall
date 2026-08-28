import { createStore } from "@/stores/createStore";
import {
  fetchSepangWeather,
  resolveRainIntensity,
  type SepangWeather,
  type WeatherOverride,
} from "@/lib/weather";
import { FIA, PIT_ENTRY_T, PIT_EXIT_T, TRACK_LENGTH_M } from "@/lib/trackCurve";
import { gridLaneOffsetM, resolveTraffic, standingsDistance } from "@/lib/raceTraffic";
import {
  availableGrip,
  baseWearRatePerSec,
  integrateSpeed,
  SEPANG_AVG_SPEED_MPS,
  targetSpeedMps,
  type CarPhysicsStatus,
  type IncidentKind,
} from "@/lib/racePhysics";
import {
  applyServiceComplete,
  beginPitExit,
  isPitReleaseBlocked,
  pitExitRaceScale,
  pitProgressRate,
  PIT_ENTRY_HANDOFF_KMH,
  PIT_EXIT_FLARE_KMH,
  PIT_EXIT_RACE_BLEND_S,
  PIT_LANE_LIMIT_KMH,
  PIT_STOP_DURATION_S,
  pitBoxTFor,
  type PitPhase,
} from "@/lib/pitStop";
import { emitRaceSnapshot, resetMissionSnapshotPrev } from "@/lib/academy/missionBridge";
import { setLiveRaceCars } from "@/lib/raceLiveCars";
import { getRaceSimShared } from "@/sim/raceSimContext";
import {
  vehicleBaseIndex,
  VehicleField,
} from "@/shared/sharedState";
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
  tireWear: number;
  compound: TyreCompound;
  finished: boolean;
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
  resetToLanding: () => void;
  setPlayerLivery: (color: string) => void;
  setPlayerPitBox: (index: number) => void;
  setCompound: (compound: TyreCompound) => void;
  setEngineMode: (mode: EngineMode) => void;
  requestBoxNextLap: () => void;
  /** Player: leave box after service (unsafe if traffic ahead). */
  releaseFromBox: () => void;
  setWeatherOverride: (override: WeatherOverride) => void;
  setCameraMode: (mode: CameraMode) => void;
  /** User dragged overview — stop tracking YOU until Overview is clicked again. */
  unlockOverviewFollow: () => void;
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

const TOTAL_LAPS = 6;
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
  | "blockId"
  | "pitLapPending"
  | "pitExitBlend"
  | "timePenaltyMs"
  | "drsEligible"
  | "speedMps"
  | "status"
  | "damage"
  | "incidentTimer"
  | "incidentKind"
  | "brakeIntensity"
>[] = [
  { id: PLAYER_ID, name: "YOU", color: "#f43f5e", isPlayer: true, currentCompound: "medium", engineMode: "standard" },
  { id: "r1", name: "KD-01", color: "#38bdf8", isPlayer: false, currentCompound: "soft", engineMode: "push" },
  { id: "r2", name: "KD-07", color: "#a78bfa", isPlayer: false, currentCompound: "medium", engineMode: "standard" },
  { id: "r3", name: "MY-22", color: "#34d399", isPlayer: false, currentCompound: "hard", engineMode: "save" },
  { id: "r4", name: "SG-44", color: "#fbbf24", isPlayer: false, currentCompound: "soft", engineMode: "push" },
  { id: "r5", name: "TH-11", color: "#fb923c", isPlayer: false, currentCompound: "medium", engineMode: "standard" },
  { id: "r6", name: "ID-18", color: "#e879f9", isPlayer: false, currentCompound: "hard", engineMode: "standard" },
  { id: "r7", name: "VN-03", color: "#2dd4bf", isPlayer: false, currentCompound: "medium", engineMode: "save" },
  { id: "r8", name: "PH-55", color: "#94a3b8", isPlayer: false, currentCompound: "soft", engineMode: "push" },
  { id: "r9", name: "BN-09", color: "#c084fc", isPlayer: false, currentCompound: "medium", engineMode: "standard" },
];

const createGrid = (playerColor: string, playerPitBox: number): CarState[] => {
  const pitBox = Math.max(0, Math.min(PIT_STALL_COUNT - 1, Math.floor(playerPitBox)));
  const used = new Set<number>([pitBox]);
  let cursor = 0;
  const nextFreePit = (): number => {
    while (used.has(cursor)) cursor += 1;
    const i = cursor;
    used.add(i);
    cursor += 1;
    return i;
  };

  return GRID.map((car, index) => {
    const behindM = FIA.gridFrontGapM + index * FIA.gridRowSpacingM;
    const lapProgress = ((1 - behindM / TRACK_LENGTH_M) % 1 + 1) % 1;
    const lane = gridLaneOffsetM(index);
    const pitBoxIndex = car.isPlayer ? pitBox : nextFreePit();
    return {
      ...car,
      color: car.isPlayer ? playerColor : car.color,
      lapProgress,
      currentLap: 1,
      tireWear: 100 - index * 0.5,
      isBoxing: false,
      pendingBox: false,
      pendingCompound: null,
      pitProgress: 0,
      pitPhase: null,
      pitStopElapsed: 0,
      pitBoxIndex,
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
      blockId: null,
      pitLapPending: false,
      pitExitBlend: 1,
      timePenaltyMs: 0,
      drsEligible: false,
      speedMps: 0,
      status: "racing",
      damage: 0,
      incidentTimer: 0,
      incidentKind: null,
      brakeIntensity: 0,
    };
  });
};

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

/** Ignore S/F wraps before this — grid sits at t≈0.998 so lights-out would ghost-lap. */
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

const buildStandings = (cars: CarState[], totalLaps: number): StandingsRow[] => {
  const sorted = [...cars].sort((a, b) => {
    const aDone = raceComplete(a);
    const bDone = raceComplete(b);
    if (aDone && bDone) return a.finishTimeMs - b.finishTimeMs;
    if (aDone) return -1;
    if (bDone) return 1;
    return standingsDistance(b) - standingsDistance(a);
  });

  const leader = sorted[0];
  return sorted.map((car, i) => {
    let gapLabel = "LEADER";
    if (i > 0) {
      if (raceComplete(car) && raceComplete(leader)) {
        const gap = ((car.finishTimeMs - leader.finishTimeMs) / 1000).toFixed(2);
        gapLabel = `+${gap}s`;
      } else {
        const gapM = (standingsDistance(leader) - standingsDistance(car)) * TRACK_LENGTH_M;
        if (gapM > TRACK_LENGTH_M * 0.95) {
          gapLabel = `+${Math.ceil(gapM / TRACK_LENGTH_M)} LAP`;
        } else {
          gapLabel = `+${(gapM / SEPANG_AVG_SPEED_MPS).toFixed(1)}s`;
        }
      }
    }
    return {
      id: car.id,
      name: car.name,
      color: car.color,
      isPlayer: car.isPlayer,
      position: i + 1,
      currentLap: Math.min(car.currentLap, totalLaps),
      lapProgress: car.lapProgress,
      gapLabel,
      tireWear: car.tireWear,
      compound: car.currentCompound,
      finished: raceComplete(car),
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
    isBoxing: player.isBoxing || player.pendingBox,
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
});

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
});

const finishPitExit = (car: CarState, elapsedMs: number, totalLaps: number, dt: number): CarState => {
  let next = clearPitFlags(car);
  next.pitExitBlend = 0;
  next.lapProgress = PIT_EXIT_T;
  next.speedMps = Math.min(next.speedMps, PIT_EXIT_FLARE_KMH / 3.6);
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

const buildGridFromSelection = (
  color: string = DEFAULT_PLAYER_COLOR,
  pitBox: number = DEFAULT_PIT_BOX,
): CarState[] => createGrid(color, pitBox);

const initialCars = buildGridFromSelection();
setLiveRaceCars(initialCars);

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
  standings: buildStandings(initialCars, TOTAL_LAPS),
  winnerId: null,
  isRunning: false,
  startLightCount: 0,
  startLightsGreen: false,
  startLightsOut: false,
  cameraMode: "overview",
  overviewFollow: true,
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
    clearStartTimers();
    simElapsedMs = 0;
    uiSyncAccum = 0;
    const { selectedPlayerColor, selectedPitBoxIndex, totalLaps } = get();
    const cars = createGrid(selectedPlayerColor, selectedPitBoxIndex);
    setLiveRaceCars(cars);
    get().stop();
    set({
      phase: "starting",
      elapsedMs: 0,
      cars,
      standings: buildStandings(cars, totalLaps),
      winnerId: null,
      startLightCount: 0,
      startLightsGreen: false,
      startLightsOut: false,
      raceControl: "green",
      missionPaused: false,
      drsActive: false,
      blueFlagActive: false,
      cameraMode: "overview",
      overviewFollow: true,
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
    const { selectedPlayerColor, selectedPitBoxIndex, totalLaps } = get();
    const cars = createGrid(selectedPlayerColor, selectedPitBoxIndex);
    setLiveRaceCars(cars);
    set({
      phase: "ready",
      playMode: get().playMode === "mission" ? "mission" : "free",
      elapsedMs: 0,
      cars,
      standings: buildStandings(cars, totalLaps),
      winnerId: null,
      startLightCount: 0,
      startLightsGreen: false,
      startLightsOut: false,
      cameraMode: "overview",
      overviewFollow: true,
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
    set({ selectedPlayerColor: color });
  },

  setPlayerPitBox: (index) => {
    const pit = Math.max(0, Math.min(PIT_STALL_COUNT - 1, Math.floor(index)));
    set({ selectedPitBoxIndex: pit });
  },

  goRacing: () => {
    clearStartTimers();
    if (get().phase !== "starting") return;
    set({
      phase: "racing",
      startLightCount: 0,
      startLightsGreen: false,
      startLightsOut: true,
      raceControl: "green",
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

  resetToLanding: () => {
    clearStartTimers();
    simElapsedMs = 0;
    get().stop();
    resetMissionSnapshotPrev();
    const { selectedPlayerColor, selectedPitBoxIndex } = get();
    const cars = createGrid(selectedPlayerColor, selectedPitBoxIndex);
    setLiveRaceCars(cars);
    set({
      phase: "landing",
      playMode: "free",
      totalLaps: TOTAL_LAPS,
      elapsedMs: 0,
      cars,
      standings: buildStandings(cars, TOTAL_LAPS),
      winnerId: null,
      startLightCount: 0,
      startLightsGreen: false,
      startLightsOut: false,
      cameraMode: "overview",
      overviewFollow: true,
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
    set((state) => {
      const cars = state.cars.map((car) => {
        if (!car.isPlayer) return car;
        if (car.pendingBox || car.isBoxing) {
          return { ...car, pendingCompound: compound };
        }
        // Stint compound change requires a box
        return { ...car, pendingCompound: compound, pendingBox: true };
      });
      return { cars, ...syncPlayerMirrors(cars), standings: buildStandings(cars, state.totalLaps) };
    });
  },

  setEngineMode: (mode) => {
    set((state) => {
      const cars = state.cars.map((car) => (car.isPlayer ? { ...car, engineMode: mode } : car));
      return { cars, ...syncPlayerMirrors(cars) };
    });
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

  setAudioMuted: (muted) => {
    set({ audioMuted: muted });
  },

  requestBoxNextLap: () => {
    set((state) => {
      const cars = state.cars.map((car) => {
        if (!car.isPlayer) return car;
        return {
          ...car,
          pendingBox: true,
          pendingCompound: car.pendingCompound ?? car.currentCompound,
        };
      });
      return { cars, ...syncPlayerMirrors(cars) };
    });
  },

  releaseFromBox: () => {
    set((state) => {
      const cars = state.cars.map((car) => {
        if (!car.isPlayer || !car.isBoxing || car.pitPhase !== "stopped" || !car.pitServiceDone) {
          return car;
        }
        const unsafe = isPitReleaseBlocked(state.cars, car);
        return beginPitExit(car, unsafe);
      });
      return { cars, ...syncPlayerMirrors(cars), standings: buildStandings(cars, state.totalLaps) };
    });
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
      standings: buildStandings(cars, totalLaps),
      winnerId: null,
      startLightCount: 0,
      startLightsGreen: false,
      startLightsOut: false,
      cameraMode: "overview",
      overviewFollow: true,
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
    set((state) => {
      const cars = state.cars.map((car) =>
        car.isPlayer
          ? {
              ...car,
              tireWear: Math.max(0, Math.min(100, wear)),
              pendingBox: true,
              pendingCompound: car.pendingCompound ?? car.currentCompound,
            }
          : car,
      );
      return { cars, ...syncPlayerMirrors(cars) };
    });
  },

  spawnPitTraffic: () => {
    set((state) => {
      const player = state.cars.find((c) => c.isPlayer);
      if (!player?.isBoxing) return state;
      const boxT = pitBoxTFor(player);
      let spawned = false;
      const withOne = state.cars.map((car) => {
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
      return {
        cars: withOne,
        ...syncPlayerMirrors(withOne),
        standings: buildStandings(withOne, state.totalLaps),
      };
    });
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
    set((state) => {
      const cars = state.cars.map((car) =>
        car.isPlayer ? { ...car, timePenaltyMs: car.timePenaltyMs + ms } : car,
      );
      const playerPenalties = [...state.playerPenalties, kind];
      return { cars, playerPenalties, ...syncPlayerMirrors(cars) };
    });
  },

  releasePlayerForced: (unsafe) => {
    set((state) => {
      const cars = state.cars.map((car) => {
        if (!car.isPlayer || !car.isBoxing || car.pitPhase !== "stopped" || !car.pitServiceDone) {
          return car;
        }
        return beginPitExit(car, unsafe);
      });
      return { cars, ...syncPlayerMirrors(cars), standings: buildStandings(cars, state.totalLaps) };
    });
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
  const carIndexById = new Map<string, number>(FIELD_META.map((m, i) => [m.id, i]));

  const writePhysicsTarget = (next: CarState, targetMps: number): void => {
    if (!shared) return;
    const index = carIndexById.get(next.id);
    if (index === undefined) return;
    const base = vehicleBaseIndex(index);
    shared.floats[base + VehicleField.targetSpeedMps] = Math.max(0, targetMps);
  };

  const integrated = state.cars.map((car) => {
    if (car.finished) return car;

    const next = { ...car };

    if (!next.isPlayer && !next.pendingBox && !next.isBoxing && !next.garageReturn) {
      if (next.tireWear < 28 || needsWetStrategyBox(next, rain)) {
        next.pendingBox = true;
        next.pendingCompound = pickAiCompound(rain, next.tireWear);
      } else if (Math.random() < 0.0008) {
        const modes: EngineMode[] = ["push", "standard", "save"];
        next.engineMode = modes[Math.floor(Math.random() * modes.length)];
      }
    }

    if (next.isBoxing) {
      next.currentLapTimeMs += dt * 1000;
      next.brakeIntensity = next.pitPhase === "in" ? 0.75 : 0;
      const boxT = pitBoxTFor(next);
      const phase = next.pitPhase ?? "in";

      if (phase === "in") {
        next.pitPhase = "in";
        const rate = pitProgressRate("in", next.pitProgress, boxT);
        next.pitProgress = Math.min(boxT, next.pitProgress + rate * dt);
        if (next.pitProgress >= boxT - 1e-4) {
          next.pitProgress = boxT;
          if (next.garageReturn) {
            Object.assign(next, completeGarageReturn(next));
          } else {
            next.pitPhase = "stopped";
            next.pitStopElapsed = 0;
            next.pitHoldTraffic = false;
            next.pitServiceDone = false;
          }
        }
      } else if (phase === "stopped") {
        next.pitProgress = boxT;
        next.pitStopElapsed += dt;
        if (!next.pitServiceDone && next.pitStopElapsed >= PIT_STOP_DURATION_S) {
          Object.assign(next, applyServiceComplete(next));
          next.pitServiceDone = true;
        }
        if (next.pitServiceDone) {
          next.pitHoldTraffic = true;
        }
      } else if (phase === "out") {
        next.pitHoldTraffic = false;
        const rate = pitProgressRate("out", next.pitProgress, boxT);
        next.pitProgress = Math.min(1, next.pitProgress + rate * dt);
        if (next.pitProgress >= 1) {
          Object.assign(next, finishPitExit(next, elapsedMs, state.totalLaps, dt));
        }
      }
    } else if (next.status === "retired") {
      next.speedMps = 0;
      next.brakeIntensity = 0;
      next.finished = true;
      if (!next.finishTimeMs) {
        next.finishTimeMs =
          elapsedMs + next.unsafeReleasePenaltyMs + next.timePenaltyMs;
      }
    } else {
      let targetMps = resolveTargetMps(next, rain, control, drsOn);
      if (next.pitExitBlend < 1) {
        next.pitExitBlend = Math.min(1, next.pitExitBlend + dt / PIT_EXIT_RACE_BLEND_S);
      }
      if (next.garageReturn && !next.isBoxing) {
        targetMps = Math.min(targetMps, PIT_ENTRY_HANDOFF_KMH / 3.6);
      }
      if (next.pendingBox && !next.isBoxing) {
        const toEntry = ((PIT_ENTRY_T - next.lapProgress) + 1) % 1;
        if (toEntry > 0 && toEntry < 0.07) {
          targetMps *= 0.32 + 0.68 * (toEntry / 0.07);
        }
      }

      const phys = integrateSpeed({
        speedMps: next.speedMps,
        status: next.status,
        damage: next.damage,
        incidentTimer: next.incidentTimer,
        incidentKind: next.incidentKind,
        tireWear: next.tireWear,
        compound: next.currentCompound,
        engineMode: next.engineMode,
        rain,
        targetMps,
        dt,
      });
      next.status = phys.status;
      next.damage = phys.damage;
      next.incidentTimer = phys.incidentTimer;
      next.incidentKind = phys.incidentKind;
      next.brakeIntensity = phys.brakeIntensity;
      next.speedMps = phys.speedMps;
      next.lapProgress += (phys.speedMps * dt) / TRACK_LENGTH_M;
      writePhysicsTarget(next, phys.speedMps);

      const prevProgress = next.lapProgress - (phys.speedMps * dt) / TRACK_LENGTH_M;
      next.currentLapTimeMs += dt * 1000;
      if (drsOn && crossedDetection(prevProgress, next.lapProgress)) {
        const sorted = [...state.cars].sort((a, b) => {
          if (b.currentLap !== a.currentLap) return b.currentLap - a.currentLap;
          return b.lapProgress - a.lapProgress;
        });
        const idx = sorted.findIndex((c) => c.id === next.id);
        const ahead = idx > 0 ? sorted[idx - 1] : null;
        if (!ahead) {
          next.drsEligible = false;
        } else {
          const leaderDist = (ahead.currentLap - 1 + ahead.lapProgress) * 1000;
          const carDist = (next.currentLap - 1 + prevProgress) * 1000;
          const gapM = ((leaderDist - carDist) / 1000) * TRACK_LENGTH_M;
          const refSpeed = Math.max(SEPANG_AVG_SPEED_MPS * 0.5, next.speedMps);
          next.drsEligible = gapM > 0 && gapM < refSpeed;
        }
      }
      if (prevProgress <= DRS_ZONE_END && next.lapProgress > DRS_ZONE_END) {
        next.drsEligible = false;
      }
      const wearRate = baseWearRatePerSec(next.currentCompound, rain, next.engineMode);
      next.tireWear = Math.max(0, phys.tireWear - wearRate * dt);

      if (next.status === "retired") {
        next.finished = true;
        next.finishTimeMs =
          elapsedMs + next.unsafeReleasePenaltyMs + next.timePenaltyMs;
        next.speedMps = 0;
      }

      if (next.pendingBox && !next.isBoxing) {
        const prev = car.lapProgress;
        const crossedEntry =
          (prev < PIT_ENTRY_T && next.lapProgress >= PIT_ENTRY_T) ||
          (prev > next.lapProgress && (prev < PIT_ENTRY_T || next.lapProgress >= PIT_ENTRY_T));
        if (crossedEntry) {
          next.isBoxing = true;
          next.pitPhase = "in";
          next.pitProgress = 0;
          next.pitStopElapsed = 0;
          next.pitHoldTraffic = false;
          next.pitServiceDone = false;
          next.lapProgress = PIT_ENTRY_T;
          next.pitLapPending = !next.garageReturn;
        }
      }

      if (next.lapProgress >= 1) {
        next.lapProgress -= 1;
        if (next.garageReturn) {
          next.currentLap = state.totalLaps;
        } else {
          const genuineLap = next.currentLapTimeMs >= MIN_LAP_MS;
          if (genuineLap) {
            next.lastLapTimeMs = next.currentLapTimeMs;
            next.currentLapTimeMs = 0;
            next.currentLap += 1;

            if (next.pendingBox && !next.isBoxing) {
              next.isBoxing = true;
              next.pitPhase = "in";
              next.pitProgress = 0.02;
              next.pitStopElapsed = 0;
              next.pitHoldTraffic = false;
              next.pitServiceDone = false;
              next.lapProgress = PIT_EXIT_T;
              next.pitLapPending = false;
            }

            if (next.currentLap > state.totalLaps) {
              Object.assign(next, beginGarageReturn(next, elapsedMs, dt, state.totalLaps));
            }
          }
        }
      }
    }

    return next;
  });

  const afterRelease = integrated.map((car) => {
    if (car.garageReturn) return car;
    if (!car.isBoxing || car.pitPhase !== "stopped" || !car.pitServiceDone) return car;
    const blocked = isPitReleaseBlocked(integrated, car);
    if (car.isPlayer && state.playMode === "mission") {
      return { ...car, pitHoldTraffic: blocked || true };
    }
    if (!blocked) {
      return beginPitExit(car, false);
    }
    if (!car.isPlayer && Math.random() < 0.08 * dt) {
      return beginPitExit(car, true);
    }
    return { ...car, pitHoldTraffic: true };
  });

  const cars = resolveTraffic(afterRelease, dt, elapsedMs < 4500);
  setLiveRaceCars(cars);

  simElapsedMs = elapsedMs;
  const allDone = cars.every((c) => c.finished);
  const nextPhase = allDone ? "finished" : "racing";

  uiSyncAccum += dt;
  const syncUi = allDone || uiSyncAccum >= UI_SYNC_INTERVAL_S;
  if (syncUi) uiSyncAccum = 0;

  if (syncUi) {
    const standings = buildStandings(cars, state.totalLaps);
    const winnerId = allDone ? standings[0]?.id ?? null : state.winnerId;
    const playerCar = cars.find((c) => c.isPlayer);
    const drsActive =
      drsOn && !!playerCar && playerCar.drsEligible && isInDrsZone(playerCar.lapProgress);

    useRaceStore.setState({
      cars,
      elapsedMs,
      standings,
      rainIntensity: rain,
      winnerId,
      phase: nextPhase,
      isRunning: allDone ? false : state.isRunning,
      drsActive,
      ...syncPlayerMirrors(cars, rain),
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
