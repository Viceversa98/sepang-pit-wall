import * as THREE from "three";
import { getTrackCurve, TRACK_LENGTH_M } from "@/lib/trackCurve";

export type CarPhysicsStatus = "racing" | "sliding" | "spun" | "retired";
export type IncidentKind = "lockup" | "spin" | "contact" | null;

export type PhysicsCompound = "soft" | "medium" | "hard" | "intermediate" | "wet";
export type PhysicsEngineMode = "push" | "standard" | "save";

/** Sepang F1 race lap (~5543 m) — metres per second are real along-track values. */
export const SEPANG_RACE_LAP_S = 94;
export const SEPANG_AVG_SPEED_MPS = TRACK_LENGTH_M / SEPANG_RACE_LAP_S;

/** Main-straight trap with DRS (312 km/h). */
export const STRAIGHT_MAX_KMH = 312;
export const STRAIGHT_MAX_MPS = STRAIGHT_MAX_KMH / 3.6;

/** Average race progress rate at Sepang F1 pace (lap fraction / s). */
export const RACE_BASE_PROGRESS_RATE = SEPANG_AVG_SPEED_MPS / TRACK_LENGTH_M;

/** Reference lap time for wear + stint tuning. */
export const GAME_LAP_TIME_S = SEPANG_RACE_LAP_S;

const LUT_SAMPLES = 384;
const HAIRPIN_FLOOR_RATIO = 0.42;
/** Brake-demand horizon — avoids frame-rate spikes at corner entry. */
const BRAKE_HORIZON_S = 0.35;
/** Look ahead along lap for corner speed (metres on 5543 m Sepang). */
const CORNER_LOOKAHEAD_M = 35;
/** F1 longitudinal limits (m/s²). */
const MAX_ACCEL_MPS2 = 13;
const MAX_BRAKE_MPS2 = 55;
const SPIN_BRAKE_RATIO = 1.35;
const SLIDE_BRAKE_RATIO = 1.08;
const SPIN_DURATION_S = 2.2;
const SLIDE_DURATION_S = 0.55;
const RETIRE_DAMAGE = 80;
const CONTACT_GAP_M = 5;
/** ~80 km/h closing speed before contact registers. */
const CONTACT_CLOSING_MPS = 22;
const CONTACT_DAMAGE_TRAIL = 28;
const CONTACT_DAMAGE_LEAD = 12;

const ENGINE_MULT: Record<PhysicsEngineMode, number> = {
  push: 1.12,
  standard: 1,
  save: 0.9,
};

const COMPOUND_BASE: Record<PhysicsCompound, number> = {
  soft: 1.1,
  medium: 1,
  hard: 0.94,
  intermediate: 0.92,
  wet: 0.88,
};

/** Tire remaining % → grip multiplier (cliff below ~25). */
export const tireGripCurve = (tireWear: number): number => {
  const w = Math.max(0, Math.min(100, tireWear)) / 100;
  if (w >= 0.55) return 0.88 + w * 0.12;
  if (w >= 0.28) return 0.55 + ((w - 0.28) / 0.27) * 0.33;
  if (w >= 0.08) return 0.22 + ((w - 0.08) / 0.2) * 0.33;
  return 0.08 + w * 1.75;
};

/** Grip vs rain: slicks hate wet; inters peak mid-rain; wets best in heavy. */
export const compoundRainGrip = (compound: PhysicsCompound, rain: number): number => {
  if (rain < 0.12) {
    if (compound === "soft") return 1.05;
    if (compound === "medium") return 1;
    if (compound === "hard") return 0.96;
    if (compound === "intermediate") return 0.78;
    return 0.62;
  }
  if (rain < 0.4) {
    if (compound === "soft") return 0.78;
    if (compound === "medium") return 0.88;
    if (compound === "hard") return 0.94;
    if (compound === "intermediate") return 1.08;
    return 0.95;
  }
  if (rain < 0.7) {
    if (compound === "soft") return 0.48;
    if (compound === "medium") return 0.58;
    if (compound === "hard") return 0.65;
    if (compound === "intermediate") return 1.02;
    return 1.12;
  }
  if (compound === "wet") return 1.15;
  if (compound === "intermediate") return 0.88;
  if (compound === "hard") return 0.42;
  if (compound === "medium") return 0.36;
  return 0.28;
};

export const availableGrip = (
  compound: PhysicsCompound,
  rain: number,
  tireWear: number,
  damage: number,
  engineMode: PhysicsEngineMode,
): number => {
  const pushPen = engineMode === "push" ? 0.94 : 1;
  const dmg = 1 - Math.min(100, Math.max(0, damage)) / 200;
  return (
    compoundRainGrip(compound, rain) *
    tireGripCurve(tireWear) *
    dmg *
    pushPen
  );
};

let kappaLut: Float32Array | null = null;
let signedKappaLut: Float32Array | null = null;

const buildKappaLut = (): Float32Array => {
  if (kappaLut && signedKappaLut) return kappaLut;
  const curve = getTrackCurve();
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < LUT_SAMPLES; i += 1) {
    pts.push(curve.getPointAt(i / LUT_SAMPLES));
  }
  const raw = new Float32Array(LUT_SAMPLES);
  const signed = new Float32Array(LUT_SAMPLES);
  let maxK = 1e-6;
  for (let i = 0; i < LUT_SAMPLES; i += 1) {
    const prev = pts[(i - 1 + LUT_SAMPLES) % LUT_SAMPLES];
    const cur = pts[i];
    const next = pts[(i + 1) % LUT_SAMPLES];
    const ax = cur.x - prev.x;
    const az = cur.z - prev.z;
    const bx = next.x - cur.x;
    const bz = next.z - cur.z;
    const al = Math.hypot(ax, az) || 1e-6;
    const bl = Math.hypot(bx, bz) || 1e-6;
    const cross = ax * bz - az * bx;
    const kappa = Math.abs(cross) / (al * bl * ((al + bl) * 0.5));
    raw[i] = kappa;
    signed[i] = Math.sign(cross || 1) * kappa;
    if (kappa > maxK) maxK = kappa;
  }
  for (let i = 0; i < LUT_SAMPLES; i += 1) {
    raw[i] = Math.min(1, raw[i] / maxK);
    signed[i] = Math.sign(signed[i]) * Math.min(1, Math.abs(signed[i]) / maxK);
  }
  kappaLut = raw;
  signedKappaLut = signed;
  return raw;
};

const sampleKappa = (t: number): number => {
  const lut = buildKappaLut();
  const u = ((t % 1) + 1) % 1;
  const x = u * LUT_SAMPLES;
  const i0 = Math.floor(x) % LUT_SAMPLES;
  const i1 = (i0 + 1) % LUT_SAMPLES;
  const f = x - Math.floor(x);
  return lut[i0] * (1 - f) + lut[i1] * f;
};

const sampleSignedKappa = (t: number): number => {
  buildKappaLut();
  const lut = signedKappaLut!;
  const u = ((t % 1) + 1) % 1;
  const x = u * LUT_SAMPLES;
  const i0 = Math.floor(x) % LUT_SAMPLES;
  const i1 = (i0 + 1) % LUT_SAMPLES;
  const f = x - Math.floor(x);
  return lut[i0] * (1 - f) + lut[i1] * f;
};

/** Normalised corner severity 0 (straight) → 1 (tightest). */
export const curvatureAt = (t: number): number => effectiveKappa(t);

/** +1 left turn, −1 right turn, 0 straight — smoothed over ~25 m ahead. */
export const turnSignAt = (t: number): number => {
  const aheadT = 25 / TRACK_LENGTH_M;
  const sk =
    sampleSignedKappa(t) * 0.45 +
    sampleSignedKappa(t + aheadT * 0.35) * 0.35 +
    sampleSignedKappa(t + aheadT) * 0.2;
  if (Math.abs(sk) < 0.09) return 0;
  return Math.sign(sk);
};

/** Peak curvature over the next `lookM` metres of lap. */
export const peakCurvatureAhead = (t: number, lookM: number): number => {
  const span = lookM / TRACK_LENGTH_M;
  let peak = effectiveKappa(t);
  for (let i = 1; i <= 6; i += 1) {
    peak = Math.max(peak, effectiveKappa(t + (i / 6) * span));
  }
  return peak;
};

/** Blend current curvature with peak over the next ~35 m so targets ease into corners. */
const effectiveKappa = (t: number): number => {
  const kNow = sampleKappa(t);
  const aheadT = CORNER_LOOKAHEAD_M / TRACK_LENGTH_M;
  let kPeak = kNow;
  for (let i = 1; i <= 5; i += 1) {
    kPeak = Math.max(kPeak, sampleKappa(t + (i / 5) * aheadT));
  }
  return kNow * 0.4 + kPeak * 0.6;
};

/** Max along-track speed at progress t given current grip. */
export const cornerSpeedLimit = (t: number, grip: number): number => {
  const k = effectiveKappa(t);
  const shape = HAIRPIN_FLOOR_RATIO + (1 - HAIRPIN_FLOOR_RATIO) * (1 - Math.pow(k, 0.85));
  const g = Math.max(0.12, grip);
  return STRAIGHT_MAX_MPS * shape * Math.min(1.15, 0.55 + g * 0.6);
};

export const progressRateToMps = (rate: number): number => rate * TRACK_LENGTH_M;
export const mpsToProgressRate = (mps: number): number => mps / TRACK_LENGTH_M;

/** Milli-lap gap (progress×1000) → seconds at Sepang race-average pace. */
export const gapUnitsToSeconds = (gapUnits: number): number =>
  (gapUnits / 1000) * TRACK_LENGTH_M / SEPANG_AVG_SPEED_MPS;

export type TargetSpeedInput = {
  compound: PhysicsCompound;
  engineMode: PhysicsEngineMode;
  rain: number;
  tireWear: number;
  damage: number;
  lapProgress: number;
  controlMult: number;
  drsMult: number;
  pitExitBlend: number;
  pitExitScale: (blend: number) => number;
};

/** Desired pace before inertia (m/s). */
export const targetSpeedMps = (input: TargetSpeedInput): number => {
  const grip = availableGrip(
    input.compound,
    input.rain,
    input.tireWear,
    input.damage,
    input.engineMode,
  );
  const straight =
    STRAIGHT_MAX_MPS *
    ENGINE_MULT[input.engineMode] *
    COMPOUND_BASE[input.compound] *
    grip *
    input.controlMult *
    input.drsMult;
  const corner = cornerSpeedLimit(input.lapProgress, grip);
  let target = Math.min(straight, corner);
  if (input.pitExitBlend < 1) {
    target *= input.pitExitScale(input.pitExitBlend);
  }
  return Math.max(0, target);
};

const COMPOUND_WEAR_MULT: Record<PhysicsCompound, number> = {
  soft: 1.35,
  medium: 1,
  hard: 0.7,
  intermediate: 0.85,
  wet: 0.75,
};

/** Target tire wear (% points) drained per lap — medium, dry, standard. */
const TARGET_WEAR_PER_LAP = 30;

/** Base wear %/s — scales with lap length so stint length stays stable. */
export const baseWearRatePerSec = (
  compound: PhysicsCompound,
  rain: number,
  engineMode: PhysicsEngineMode,
): number => {
  const mediumDryPerSec = TARGET_WEAR_PER_LAP / GAME_LAP_TIME_S;
  const rainMult = 1 + rain * 0.375;
  const push = engineMode === "push" ? 1.25 : 1;
  return COMPOUND_WEAR_MULT[compound] * mediumDryPerSec * rainMult * push;
};

export type IntegrateInput = {
  speedMps: number;
  status: CarPhysicsStatus;
  damage: number;
  incidentTimer: number;
  incidentKind: IncidentKind;
  tireWear: number;
  compound: PhysicsCompound;
  engineMode: PhysicsEngineMode;
  rain: number;
  targetMps: number;
  dt: number;
};

export type IntegrateResult = {
  speedMps: number;
  status: CarPhysicsStatus;
  damage: number;
  incidentTimer: number;
  incidentKind: IncidentKind;
  tireWear: number;
  extraWear: number;
  grip: number;
  /** 0–1 brake demand for rear light visuals. */
  brakeIntensity: number;
};

export const integrateSpeed = (input: IntegrateInput): IntegrateResult => {
  const grip = availableGrip(
    input.compound,
    input.rain,
    input.tireWear,
    input.damage,
    input.engineMode,
  );

  if (input.status === "retired") {
    return {
      speedMps: 0,
      status: "retired",
      damage: input.damage,
      incidentTimer: 0,
      incidentKind: input.incidentKind,
      tireWear: input.tireWear,
      extraWear: 0,
      grip,
      brakeIntensity: 0,
    };
  }

  let status = input.status;
  let damage = input.damage;
  let incidentTimer = input.incidentTimer;
  let incidentKind = input.incidentKind;
  let speed = input.speedMps;
  let extraWear = 0;
  let brakeIntensity = 0;

  if (status === "spun" || status === "sliding") {
    incidentTimer = Math.max(0, incidentTimer - input.dt);
    const crawl =
      status === "spun"
        ? STRAIGHT_MAX_MPS * 0.08
        : Math.min(speed, input.targetMps) * 0.55;
    speed = Math.max(crawl, speed - MAX_BRAKE_MPS2 * grip * 0.35 * input.dt);
    if (status === "sliding") {
      extraWear += 6 * input.dt;
    } else {
      extraWear += 3 * input.dt;
    }
    if (incidentTimer <= 0) {
      status = "racing";
      incidentKind = null;
    }
    return {
      speedMps: speed,
      status,
      damage,
      incidentTimer,
      incidentKind,
      tireWear: Math.max(0, input.tireWear - extraWear),
      extraWear,
      grip,
      brakeIntensity: 1,
    };
  }

  const dt = Math.max(1e-4, input.dt);
  const brakeLimit = MAX_BRAKE_MPS2 * grip;
  const accelLimit = MAX_ACCEL_MPS2 * Math.min(1.1, grip + 0.15);
  const speedError = input.targetMps - speed;

  if (speedError < 0) {
    const speedShortfall = -speedError;
    const brakeDemand = speedShortfall / BRAKE_HORIZON_S;
    const ratio = brakeDemand / Math.max(1e-3, brakeLimit);
    brakeIntensity = Math.min(1, ratio);
    if (ratio > SPIN_BRAKE_RATIO) {
      status = "spun";
      incidentKind = "spin";
      incidentTimer = SPIN_DURATION_S;
      damage = Math.min(100, damage + 8 + (ratio - SPIN_BRAKE_RATIO) * 12);
      extraWear += 10 * dt;
      speed = Math.max(STRAIGHT_MAX_MPS * 0.1, speed - brakeLimit * dt);
    } else if (ratio > SLIDE_BRAKE_RATIO) {
      status = "sliding";
      incidentKind = "lockup";
      incidentTimer = SLIDE_DURATION_S;
      damage = Math.min(100, damage + 2 + (ratio - SLIDE_BRAKE_RATIO) * 4);
      extraWear += 6 * dt;
      speed = Math.max(input.targetMps, speed - brakeLimit * 0.85 * dt);
    } else {
      speed = Math.max(input.targetMps, speed - Math.min(brakeDemand, brakeLimit) * dt);
      if (ratio > 0.92) extraWear += 1.5 * dt;
    }
  } else {
    const accelWanted = speedError / BRAKE_HORIZON_S;
    speed = Math.min(input.targetMps, speed + Math.min(accelWanted, accelLimit) * dt);
  }

  if (damage >= RETIRE_DAMAGE) {
    return {
      speedMps: 0,
      status: "retired",
      damage,
      incidentTimer: 0,
      incidentKind: "spin",
      tireWear: Math.max(0, input.tireWear - extraWear),
      extraWear,
      grip,
      brakeIntensity: 0,
    };
  }

  return {
    speedMps: speed,
    status,
    damage,
    incidentTimer,
    incidentKind,
    tireWear: Math.max(0, input.tireWear - extraWear),
    extraWear,
    grip,
    brakeIntensity,
  };
};

export type CollisionCar = {
  id: string;
  finished: boolean;
  isBoxing: boolean;
  status: CarPhysicsStatus;
  speedMps: number;
  damage: number;
  incidentTimer: number;
  incidentKind: IncidentKind;
  laneOffsetM: number;
  currentLap: number;
  lapProgress: number;
};

export const CONTACT_CONSTANTS = {
  gapM: CONTACT_GAP_M,
  closingMps: CONTACT_CLOSING_MPS,
  retireDamage: RETIRE_DAMAGE,
} as const;

/** Apply contact damage when cars overlap with high closing speed. Mutates cars. */
export const applyCollisions = (cars: CollisionCar[]): void => {
  for (let i = 0; i < cars.length; i += 1) {
    const a = cars[i];
    if (a.finished || a.isBoxing || a.status === "retired") continue;
    for (let j = i + 1; j < cars.length; j += 1) {
      const b = cars[j];
      if (b.finished || b.isBoxing || b.status === "retired") continue;
      if (Math.abs(a.laneOffsetM - b.laneOffsetM) > 2.3) continue;

      const distA = a.currentLap + a.lapProgress;
      const distB = b.currentLap + b.lapProgress;
      const gapM = Math.abs(distA - distB) * TRACK_LENGTH_M;
      if (gapM > CONTACT_GAP_M) continue;

      const ahead = distA >= distB ? a : b;
      const behind = distA >= distB ? b : a;
      const closing = behind.speedMps - ahead.speedMps;
      if (closing < CONTACT_CLOSING_MPS) continue;

      behind.damage = Math.min(100, behind.damage + CONTACT_DAMAGE_TRAIL);
      ahead.damage = Math.min(100, ahead.damage + CONTACT_DAMAGE_LEAD);
      behind.speedMps *= 0.35;
      ahead.speedMps *= 0.7;
      behind.incidentKind = "contact";
      ahead.incidentKind = "contact";

      const severe = closing > CONTACT_CLOSING_MPS * 1.8;
      if (behind.damage >= RETIRE_DAMAGE || severe) {
        behind.status = behind.damage >= RETIRE_DAMAGE ? "retired" : "spun";
        behind.incidentTimer = SPIN_DURATION_S;
        if (behind.status === "retired") behind.speedMps = 0;
      } else {
        behind.status = "spun";
        behind.incidentTimer = SPIN_DURATION_S * 0.75;
      }
      if (ahead.damage >= RETIRE_DAMAGE) {
        ahead.status = "retired";
        ahead.speedMps = 0;
        ahead.incidentTimer = 0;
      } else if (severe) {
        ahead.status = "sliding";
        ahead.incidentTimer = SLIDE_DURATION_S;
      }
    }
  }
};

/** Real along-track m/s → km/h for HUD/telemetry. */
export const gameSpeedToDisplayKmh = (speedMps: number): number =>
  Math.max(0, speedMps * 3.6);

/** @deprecated Use gameSpeedToDisplayKmh. */
export const mpsToKmh = gameSpeedToDisplayKmh;
