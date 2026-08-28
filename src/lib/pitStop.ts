import { getPitBoxT, getPitCurve, METRES_PER_UNIT } from "@/lib/trackCurve";

export const PIT_LANE_LIMIT_KMH = 60;
/** Peel-off handoff after leaving the racing line (then bleed down to pit limit). */
export const PIT_ENTRY_HANDOFF_KMH = 110;
export const PIT_STOP_DURATION_S = 2.4;
/** @deprecated Prefer pitProgressRate — kept for any residual imports. */
export const PIT_LANE_RATE = 0.07;
/** Another car in (boxT, boxT + gap] blocks release. */
export const PIT_UNSAFE_GAP = 0.07;
export const UNSAFE_RELEASE_PENALTY_MS = 10_000;
export const JACK_LIFT_M = 0.35;
/** Final metres before the box — crawl from limit to stop at the stall. */
export const PIT_BRAKE_ZONE_M = 28;
/** Soft flare toward exit mouth before race-line merge (km/h). */
export const PIT_EXIT_FLARE_KMH = 95;
/** Seconds from pit-exit merge to full race pace. */
export const PIT_EXIT_RACE_BLEND_S = 3.2;
/** Entry peel / exit blend fractions along pit CAD (long enough to read as peel-right). */
/** Shorter peel so the car reads on the pit road sooner (was 0.2). */
export const PIT_POSE_BLEND = 0.12;

export type PitPhase = "in" | "stopped" | "out";

export type TyreCompoundId = "soft" | "medium" | "hard" | "intermediate" | "wet";

/** Minimal car shape for pit helpers (avoids circular import with raceStore). */
export type PitCar = {
  id: string;
  isPlayer: boolean;
  isBoxing: boolean;
  finished: boolean;
  pitProgress: number;
  pitBoxIndex: number;
  pitPhase: PitPhase | null;
  pitStopElapsed: number;
  pitHoldTraffic: boolean;
  pitServiceDone: boolean;
  unsafeReleasePenaltyMs: number;
  tireWear: number;
  pendingCompound: TyreCompoundId | null;
  currentCompound: TyreCompoundId;
  pendingBox: boolean;
};

export const pitBoxTFor = (car: Pick<PitCar, "pitBoxIndex">): number => getPitBoxT(car.pitBoxIndex);

const kmhToUnitsPerSec = (kmh: number): number => {
  const metresPerSec = (kmh * 1000) / 3600;
  return metresPerSec / METRES_PER_UNIT;
};

const smooth01 = (k: number): number => {
  const x = Math.min(1, Math.max(0, k));
  return x * x * (3 - 2 * x);
};

/**
 * pitProgress delta/sec on the dedicated pit CAD.
 * In: peel soft → settle at 60 → long crawl into box.
 * Out: leave box crawl → 60 → soft flare near exit mouth.
 */
export const pitProgressRate = (
  phase: PitPhase,
  pitProgress: number,
  boxT: number,
): number => {
  const curve = getPitCurve();
  const lenU = Math.max(1e-3, curve.getLength());
  const limitRate = kmhToUnitsPerSec(PIT_LANE_LIMIT_KMH) / lenU;
  const handoffRate = kmhToUnitsPerSec(PIT_ENTRY_HANDOFF_KMH) / lenU;
  const flareRate = kmhToUnitsPerSec(PIT_EXIT_FLARE_KMH) / lenU;
  const brakeFrac = Math.min(0.28, (PIT_BRAKE_ZONE_M / METRES_PER_UNIT) / lenU);

  if (phase === "in") {
    const toBox = Math.max(0, boxT - pitProgress);
    // Long crawl into the stall — floor so we don't die short of the box
    if (toBox <= brakeFrac) {
      const k = smooth01(toBox / Math.max(brakeFrac, 1e-4));
      return Math.max(limitRate * 0.08, limitRate * (0.12 + 0.88 * k));
    }
    // Bleed handoff → 60 km/h over most of the run to the box
    const along = boxT > 1e-4 ? pitProgress / boxT : 1;
    if (along < 0.55) {
      const k = smooth01(along / 0.55);
      return handoffRate + (limitRate - handoffRate) * k;
    }
    return limitRate;
  }

  if (phase === "out") {
    const fromBox = Math.max(0, pitProgress - boxT);
    const runOut = Math.max(1e-4, 1 - boxT);
    const accelFrac = Math.min(0.28, brakeFrac * 1.35);
    if (fromBox < accelFrac) {
      const k = smooth01(fromBox / Math.max(accelFrac, 1e-4));
      return Math.max(limitRate * 0.1, limitRate * (0.1 + 0.9 * k));
    }
    // Last stretch toward pit exit: ease up from limit before race-line merge
    const alongOut = fromBox / runOut;
    if (alongOut > 0.62) {
      const k = smooth01((alongOut - 0.62) / 0.38);
      return limitRate + (flareRate - limitRate) * k;
    }
    return limitRate;
  }

  return 0;
};

/** Race-line speed multiplier after pit merge (0 = just exited, 1 = full pace). */
export const pitExitRaceScale = (blend01: number): number => {
  const k = smooth01(blend01);
  // ~pit-flare / race pace → 1.0
  return 0.28 + 0.72 * k;
};

/** True if another boxing car sits ahead in the unsafe release window. */
export const isPitReleaseBlocked = (cars: PitCar[], self: PitCar): boolean => {
  const boxT = pitBoxTFor(self);
  const lo = boxT + 0.001;
  const hi = boxT + PIT_UNSAFE_GAP;
  return cars.some((other) => {
    if (other.id === self.id || !other.isBoxing || other.finished) return false;
    const p = other.pitProgress;
    return p > lo && p <= hi;
  });
};

export const applyServiceComplete = <T extends PitCar>(car: T): T => {
  const next = { ...car };
  next.tireWear = 100;
  if (next.pendingCompound) {
    next.currentCompound = next.pendingCompound;
    next.pendingCompound = null;
  }
  next.pendingBox = false;
  return next;
};

export const beginPitExit = <T extends PitCar>(car: T, unsafe: boolean): T => ({
  ...car,
  pitPhase: "out",
  pitHoldTraffic: false,
  pitStopElapsed: car.pitStopElapsed,
  unsafeReleasePenaltyMs: car.unsafeReleasePenaltyMs + (unsafe ? UNSAFE_RELEASE_PENALTY_MS : 0),
});
