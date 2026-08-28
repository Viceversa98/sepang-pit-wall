import {
  curvatureAt,
  peakCurvatureAhead,
  turnSignAt,
} from "@/lib/racePhysics";

export type LanePressure = "neutral" | "defending" | "attacking";

export type RacingLineInput = {
  lapProgress: number;
  carId: string;
  pressure: LanePressure;
};

const smooth01 = (k: number): number => {
  const x = Math.min(1, Math.max(0, k));
  return x * x * (3 - 2 * x);
};

/** Per-car slight straight-line preference so the field does not stack identically. */
const lineBiasForCar = (carId: string): number => {
  let h = 0;
  for (let i = 0; i < carId.length; i += 1) {
    h = (h * 31 + carId.charCodeAt(i)) | 0;
  }
  return ((Math.abs(h) % 180) / 90 - 1) * 0.55;
};

/**
 * Ideal lateral offset (m) from centreline — outside entry, inside apex, outside exit.
 * Positive offset follows the same side vector as `carPose` (+ = driver right on track).
 */
export const idealRacingLineOffsetM = (input: RacingLineInput): number => {
  const t = ((input.lapProgress % 1) + 1) % 1;
  const kNow = curvatureAt(t);
  const kAhead = peakCurvatureAhead(t, 55);
  const kFar = peakCurvatureAhead(t, 110);
  const turn = turnSignAt(t);

  const straight = kNow < 0.11 && kAhead < 0.22;
  if (straight) {
    const wideStraight = kFar < 0.18 ? 1.35 : 0.75;
    return lineBiasForCar(input.carId) * wideStraight;
  }

  if (turn === 0) {
    return lineBiasForCar(input.carId) * 0.6;
  }

  const approaching = kNow < 0.18 && kAhead > kNow + 0.08;
  const atApex = kNow > 0.28;
  const leaving = kNow > 0.2 && kAhead < kNow * 0.72;

  const entryF = approaching ? smooth01((kAhead - kNow) / 0.45) : 0;
  const apexF = atApex ? smooth01((kNow - 0.22) / 0.55) : 0;
  const exitF = leaving ? smooth01((kNow - kAhead) / 0.4) : 0;

  let offset = 0;
  offset += -turn * entryF * 3.1;
  offset += turn * apexF * 2.1;
  offset += -turn * exitF * 2.7;

  if (input.pressure === "defending") {
    offset += turn * (0.85 + apexF * 0.55);
    offset *= 0.82;
  } else if (input.pressure === "attacking") {
    offset += -turn * (entryF * 1.15 + exitF * 0.65);
  }

  offset += lineBiasForCar(input.carId) * 0.35;
  return offset;
};

/** Outside-of-corner lane for dive moves (m). */
export const outsideOvertakeOffsetM = (lapProgress: number): number | null => {
  const turn = turnSignAt(lapProgress);
  if (turn === 0) return null;
  const k = curvatureAt(lapProgress);
  const kAhead = peakCurvatureAhead(lapProgress, 45);
  if (k < 0.14 && kAhead < 0.26) return null;
  return -turn * 3.25;
};

/** How far behind (m) counts as defensive pressure. */
export const DEFENSIVE_GAP_M = 16;
