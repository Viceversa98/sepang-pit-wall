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

/** Grid sits just behind S/F — progress > 0.85 on lap 1 is still before the line. */
const GRID_GHOST_PROGRESS = 0.85;
const FIRST_LAP_MIN_MS = 2500;

/** Along-track distance for standings (handles lap-1 grid ghost near S/F). */
export const standingsDistance = (
  car: Pick<CarState, "currentLap" | "lapProgress" | "currentLapTimeMs">,
): number => {
  if (
    car.currentLap === 1 &&
    car.currentLapTimeMs < FIRST_LAP_MIN_MS &&
    car.lapProgress > GRID_GHOST_PROGRESS
  ) {
    return car.lapProgress - 1;
  }
  return car.currentLap + car.lapProgress;
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

/** Bleed speed when too close — avoids backward position snaps (caterpillar stutter). */
const applyGapSpeedCap = (
  car: CarState,
  ahead: CarState,
  gapM: number,
): void => {
  if (gapM <= 0 || gapM >= MIN_GAP_M) return;
  const shortfall = MIN_GAP_M - gapM;
  const cap = ahead.speedMps * (0.9 + 0.08 * (gapM / MIN_GAP_M)) - shortfall * 0.45;
  car.speedMps = Math.max(0, Math.min(car.speedMps, cap));
  if (shortfall > MIN_GAP_M * 0.55) {
    const capDist = raceDistance(ahead) - MIN_GAP_M / TRACK_LENGTH_M;
    if (raceDistance(car) > capDist + 0.00015) {
      setRaceDistance(car, capDist + 0.00015);
    }
  }
};

const setRaceDistance = (car: CarState, dist: number): void => {
  const safe = Math.max(1, dist);
  car.currentLap = Math.floor(safe);
  car.lapProgress = safe - car.currentLap;
  if (car.lapProgress >= 1) {
    car.currentLap += 1;
    car.lapProgress -= 1;
  }
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
        applyGapSpeedCap(car, nearest, nearestGap);
        car.laneTargetM = car.laneOffsetM;
      }
    } else {
      car.blockId = null;
      const pressure = detectLanePressure(next, car, false);
      car.laneTargetM = pickFreeRacingLine(next, car, pressure);
    }

    car.laneOffsetM = clampLane(car.laneOffsetM + (car.laneTargetM - car.laneOffsetM) * alpha);
  }

  // Second pass: enforce gap again after lane moves (same corridor only)
  for (const car of next) {
    if (car.finished || car.isBoxing || car.status === "retired") continue;
    for (const other of next) {
      if (other.id === car.id || other.finished || other.isBoxing || other.status === "retired")
        continue;
      if (!sameCorridor(car.laneOffsetM, other.laneOffsetM)) continue;
      const gap = alongGapM(car, other);
      if (gap > 0 && gap < MIN_GAP_M) {
        applyGapSpeedCap(car, other, gap);
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
