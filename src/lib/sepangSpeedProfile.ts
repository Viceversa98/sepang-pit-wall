import telemetryJson from "@/data/sepang-turn-telemetry.json";
import speedLutJson from "@/data/sepang-speed-lut.json";
import { TRACK_LENGTH_M } from "@/lib/trackCurve";

export type SepangSegment = {
  id: string;
  label: string;
  t0: number;
  t1: number;
  apexT?: number;
  minKph: number;
  maxKph: number;
};

const segments = (telemetryJson as { segments: SepangSegment[] }).segments;

type SpeedLutPoint = { m: number; speedKph: number };
const humanLutPoints: SpeedLutPoint[] =
  (speedLutJson as { points?: SpeedLutPoint[] }).points ??
  (Array.isArray(speedLutJson) ? (speedLutJson as SpeedLutPoint[]) : []);

const LUT_N = 384;
/**
 * Planned brake for approach envelope.
 * Lower a ⇒ earlier boards (closer to human brake markers).
 */
export const SEPANG_BRAKE_PLAN_MPS2 = 20;
/** Look ahead for scrub into apex — keep short enough for T13–T15 / main trap. */
export const SEPANG_BRAKE_LOOK_M = 320;
/** Soft open-track push above segment max when far from apex. */
const OPEN_TRACK_BOOST = 1.04;
/** AI may sit slightly above recorded player p90. */
const HUMAN_LUT_HEADROOM = 1.08;

const kphToMps = (kph: number): number => kph / 3.6;

const wrap01 = (t: number): number => ((t % 1) + 1) % 1;

/** Sample player-paced LUT (10 m bins) at lap fraction. */
const sampleHumanLutKph = (lapProgress: number): number => {
  if (!humanLutPoints.length) return Number.POSITIVE_INFINITY;
  const lengthM =
    (speedLutJson as { lengthM?: number }).lengthM ?? TRACK_LENGTH_M;
  const station = wrap01(lapProgress) * lengthM;
  const step = 10;
  const i0 = Math.max(
    0,
    Math.min(humanLutPoints.length - 1, Math.floor(station / step)),
  );
  const i1 = Math.min(humanLutPoints.length - 1, i0 + 1);
  const a = humanLutPoints[i0];
  const b = humanLutPoints[i1];
  const span = Math.max(1e-3, b.m - a.m || step);
  const f = (station - a.m) / span;
  return a.speedKph + (b.speedKph - a.speedKph) * Math.max(0, Math.min(1, f));
};

/**
 * Local speed limit LUT (m/s): apex → minKph, open stretch → maxKph,
 * soft-capped by player telemetry so AI does not overshoot human brake zones.
 */
let limitLut: Float32Array | null = null;

const buildLimitLut = (): Float32Array => {
  if (limitLut) return limitLut;
  const lut = new Float32Array(LUT_N);
  for (let i = 0; i < LUT_N; i++) {
    const t = i / LUT_N;
    const seg =
      segments.find((s) => t >= s.t0 && t < s.t1) ??
      segments[segments.length - 1];
    const apex = seg.apexT ?? (seg.t0 + seg.t1) * 0.5;
    const span = Math.max(1e-4, seg.t1 - seg.t0);
    // Asymmetric: wide entry scrub, tighter exit. Floors keep short hairpins
    // (T1/T2) from interpolating straight into exit max at the apex sample.
    const afterApex = wrap01(t - apex) <= 0.5;
    const along = afterApex ? wrap01(t - apex) : wrap01(apex - t);
    // 90 m entry floor — 120 m was board-for-T1 too early on the main straight.
    const entryHalf = Math.max(span * 0.7, 90 / TRACK_LENGTH_M);
    const exitHalf = Math.max(span * 0.4, 55 / TRACK_LENGTH_M);
    const half = afterApex ? exitHalf : entryHalf;
    let apexW = Math.max(0, Math.min(1, 1 - along / Math.max(1e-4, half)));
    // Pin ~35 m around apex to min so short hairpins (T1) don't lerp soft.
    if (along < 35 / TRACK_LENGTH_M) apexW = Math.max(apexW, 0.97);
    const open =
      apexW < 0.12 ? seg.maxKph * OPEN_TRACK_BOOST : seg.maxKph;
    const segKph = open + (seg.minKph - open) * apexW * apexW;
    const humanCap = sampleHumanLutKph(t) * HUMAN_LUT_HEADROOM;
    lut[i] = kphToMps(Math.min(segKph, humanCap));
  }
  limitLut = lut;
  return lut;
};

export const sepangLocalLimitMps = (lapProgress: number): number => {
  const lut = buildLimitLut();
  const u = wrap01(lapProgress) * LUT_N;
  const i0 = Math.floor(u) % LUT_N;
  const i1 = (i0 + 1) % LUT_N;
  const f = u - Math.floor(u);
  return lut[i0] * (1 - f) + lut[i1] * f;
};

/**
 * Speed allowed NOW so every upcoming telemetry apex is reachable:
 * v² = v_limit(s)² + 2·a·dist
 */
export const sepangBrakingEnvelopeMps = (
  lapProgress: number,
  paceMul = 1,
  lookM = SEPANG_BRAKE_LOOK_M,
): number => {
  const lut = buildLimitLut();
  const t0 = wrap01(lapProgress);
  const metresPer = TRACK_LENGTH_M / LUT_N;
  const steps = Math.ceil(lookM / metresPer);
  let allowed = sepangLocalLimitMps(t0) * paceMul;
  const x = t0 * LUT_N;
  const first = Math.ceil(x);
  for (let j = 0; j <= steps; j++) {
    const idx = (first + j) % LUT_N;
    const distM = Math.max(0, (first + j - x) * metresPer - 8);
    const apex = lut[idx] * paceMul;
    const approach = Math.sqrt(
      apex * apex + 2 * SEPANG_BRAKE_PLAN_MPS2 * distM,
    );
    if (approach < allowed) allowed = approach;
  }
  return allowed;
};

/** Soft race straight ceiling (~330 km/h); AI multiplies by grip × DRS. */
export const SEPANG_RACE_STRAIGHT_MPS = kphToMps(330);
