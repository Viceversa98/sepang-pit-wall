import { TRACK_LENGTH_M } from "@/lib/trackCurve";
import { gameSpeedToDisplay, speedUnitLabel } from "@/lib/speedUnits";
import {
  useRaceStore,
  type EngineMode,
  type PitPhase,
  type StandingsRow,
  type TyreCompound,
} from "@/stores/raceStore";

/** Top-N timing tower — always includes the player row even when outside the cut. */
export const buildTimingTower = (
  standings: StandingsRow[],
  maxRows = 6,
): StandingsRow[] => {
  if (standings.length <= maxRows) return standings;
  const player = standings.find((r) => r.isPlayer);
  const top = standings.slice(0, maxRows);
  if (!player || top.some((r) => r.id === player.id)) return top;
  return [...standings.slice(0, maxRows - 1), player];
};

/** Fast-changing strategy desk fields — poll instead of store subscribe. */
export type PolledStrategyState = {
  engineMode: EngineMode;
  currentCompound: TyreCompound;
  isBoxing: boolean;
  pendingBox: boolean;
  pitPhase: PitPhase | null;
  pitHoldTraffic: boolean;
  pitServiceDone: boolean;
  tireWear: number;
  rainIntensity: number;
};

export const defaultStrategy = (): PolledStrategyState => ({
  engineMode: "standard",
  currentCompound: "medium",
  isBoxing: false,
  pendingBox: false,
  pitPhase: null,
  pitHoldTraffic: false,
  pitServiceDone: false,
  tireWear: 100,
  rainIntensity: 0.2,
});

export const syncPolledStrategy = (): PolledStrategyState => {
  const s = useRaceStore.getState();
  return {
    engineMode: s.engineMode,
    currentCompound: s.currentCompound,
    isBoxing: s.isBoxing,
    pendingBox: s.pendingBox,
    pitPhase: s.pitPhase,
    pitHoldTraffic: s.pitHoldTraffic,
    pitServiceDone: s.pitServiceDone,
    tireWear: s.tireWear,
    rainIntensity: s.rainIntensity,
  };
};

/** Timing tower + telemetry strip — poll at ~10 Hz. */
export type PolledTimingState = {
  standings: StandingsRow[];
  tireWear: number;
  currentCompound: TyreCompound;
  currentLapTimeMs: number;
  lastLapTimeMs: number;
  currentLap: number;
  /** Display speed in SPEED_DISPLAY_UNIT (name kept for callers). */
  speedKmh: number;
  speedUnit: string;
  /** Metres completed this lap (0 → TRACK_LENGTH_M). */
  lapMetres: number;
  /** Full race lap length (m) for HUD context. */
  trackLengthM: number;
  gripPct: number;
  damage: number;
  rainIntensity: number;
  pitPhase: PitPhase | null;
  isBoxing: boolean;
  pendingBox: boolean;
  pitHoldTraffic: boolean;
  unsafeReleasePenaltyMs: number;
};

export const defaultTiming = (): PolledTimingState => ({
  standings: [],
  tireWear: 100,
  currentCompound: "medium",
  currentLapTimeMs: 0,
  lastLapTimeMs: 0,
  currentLap: 1,
  speedKmh: 0,
  speedUnit: speedUnitLabel(),
  lapMetres: 0,
  trackLengthM: TRACK_LENGTH_M,
  gripPct: 100,
  damage: 0,
  rainIntensity: 0.2,
  pitPhase: null,
  isBoxing: false,
  pendingBox: false,
  pitHoldTraffic: false,
  unsafeReleasePenaltyMs: 0,
});

export const syncPolledTiming = (): PolledTimingState => {
  const s = useRaceStore.getState();
  return {
    standings: s.standings,
    tireWear: s.tireWear,
    currentCompound: s.currentCompound,
    currentLapTimeMs: s.currentLapTimeMs,
    lastLapTimeMs: s.lastLapTimeMs,
    currentLap: s.currentLap,
    speedKmh: Math.round(gameSpeedToDisplay(s.speedMps ?? 0)),
    speedUnit: speedUnitLabel(),
    lapMetres: Math.round((((s.lapProgress % 1) + 1) % 1) * TRACK_LENGTH_M),
    trackLengthM: TRACK_LENGTH_M,
    gripPct: Math.round((s.grip ?? 1) * 100),
    damage: Math.round(s.damage ?? 0),
    rainIntensity: s.rainIntensity,
    pitPhase: s.pitPhase,
    isBoxing: s.isBoxing,
    pendingBox: s.pendingBox,
    pitHoldTraffic: s.pitHoldTraffic,
    unsafeReleasePenaltyMs: s.unsafeReleasePenaltyMs,
  };
};

/** In-viewport HUD position / incidents — poll at ~8 Hz. */
export type PolledHudState = {
  pos: number;
  lap: number;
  isBoxing: boolean;
  pendingBox: boolean;
  gripPct: number;
  incidentLabel: string | null;
  pitPhase: PitPhase | null;
  pitHoldTraffic: boolean;
};

export const defaultHud = (): PolledHudState => ({
  pos: 1,
  lap: 1,
  isBoxing: false,
  pendingBox: false,
  gripPct: 100,
  incidentLabel: null,
  pitPhase: null,
  pitHoldTraffic: false,
});

export const syncPolledHud = (): PolledHudState => {
  const s = useRaceStore.getState();
  const you = s.standings.find((r) => r.isPlayer);
  const player = s.cars.find((c) => c.isPlayer);
  const kind = player?.incidentKind ?? s.incidentKind;
  const status = player?.status ?? s.carStatus;
  let incidentLabel: string | null = null;
  if (status === "retired" && !player?.garageReturn) incidentLabel = "RETIRED";
  else if (kind === "contact") incidentLabel = "CONTACT";
  else if (kind === "spin" || status === "spun") incidentLabel = "SPIN";
  else if (kind === "lockup" || status === "sliding") incidentLabel = "LOCKUP";

  return {
    pos: you?.position ?? 1,
    lap: Math.min(s.currentLap, s.totalLaps),
    isBoxing: !!player?.isBoxing,
    pendingBox: !!player?.pendingBox && !player?.isBoxing,
    gripPct: Math.round((s.grip ?? 1) * 100),
    incidentLabel,
    pitPhase: s.pitPhase,
    pitHoldTraffic: s.pitHoldTraffic,
  };
};
