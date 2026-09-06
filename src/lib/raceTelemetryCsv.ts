/**
 * Race analytics CSV recorder — one row per car per sample (hold-forward).
 * Covers path-rail traffic, pit, grip/DRS, lanes, gaps, wear, and desk↔SAB
 * authority fields for debugging top-speed / phantom-wear / traffic.
 *
 * Native sim tick is ~16.7 ms (60 Hz). Between ticks we hold-forward so the CSV
 * has an `elapsed_ms` ladder at TELEMETRY_SAMPLE_MS. Cap protects browser RAM.
 */
import {
  availableGrip,
  baseWearRatePerSec,
} from "@/lib/racePhysics";
import { nearestCarAhead, alongGapM, raceDistanceAchievedM } from "@/lib/raceTraffic";
import {
  sepangBrakingEnvelopeMps,
  SEPANG_RACE_STRAIGHT_MPS,
} from "@/lib/sepangSpeedProfile";
import { PIT_ENTRY_T } from "@/lib/trackCurve";
import { getRaceSimShared } from "@/sim/raceSimContext";
import {
  vehicleBaseIndex,
  vehicleFlagsDecode,
  VehicleField,
} from "@/shared/sharedState";
import type { CarState, RacePhase } from "@/stores/raceStore";

/** Emit a CSV row every N race-ms (hold last sample between emits). */
export const TELEMETRY_SAMPLE_MS = 10;

/** Hard stop so a long race cannot OOM the tab. */
export const TELEMETRY_MAX_ROWS = 2_000_000;

export type TelemetryMeta = {
  phase: RacePhase;
  raceControl: string;
  rainIntensity: number;
  totalLaps: number;
  drsEnabled: boolean;
};

/** Per-car debug sample filled by the desk step each frame (authority truth). */
export type RaceTelemetryDebugSample = {
  deskTargetMps: number;
  syncedFromPhysics: boolean;
  extraWearDelta: number;
  fieldPace: number;
  pendingBoxScrub: number;
  wearRatePerSec: number;
};

const HEADER = [
  "elapsed_ms",
  "sample_ms",
  "phase",
  "race_control",
  "rain",
  "total_laps",
  "car_id",
  "name",
  "is_player",
  "grid_slot",
  "lap",
  "lap_progress",
  "distance_m",
  "speed_mps",
  "speed_kmh",
  "lane_offset_m",
  "lane_target_m",
  "traffic_pace_scale",
  "block_id",
  "gap_ahead_m",
  "ahead_id",
  "tire_wear",
  "compound",
  "engine_mode",
  "damage",
  "status",
  "incident",
  "incident_timer",
  "brake",
  "drs_eligible",
  "is_boxing",
  "pit_phase",
  "pit_progress",
  "pit_exit_blend",
  "pending_box",
  "sf_crossed",
  "finished",
  "sab_target_speed_mps",
  "sab_grip_scale",
  "sab_drs_mult",
  "sab_lane_m",
  "sab_brake",
  "sab_throttle",
  "sab_speed_mps",
  "sab_lap_progress",
  "desk_target_speed_mps",
  "speed_error_mps",
  "desk_speed_error_mps",
  "synced_from_physics",
  "kinematic",
  "available_grip",
  "wear_rate_per_s",
  "extra_wear_delta",
  "sepang_envelope_mps",
  "straight_ceil_mps",
  "waypoint_index",
  "ai_steer",
  "ai_throttle",
  "ai_brake",
  "field_pace",
  "pending_box_scrub",
  "pit_entry_t_delta",
  "world_x",
  "world_z",
  "telemetry_overflowed",
  "row_cap_hit",
].join(",");

const PREAMBLE = [
  "# sepang-pit-wall race telemetry v2",
  `# sample_interval_ms=${TELEMETRY_SAMPLE_MS} hold_forward=1 max_rows=${TELEMETRY_MAX_ROWS}`,
  "# pit_lane=driver_right (+lane / official map between straights)",
  "# columns cover: traffic, pit, DRS, grip, path-rail SAB, desk↔SAB authority debug",
  "# debug_contract.speed_authority=sab_target_speed_mps (AI) when synced_from_physics=1",
  "# debug_contract.pose_authority=physics SAB when synced_from_physics=1 else desk integrate",
  "# debug_contract.wear_synced=baseWearRatePerSec only",
  "# debug_contract.wear_kinematic=integrateSpeedInto extraWear + baseWearRatePerSec",
  "# debug_contract.speed_error_mps=sab_target_speed_mps - speed_mps",
  "# debug_contract.desk_speed_error_mps=desk_target_speed_mps - speed_mps",
  "# debug_contract.tire_wear_authority=desk (main thread; workers never write)",
  "# note: dense samples near ~5500m are usually pit-box dwell (lap_progress frozen), not S/F freeze",
].join("\n");

let recording = false;
let rows: string[] = [];
let lastEmitMs = -1;
let lastCarLines: string[] = [];
let overflowed = false;
let carIndexById: Map<string, number> | null = null;
const debugByCarId = new Map<string, RaceTelemetryDebugSample>();

const csvEscape = (v: string): string => {
  if (v.includes(",") || v.includes('"') || v.includes("\n")) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
};

const num = (v: number, digits = 4): string =>
  Number.isFinite(v) ? v.toFixed(digits) : "";

const bool = (v: boolean): string => (v ? "1" : "0");

export const isTelemetryRecording = (): boolean => recording;

export const telemetryRowCount = (): number => rows.length;

export const telemetryOverflowed = (): boolean => overflowed;

/** Desk step writes this each frame before recordRaceTelemetryCsv. */
export const noteRaceTelemetryDebug = (
  carId: string,
  sample: RaceTelemetryDebugSample,
): void => {
  debugByCarId.set(carId, sample);
};

export const startRaceTelemetryCsv = (indexById?: Map<string, number>): void => {
  recording = true;
  rows = [];
  lastEmitMs = -1;
  lastCarLines = [];
  overflowed = false;
  carIndexById = indexById ?? null;
  debugByCarId.clear();
};

export const stopRaceTelemetryCsv = (): void => {
  recording = false;
};

export const clearRaceTelemetryCsv = (): void => {
  recording = false;
  rows = [];
  lastEmitMs = -1;
  lastCarLines = [];
  overflowed = false;
  debugByCarId.clear();
};

type SabDebug = {
  target: number;
  grip: number;
  drs: number;
  lane: number;
  brake: number;
  throttle: number;
  speed: number;
  lapProgress: number;
  waypointIndex: number;
  aiSteer: number;
  aiThrottle: number;
  aiBrake: number;
  worldX: number;
  worldZ: number;
  kinematic: boolean;
};

const emptySab = (): SabDebug => ({
  target: NaN,
  grip: NaN,
  drs: NaN,
  lane: NaN,
  brake: NaN,
  throttle: NaN,
  speed: NaN,
  lapProgress: NaN,
  waypointIndex: NaN,
  aiSteer: NaN,
  aiThrottle: NaN,
  aiBrake: NaN,
  worldX: NaN,
  worldZ: NaN,
  kinematic: true,
});

const sabFields = (car: CarState): SabDebug => {
  const shared = getRaceSimShared();
  const index = carIndexById?.get(car.id);
  if (!shared || index === undefined) return emptySab();
  const base = vehicleBaseIndex(index);
  const f = shared.floats;
  const flags = vehicleFlagsDecode(f[base + VehicleField.flags]);
  return {
    target: f[base + VehicleField.targetSpeedMps],
    grip: f[base + VehicleField.gripScale],
    drs: f[base + VehicleField.drsMult],
    lane: f[base + VehicleField.laneOffsetM],
    brake: f[base + VehicleField.brake],
    throttle: f[base + VehicleField.throttle],
    speed: f[base + VehicleField.speed],
    lapProgress: f[base + VehicleField.lapProgress],
    waypointIndex: f[base + VehicleField.waypointIndex],
    aiSteer: f[base + VehicleField.aiSteer],
    aiThrottle: f[base + VehicleField.aiThrottle],
    aiBrake: f[base + VehicleField.aiBrake],
    worldX: f[base + VehicleField.posX],
    worldZ: f[base + VehicleField.posZ],
    kinematic: flags.kinematic,
  };
};

const pitEntryTDelta = (lapProgress: number): number =>
  ((PIT_ENTRY_T - lapProgress) % 1 + 1) % 1;

const buildCarLine = (
  elapsedMs: number,
  car: CarState,
  cars: readonly CarState[],
  meta: TelemetryMeta,
): string => {
  const ahead = nearestCarAhead(cars, car);
  const gapAhead = ahead ? alongGapM(car, ahead) : NaN;
  const sab = sabFields(car);
  const dbg = debugByCarId.get(car.id);
  const deskTarget = dbg?.deskTargetMps ?? NaN;
  const synced = dbg?.syncedFromPhysics ?? !sab.kinematic;
  const fieldPace = dbg?.fieldPace ?? NaN;
  const pendingScrub = dbg?.pendingBoxScrub ?? 1;
  const wearRate =
    dbg?.wearRatePerSec ??
    baseWearRatePerSec(car.currentCompound, meta.rainIntensity, car.engineMode);
  const extraWear = dbg?.extraWearDelta ?? 0;
  const grip = availableGrip(
    car.currentCompound,
    meta.rainIntensity,
    car.tireWear,
    car.damage,
    car.engineMode,
  );
  const paceMul = Number.isFinite(sab.grip) && sab.grip > 0.05 ? sab.grip : 1;
  const drsMul = Number.isFinite(sab.drs) && sab.drs > 0.05 ? sab.drs : 1;
  const envelope = sepangBrakingEnvelopeMps(car.lapProgress, paceMul);
  const straightCeil = SEPANG_RACE_STRAIGHT_MPS * 1.05 * paceMul * drsMul;
  const speedError = Number.isFinite(sab.target)
    ? sab.target - car.speedMps
    : NaN;
  const deskSpeedError = Number.isFinite(deskTarget)
    ? deskTarget - car.speedMps
    : NaN;
  const rowCapHit = overflowed || rows.length + cars.length > TELEMETRY_MAX_ROWS;

  return [
    String(Math.floor(elapsedMs)),
    String(TELEMETRY_SAMPLE_MS),
    meta.phase,
    meta.raceControl,
    num(meta.rainIntensity, 3),
    String(meta.totalLaps),
    csvEscape(car.id),
    csvEscape(car.name),
    bool(car.isPlayer),
    String(car.gridSlot),
    String(car.currentLap),
    num(car.lapProgress, 6),
    num(raceDistanceAchievedM(car), 2),
    num(car.speedMps, 3),
    num(car.speedMps * 3.6, 2),
    num(car.laneOffsetM, 3),
    num(car.laneTargetM, 3),
    num(car.trafficPaceScale ?? 1, 3),
    csvEscape(car.blockId ?? ""),
    num(gapAhead, 2),
    csvEscape(ahead?.id ?? ""),
    num(car.tireWear, 2),
    car.currentCompound,
    car.engineMode,
    num(car.damage, 1),
    car.status,
    car.incidentKind ?? "",
    num(car.incidentTimer, 3),
    num(car.brakeIntensity, 3),
    bool(car.drsEligible),
    bool(car.isBoxing),
    car.pitPhase ?? "",
    num(car.pitProgress, 4),
    num(car.pitExitBlend, 3),
    bool(car.pendingBox),
    bool(car.sfCrossedOnce),
    bool(car.finished),
    num(sab.target, 3),
    num(sab.grip, 3),
    num(sab.drs, 3),
    num(sab.lane, 3),
    num(sab.brake, 3),
    num(sab.throttle, 3),
    num(sab.speed, 3),
    num(sab.lapProgress, 6),
    num(deskTarget, 3),
    num(speedError, 3),
    num(deskSpeedError, 3),
    bool(synced),
    bool(sab.kinematic),
    num(grip, 4),
    num(wearRate, 5),
    num(extraWear, 5),
    num(envelope, 3),
    num(straightCeil, 3),
    num(sab.waypointIndex, 1),
    num(sab.aiSteer, 4),
    num(sab.aiThrottle, 3),
    num(sab.aiBrake, 3),
    num(fieldPace, 4),
    num(pendingScrub, 4),
    num(pitEntryTDelta(car.lapProgress), 6),
    num(sab.worldX, 3),
    num(sab.worldZ, 3),
    bool(overflowed),
    bool(rowCapHit),
  ].join(",");
};

/**
 * Call once per desk sim step after traffic. Emits hold-forward rows so
 * `elapsed_ms` advances by TELEMETRY_SAMPLE_MS for analysis tools.
 */
export const recordRaceTelemetryCsv = (
  elapsedMs: number,
  cars: readonly CarState[],
  meta: TelemetryMeta,
): void => {
  if (!recording || overflowed) return;
  const t = Math.max(0, Math.floor(elapsedMs));
  if (t < 0) return;

  lastCarLines = cars.map((car) => buildCarLine(t, car, cars, meta));

  const startMs = lastEmitMs < 0 ? t : lastEmitMs + TELEMETRY_SAMPLE_MS;
  for (let ms = startMs; ms <= t; ms += TELEMETRY_SAMPLE_MS) {
    if (rows.length + lastCarLines.length > TELEMETRY_MAX_ROWS) {
      overflowed = true;
      recording = false;
      break;
    }
    // Rewrite elapsed_ms on held lines so the ladder is exact.
    for (const line of lastCarLines) {
      const comma = line.indexOf(",");
      rows.push(`${ms}${comma >= 0 ? line.slice(comma) : ""}`);
    }
    lastEmitMs = ms;
  }
};

export const buildRaceTelemetryCsv = (): string => {
  if (rows.length === 0) return `${PREAMBLE}\n${HEADER}\n`;
  return `${PREAMBLE}\n${HEADER}\n${rows.join("\n")}\n`;
};

export const downloadRaceTelemetryCsv = (filename?: string): boolean => {
  if (typeof document === "undefined") return false;
  const csv = buildRaceTelemetryCsv();
  if (rows.length === 0) return false;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const name = filename ?? `sepang-race-telemetry-${stamp}.csv`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return true;
};

