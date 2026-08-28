import { FIA, TRACK_LENGTH_M } from "@/lib/trackCurve";
import { applyCollisions } from "@/lib/racePhysics";
import {
  DEFENSIVE_GAP_M,
  idealRacingLineOffsetM,
  outsideOvertakeOffsetM,
  type LanePressure,
} from "@/lib/racingLine";
import type { CarState } from "@/stores/raceStore";

/** Minimum along-track gap (~1.5 car lengths). */
export const MIN_GAP_M = 8;
/** Lateral step when cutting to overtake (matches FIA grid lane). */
export const LANE_STEP_M = FIA.gridLaneOffsetM;
/** Keep cars inside ~15 m start width minus half car. */
export const MAX_LANE_M = 5.5;
/** Same-lane if lateral centers closer than this. */
export const LANE_OVERLAP_M = FIA.carWidthM * 1.15;
/** Lane lerp rate (higher = snappier cut). */
const LANE_RESPONSIVENESS = 4.5;

/** Max distance behind S/F where the staggered grid still sits (10 rows + buffer). */
const GRID_DEPTH_M = FIA.gridFrontGapM + 9 * FIA.gridRowSpacingM + 12;

/** True while the car is still on the pre-start grid (behind S/F, lap 1). */
export const isOnStartingGrid = (
  car: Pick<CarState, "lapProgress" | "currentLap">,
): boolean => {
  if (car.currentLap !== 1) return false;
  const behindM = ((((1 - car.lapProgress) % 1) + 1) % 1) * TRACK_LENGTH_M;
  return behindM <= GRID_DEPTH_M;
};

/** Along-track distance for standings. Pre-race only: order grid rows behind S/F. */
export const standingsDistance = (
  car: Pick<CarState, "currentLap" | "lapProgress" | "currentLapTimeMs">,
  gridOrder = false,
): number => {
  if (gridOrder && isOnStartingGrid(car)) {
    return car.lapProgress - 1;
  }
  // Lap 1: wrap01() at S/F can run before currentLap increments (MIN_LAP_MS gate).
  let lap = car.currentLap;
  if (lap === 1 && !isOnStartingGrid(car) && car.lapProgress < 0.5) {
    lap = 2;
  }
  return lap + car.lapProgress;
};

export const raceDistance = (car: Pick<CarState, "currentLap" | "lapProgress">): number =>
  car.currentLap + car.lapProgress;

/** Along-track gap in metres: positive if `ahead` is in front of `behind`. */
export const alongGapM = (
  behind: Pick<CarState, "currentLap" | "lapProgress">,
  ahead: Pick<CarState, "currentLap" | "lapProgress">,
): number => (raceDistance(ahead) - raceDistance(behind)) * TRACK_LENGTH_M;

const sameCorridor = (a: number, b: number): boolean => Math.abs(a - b) < LANE_OVERLAP_M;

const clampLane = (m: number): number => Math.max(-MAX_LANE_M, Math.min(MAX_LANE_M, m));

/** Range where followers start tapering their closing speed. */
export const FOLLOW_RANGE_M = 60;
/** Planned follower decel when closing on a car ahead (m/s²). */
const FOLLOW_BRAKE_MPS2 = 26;
/** Hard ceiling on gap-control decel per frame — keeps braking physical (no speed teleports). */
const FOLLOW_MAX_DECEL_MPS2 = 45;

/**
 * Anticipatory gap control, speed-only (never snaps position — snaps caused
 * the caterpillar accordion). Outside MIN_GAP the closing speed tapers with
 * braking distance (sqrt envelope); inside MIN_GAP the follower drops below
 * the leader's pace to reopen the gap. The cap is rate-limited so a follower
 * can never lose more speed per frame than real brakes allow — instant
 * clamps were the shockwave that rippled down car trains.
 */
const applyGapSpeedCap = (
  car: CarState,
  ahead: CarState,
  gapM: number,
  dt: number,
): void => {
  if (gapM <= 0 || gapM >= FOLLOW_RANGE_M) return;
  let cap: number;
  if (gapM > MIN_GAP_M) {
    const margin = gapM - MIN_GAP_M;
    cap = Math.sqrt(ahead.speedMps * ahead.speedMps + 2 * FOLLOW_BRAKE_MPS2 * margin);
  } else {
    cap = ahead.speedMps * (0.7 + 0.3 * (gapM / MIN_GAP_M));
  }
  const rateLimited = Math.max(cap, car.speedMps - FOLLOW_MAX_DECEL_MPS2 * dt);
  car.speedMps = Math.max(0, Math.min(car.speedMps, rateLimited));
};

const corridorFree = (
  cars: CarState[],
  self: CarState,
  laneM: number,
  lookAheadM: number,
): boolean => {
  const selfDist = raceDistance(self);
  for (const other of cars) {
    if (other.id === self.id || other.finished || other.isBoxing) continue;
    if (!sameCorridor(laneM, other.laneOffsetM)) continue;
    const gap = (raceDistance(other) - selfDist) * TRACK_LENGTH_M;
    // Blocked if someone in this corridor within look-ahead ahead or half car behind
    if (gap > -MIN_GAP_M * 0.5 && gap < lookAheadM) return false;
  }
  return true;
};

const pickOvertakeLane = (cars: CarState[], self: CarState): number | null => {
  const current = self.laneOffsetM;
  const candidates: number[] = [];

  const outside = outsideOvertakeOffsetM(self.lapProgress);
  if (outside !== null) {
    candidates.push(outside);
  }

  if (Math.abs(current) < 0.4) {
    candidates.push(-LANE_STEP_M, LANE_STEP_M);
  } else if (current < 0) {
    candidates.push(-LANE_STEP_M, LANE_STEP_M, idealRacingLineOffsetM({
      lapProgress: self.lapProgress,
      carId: self.id,
      pressure: "attacking",
    }));
  } else {
    candidates.push(LANE_STEP_M, -LANE_STEP_M, idealRacingLineOffsetM({
      lapProgress: self.lapProgress,
      carId: self.id,
      pressure: "attacking",
    }));
  }

  for (const lane of candidates) {
    const clamped = clampLane(lane);
    if (sameCorridor(clamped, current) && Math.abs(clamped - current) < 0.3) continue;
    if (corridorFree(cars, self, clamped, MIN_GAP_M * 1.25)) return clamped;
  }
  return null;
};

const detectLanePressure = (
  cars: CarState[],
  self: CarState,
  blocked: boolean,
): LanePressure => {
  if (blocked) return "attacking";

  for (const other of cars) {
    if (other.id === self.id || other.finished || other.isBoxing) continue;
    if (!sameCorridor(self.laneOffsetM, other.laneOffsetM)) continue;
    const gap = alongGapM(other, self);
    if (gap > 0 && gap < DEFENSIVE_GAP_M) return "defending";
  }
  return "neutral";
};

const pickFreeRacingLine = (cars: CarState[], self: CarState, pressure: LanePressure): number => {
  const ideal = clampLane(
    idealRacingLineOffsetM({
      lapProgress: self.lapProgress,
      carId: self.id,
      pressure,
    }),
  );
  if (corridorFree(cars, self, ideal, MIN_GAP_M * 1.1)) return ideal;

  const center = 0;
  if (corridorFree(cars, self, center, MIN_GAP_M * 0.85)) return center;

  const nudge = clampLane(self.laneOffsetM + (ideal > self.laneOffsetM ? 0.45 : -0.45));
  if (corridorFree(cars, self, nudge, MIN_GAP_M * 0.75)) return nudge;

  return self.laneOffsetM;
};

/**
 * Soft racing traffic: keep min gap, cut to free lane to overtake, lerp lanes.
 * Mutates and returns a new cars array (shallow copies per car).
 */
export const resolveTraffic = (cars: CarState[], dt: number, skipCollisions = false): CarState[] => {
  const next = cars.map((c) => ({ ...c }));
  const alpha = 1 - Math.exp(-LANE_RESPONSIVENESS * dt);

  for (const car of next) {
    if (car.finished || car.status === "retired") {
      car.blockId = null;
      if (car.status === "retired") {
        car.speedMps = 0;
        car.finished = true;
      }
      continue;
    }

    if (car.isBoxing) {
      car.laneTargetM = 0;
      car.laneOffsetM = clampLane(car.laneOffsetM + (car.laneTargetM - car.laneOffsetM) * alpha);
      car.blockId = null;
      continue;
    }

    // Hold staggered grid lanes until the field crosses S/F — avoid snapping to centre on lights out.
    if (isOnStartingGrid(car)) {
      car.laneTargetM = car.laneOffsetM;
      car.blockId = null;
      continue;
    }

    // Nearest car ahead in our corridor
    let nearest: CarState | null = null;
    let nearestGap = Infinity;
    for (const other of next) {
      if (other.id === car.id || other.finished || other.isBoxing) continue;
      if (!sameCorridor(car.laneOffsetM, other.laneOffsetM)) continue;
      const gap = alongGapM(car, other);
      if (gap > 0 && gap < nearestGap) {
        nearestGap = gap;
        nearest = other;
      }
    }

    const blocked = nearest !== null && nearestGap < MIN_GAP_M;
    if (blocked && nearest) {
      car.blockId = nearest.id;
      const cut = pickOvertakeLane(next, car);
      if (cut !== null) {
        car.laneTargetM = cut;
      } else {
        applyGapSpeedCap(car, nearest, nearestGap, dt);
        car.laneTargetM = car.laneOffsetM;
      }
    } else {
      car.blockId = null;
      const pressure = detectLanePressure(next, car, false);
      car.laneTargetM = pickFreeRacingLine(next, car, pressure);
    }

    car.laneOffsetM = clampLane(car.laneOffsetM + (car.laneTargetM - car.laneOffsetM) * alpha);
  }

  // Second pass: enforce gap again after lane moves (same corridor only).
  // Uses the full follow range so closing speed tapers before MIN_GAP.
  for (const car of next) {
    if (car.finished || car.isBoxing || car.status === "retired") continue;
    for (const other of next) {
      if (other.id === car.id || other.finished || other.isBoxing || other.status === "retired")
        continue;
      if (!sameCorridor(car.laneOffsetM, other.laneOffsetM)) continue;
      const gap = alongGapM(car, other);
      if (gap > 0 && gap < FOLLOW_RANGE_M) {
        applyGapSpeedCap(car, other, gap, dt);
      }
    }
  }

  // Closing-speed contacts → damage / spin / retire (skip at lights out while bodies settle)
  if (!skipCollisions) {
    applyCollisions(next);
  }
  for (const car of next) {
    if (car.status === "retired" && !car.finished) {
      car.finished = true;
      car.speedMps = 0;
    }
  }

  return next;
};

/** Grid stagger: odd/even columns match getGridSlot (±FIA.gridLaneOffsetM). */
export const gridLaneOffsetM = (index: number): number =>
  (index % 2 === 0 ? -1 : 1) * FIA.gridLaneOffsetM;
