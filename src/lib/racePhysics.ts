import * as THREE from "three";
import { getTrackCurve, TRACK_LENGTH_M } from "@/lib/trackCurve";

export type CarPhysicsStatus = "racing" | "sliding" | "spun" | "retired";
export type IncidentKind = "lockup" | "spin" | "contact" | null;

export type PhysicsCompound = "soft" | "medium" | "hard" | "intermediate" | "wet";
export type PhysicsEngineMode = "push" | "standard" | "save";

/** Sepang F1 race lap (~5543 m) — metres per second are real along-track values. */
export const SEPANG_RACE_LAP_S = 94;
export const SEPANG_AVG_SPEED_MPS = TRACK_LENGTH_M / SEPANG_RACE_LAP_S;

/** F1 corner-speed reference (312 km/h trap) — scales corner limits only. */
export const CORNER_REF_KMH = 312;
const CORNER_REF_MPS = CORNER_REF_KMH / 3.6;

/** Drag-limited top speed (F1 record ≈ 372 km/h). Corners limit via brakingTargetMps. */
export const STRAIGHT_CEILING_KMH = 372;
export const STRAIGHT_CEILING_MPS = STRAIGHT_CEILING_KMH / 3.6;

/** @deprecated Use CORNER_REF_KMH or STRAIGHT_CEILING_KMH. */
export const STRAIGHT_MAX_KMH = CORNER_REF_KMH;
/** @deprecated Use STRAIGHT_CEILING_MPS for straight targets. */
export const STRAIGHT_MAX_MPS = CORNER_REF_MPS;

/** Average race progress rate at Sepang F1 pace (lap fraction / s). */
export const RACE_BASE_PROGRESS_RATE = SEPANG_AVG_SPEED_MPS / TRACK_LENGTH_M;

/** Reference lap time for wear + stint tuning. */
export const GAME_LAP_TIME_S = SEPANG_RACE_LAP_S;

const LUT_SAMPLES = 384;
const HAIRPIN_FLOOR_RATIO = 0.42;
/** Look ahead along lap for corner speed (metres on 5543 m Sepang). */
const CORNER_LOOKAHEAD_M = 35;
/** Braking-envelope plan horizon — must cover 300 km/h → hairpin (~150 m). */
const BRAKE_LOOKAHEAD_M = 260;
/** Plan with 70% of peak braking so per-frame demand stays under lockup thresholds. */
const BRAKE_PLAN_RATIO = 0.7;
/** Curvature band where the point limit opens from corner speed to the straight ceiling. */
const KAPPA_OPEN_LO = 0.03;
const KAPPA_OPEN_HI = 0.085;

/**
 * F1 longitudinal envelope (public telemetry, full grip, dry):
 * 0–100 km/h ~2.6 s, 0–200 ~4.9 s, 0–300 ~8.5 s.
 * Braking is downforce-dependent: ~5.9 G at 300 km/h, ~2 G mechanical at
 * low speed (downforce scales with v², so stopping power fades as the car
 * slows).
 */
const PEAK_TRACTION_ACCEL_MPS2 = 15;
/** Speed (m/s) where aero drag sharply reduces acceleration (~245 km/h). */
const AERO_SPEED_KNEE_MPS = 68;
const AERO_TAPER_POWER = 3.1;
/** Traction ramp off the line — avoids instant max thrust (wheelspin control). */
const TRACTION_RAMP_SPEED_MPS = 15;
const TRACTION_RAMP_FLOOR = 0.26;
/** First-order response: throttle ~220 ms, brakes hit harder ~100 ms. */
const ACCEL_RESPONSE_S = 0.22;
const BRAKE_RESPONSE_S = 0.1;
/** Mechanical (zero-downforce) braking grip ≈ 2 G. */
const BRAKE_MECH_MPS2 = 20;
/** Extra braking added by downforce at the 300 km/h reference (total ≈ 5.9 G). */
const BRAKE_AERO_MPS2 = 38;
/** Downforce reference speed: 300 km/h. */
const AERO_REF_MPS = 300 / 3.6;
const MAX_BRAKE_MPS2 = BRAKE_MECH_MPS2 + BRAKE_AERO_MPS2;
const SPIN_BRAKE_RATIO = 1.35;
const SLIDE_BRAKE_RATIO = 1.15;
const SPIN_DURATION_S = 2.2;
const SLIDE_DURATION_S = 0.55;
const RETIRE_DAMAGE = 80;
const CONTACT_GAP_M = 5;
/** ~80 km/h closing speed before contact registers. */
const CONTACT_CLOSING_MPS = 22;
const CONTACT_DAMAGE_TRAIL = 28;
const CONTACT_DAMAGE_LEAD = 12;

/** Along-track acceleration cap (m/s²) — traction at low speed, aero-limited at trap. */
export const longitudinalAccelMps2 = (speedMps: number, grip: number): number => {
  const g = Math.max(0.12, grip);
  const traction =
    speedMps < TRACTION_RAMP_SPEED_MPS
      ? TRACTION_RAMP_FLOOR + (1 - TRACTION_RAMP_FLOOR) * (speedMps / TRACTION_RAMP_SPEED_MPS)
      : 1;
  const aero = 1 / (1 + Math.pow(Math.max(0, speedMps) / AERO_SPEED_KNEE_MPS, AERO_TAPER_POWER));
  return PEAK_TRACTION_ACCEL_MPS2 * g * traction * aero * Math.min(1.08, g + 0.1);
};

/**
 * Braking decel cap (m/s²): mechanical grip + aero downforce term (∝ v²).
 * Full ~5.9 G is only available at speed; as the car slows the downforce
 * bleeds off with v² and stopping power fades toward ~2 G.
 */
export const longitudinalBrakeMps2 = (speedMps: number, grip: number): number => {
  const g = Math.max(0.12, grip);
  const v = Math.max(0, speedMps);
  const aero = Math.min(1.1, (v / AERO_REF_MPS) ** 2);
  return (BRAKE_MECH_MPS2 + BRAKE_AERO_MPS2 * aero) * g;
};

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

/** @deprecated Use brakingTargetMps — it anticipates corners with real braking distance. */
export const cornerSpeedLimit = (t: number, grip: number): number => {
  const k = effectiveKappa(t);
  const shape = HAIRPIN_FLOOR_RATIO + (1 - HAIRPIN_FLOOR_RATIO) * (1 - Math.pow(k, 0.85));
  const g = Math.max(0.12, grip);
  return CORNER_REF_MPS * shape * Math.min(1.15, 0.55 + g * 0.6);
};

/**
 * Speed limit for a raw local curvature value. Opens smoothly to well above
 * the straight ceiling as curvature vanishes, so there is no binary
 * straight/corner flip in the target speed.
 */
const speedLimitFromKappa = (k: number, grip: number): number => {
  const g = Math.max(0.12, grip);
  const shape = HAIRPIN_FLOOR_RATIO + (1 - HAIRPIN_FLOOR_RATIO) * (1 - Math.pow(k, 0.85));
  const cornerV = CORNER_REF_MPS * shape * Math.min(1.15, 0.55 + g * 0.6);
  const raw = (KAPPA_OPEN_HI - k) / (KAPPA_OPEN_HI - KAPPA_OPEN_LO);
  const o = Math.min(1, Math.max(0, raw));
  const openness = o * o * (3 - 2 * o);
  return cornerV + (STRAIGHT_CEILING_MPS * 1.6 - cornerV) * openness;
};

/**
 * Max speed allowed *now* so every upcoming corner is reachable with planned
 * braking: min over lookahead of sqrt(vCorner² + 2·aBrake·distance).
 * Produces a smooth, early brake ramp instead of a target-speed cliff —
 * the cliff was tripping lockup/spin thresholds every corner entry
 * (slide → crawl → re-accelerate = caterpillar surging).
 *
 * Constraints are anchored to the fixed curvature-LUT grid, not to
 * car-relative offsets: car-relative samples slide across an apex frame to
 * frame and make the envelope flicker, which spikes brake demand into
 * lockups at hairpins.
 */
export const brakingTargetMps = (t: number, grip: number): number => {
  const lut = buildKappaLut();
  const g = Math.max(0.12, grip);
  // Planned decel a(v) = aMech + aAero·v² (downforce braking), with margin.
  const aMech = BRAKE_MECH_MPS2 * g * BRAKE_PLAN_RATIO;
  const aAero = (BRAKE_AERO_MPS2 / (AERO_REF_MPS * AERO_REF_MPS)) * g * BRAKE_PLAN_RATIO;
  const mechOverAero = aMech / aAero;
  let allowed = speedLimitFromKappa(sampleKappa(t), grip);
  const u = ((t % 1) + 1) % 1;
  const x = u * LUT_SAMPLES;
  const firstIdx = Math.ceil(x);
  const metresPerSample = TRACK_LENGTH_M / LUT_SAMPLES;
  const steps = Math.ceil(BRAKE_LOOKAHEAD_M / metresPerSample);
  for (let j = 0; j <= steps; j += 1) {
    const s = (firstIdx + j - x) * metresPerSample;
    if (s <= 0) continue;
    const v = speedLimitFromKappa(lut[(firstIdx + j) % LUT_SAMPLES], grip);
    // Integrating v·dv/ds = aMech + aAero·v² backwards from the corner:
    const cap = Math.sqrt(
      Math.max(0, (v * v + mechOverAero) * Math.exp(2 * aAero * s) - mechOverAero),
    );
    if (cap < allowed) allowed = cap;
  }
  return allowed;
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
    STRAIGHT_CEILING_MPS *
    ENGINE_MULT[input.engineMode] *
    COMPOUND_BASE[input.compound] *
    grip *
    input.controlMult *
    input.drsMult;
  const corner = brakingTargetMps(input.lapProgress, grip);
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

/** Zero-allocation physics step — reuse `out` every car in the sim hot loop. */
export const integrateSpeedInto = (out: IntegrateResult, input: IntegrateInput): void => {
  const grip = availableGrip(
    input.compound,
    input.rain,
    input.tireWear,
    input.damage,
    input.engineMode,
  );

  if (input.status === "retired") {
    out.speedMps = 0;
    out.status = "retired";
    out.damage = input.damage;
    out.incidentTimer = 0;
    out.incidentKind = input.incidentKind;
    out.tireWear = input.tireWear;
    out.extraWear = 0;
    out.grip = grip;
    out.brakeIntensity = 0;
    return;
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
        ? CORNER_REF_MPS * 0.08
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
    out.speedMps = speed;
    out.status = status;
    out.damage = damage;
    out.incidentTimer = incidentTimer;
    out.incidentKind = incidentKind;
    out.tireWear = Math.max(0, input.tireWear - extraWear);
    out.extraWear = extraWear;
    out.grip = grip;
    out.brakeIntensity = 1;
    return;
  }

  const dt = Math.max(1e-4, input.dt);
  const brakeLimit = longitudinalBrakeMps2(speed, grip);
  const accelLimit = longitudinalAccelMps2(speed, grip);
  const speedError = input.targetMps - speed;

  if (speedError < 0) {
    const speedShortfall = -speedError;
    const brakeDemand = speedShortfall / BRAKE_RESPONSE_S;
    const ratio = brakeDemand / Math.max(1e-3, brakeLimit);
    brakeIntensity = Math.min(1, ratio);
    if (ratio > SPIN_BRAKE_RATIO) {
      status = "spun";
      incidentKind = "spin";
      incidentTimer = SPIN_DURATION_S;
      damage = Math.min(100, damage + 8 + (ratio - SPIN_BRAKE_RATIO) * 12);
      extraWear += 10 * dt;
      speed = Math.max(CORNER_REF_MPS * 0.1, speed - brakeLimit * dt);
    } else if (ratio > SLIDE_BRAKE_RATIO) {
      status = "sliding";
      incidentKind = "lockup";
      incidentTimer = SLIDE_DURATION_S;
      damage = Math.min(100, damage + 2 + (ratio - SLIDE_BRAKE_RATIO) * 4);
      extraWear += 6 * dt;
      speed = Math.max(input.targetMps, speed - brakeLimit * 0.85 * dt);
    } else {
      const before = speed;
      speed = Math.max(input.targetMps, speed - Math.min(brakeDemand, brakeLimit) * dt);
      const appliedDecel = (before - speed) / dt;
      brakeIntensity = Math.min(1, appliedDecel / Math.max(1e-3, brakeLimit));
      if (ratio > 0.92) extraWear += 1.5 * dt;
    }
  } else {
    const accelWanted = speedError / ACCEL_RESPONSE_S;
    speed = Math.min(input.targetMps, speed + Math.min(accelWanted, accelLimit) * dt);
  }

  if (damage >= RETIRE_DAMAGE) {
    out.speedMps = 0;
    out.status = "retired";
    out.damage = damage;
    out.incidentTimer = 0;
    out.incidentKind = "spin";
    out.tireWear = Math.max(0, input.tireWear - extraWear);
    out.extraWear = extraWear;
    out.grip = grip;
    out.brakeIntensity = 0;
    return;
  }

  out.speedMps = speed;
  out.status = status;
  out.damage = damage;
  out.incidentTimer = incidentTimer;
  out.incidentKind = incidentKind;
  out.tireWear = Math.max(0, input.tireWear - extraWear);
  out.extraWear = extraWear;
  out.grip = grip;
  out.brakeIntensity = brakeIntensity;
};

/** Allocating wrapper for tests and one-off callers. */
export const integrateSpeed = (input: IntegrateInput): IntegrateResult => {
  const out: IntegrateResult = {
    speedMps: 0,
    status: "racing",
    damage: 0,
    incidentTimer: 0,
    incidentKind: null,
    tireWear: 0,
    extraWear: 0,
    grip: 0,
    brakeIntensity: 0,
  };
  integrateSpeedInto(out, input);
  return { ...out };
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
