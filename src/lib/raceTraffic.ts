import { FIA, TRACK_LENGTH_M } from "@/lib/trackCurve";
import { progressDelta } from "@/lib/trackProjection";
import { applyCollisions, curvatureAt, peakCurvatureAhead } from "@/lib/racePhysics";
import {
  DEFENSIVE_GAP_M,
  idealRacingLineOffsetM,
  outsideOvertakeOffsetM,
  type LanePressure,
} from "@/lib/racingLine";
import { gridSlotForCar, type CarState } from "@/stores/raceStore";

/** Minimum along-track gap (~1.5 car lengths). */
export const MIN_GAP_M = 8;
/** Start looking for a pass this far back on long straights. */
const OVERTAKE_TRIGGER_M = 42;
/** Lateral step when cutting to overtake (matches FIA grid lane). */
export const LANE_STEP_M = FIA.gridLaneOffsetM;
/** Keep full car width on asphalt (15 m track, 2 m car). */
export const MAX_LANE_M = FIA.trackWidthStartM / 2 - FIA.carWidthM / 2 - 0.45;
/** Furthest lateral step when hunting a pass — avoids kerb clipping. */
const OVERTAKE_LANE_M = Math.min(MAX_LANE_M, LANE_STEP_M * 1.75);
/** Same-lane if lateral centers closer than this. */
export const LANE_OVERLAP_M = FIA.carWidthM * 1.05;
/** Lane lerp rate (higher = snappier cut). */
const LANE_RESPONSIVENESS = 4.8;
/** Commit when a clear pass lane exists — moderate to avoid snap zig-zag. */
const LANE_OVERTAKE_RESPONSIVENESS = 6.2;
/** Lateral move (m) before gap-control uses target lane, not current. */
const LANE_CHANGE_COMMIT_M = 0.85;
/** Ease off grid stagger after lights out (ms). */
const GRID_RELEASE_MS = 5500;

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

/** Retired on circuit — stationary but still blocks traffic. */
export const isBrokenDownOnTrack = (
  car: Pick<CarState, "status" | "isBoxing" | "garageReturn">,
): boolean => car.status === "retired" && !car.isBoxing && !car.garageReturn;

/** Finished in pits / garage — invisible to on-track traffic. */
const isTrafficGhost = (car: CarState): boolean =>
  car.isBoxing || (car.finished && !isBrokenDownOnTrack(car));

/** Along-track gap in metres: positive if `ahead` is in front of `behind`. Wrap-aware at S/F. */
export const alongGapM = (
  behind: Pick<CarState, "currentLap" | "lapProgress">,
  ahead: Pick<CarState, "currentLap" | "lapProgress">,
): number => {
  if (behind.currentLap === ahead.currentLap) {
    return progressDelta(behind.lapProgress, ahead.lapProgress) * TRACK_LENGTH_M;
  }
  return (raceDistance(ahead) - raceDistance(behind)) * TRACK_LENGTH_M;
};

/** Nearest car ahead on track (optional progress override for the follower). */
export const nearestCarAhead = (
  cars: readonly CarState[],
  self: CarState,
  selfProgress = self.lapProgress,
): CarState | null => {
  let best: CarState | null = null;
  let bestGap = Infinity;
  for (const other of cars) {
    if (other.id === self.id || isTrafficGhost(other)) continue;
    const gap = alongGapM(
      { currentLap: self.currentLap, lapProgress: selfProgress },
      other,
    );
    if (gap > 0 && gap < bestGap) {
      bestGap = gap;
      best = other;
    }
  }
  return best;
};

const sameCorridor = (a: number, b: number): boolean => Math.abs(a - b) < LANE_OVERLAP_M;

const clampLane = (m: number): number => Math.max(-MAX_LANE_M, Math.min(MAX_LANE_M, m));

/** Once a pass starts, don't flip to the opposite side mid-move (causes rapid wall hits). */
const commitLaneTarget = (car: CarState, proposed: number): number => {
  const move = car.laneTargetM - car.laneOffsetM;
  if (Math.abs(move) < LANE_CHANGE_COMMIT_M) return clampLane(proposed);
  const proposedMove = proposed - car.laneOffsetM;
  if (Math.abs(proposedMove) < 0.3) return car.laneTargetM;
  if (Math.sign(proposedMove) !== Math.sign(move)) return car.laneTargetM;
  return clampLane(proposed);
};

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
  const before = car.speedMps;
  car.speedMps = Math.max(0, Math.min(car.speedMps, rateLimited));
  // Braking for traffic should light the rear lamp like any other braking.
  const decel = (before - car.speedMps) / Math.max(1e-4, dt);
  if (decel > 3) {
    car.brakeIntensity = Math.max(
      car.brakeIntensity,
      Math.min(1, decel / FOLLOW_MAX_DECEL_MPS2),
    );
  }
};

const corridorFree = (
  cars: CarState[],
  self: CarState,
  laneM: number,
  lookAheadM: number,
  ignoreId?: string,
): boolean => {
  for (const other of cars) {
    if (other.id === self.id || other.id === ignoreId || isTrafficGhost(other)) continue;
    if (!sameCorridor(laneM, other.laneOffsetM)) continue;
    const gap = alongGapM(self, other);
    if (gap > -MIN_GAP_M * 0.5 && gap < lookAheadM) return false;
  }
  return true;
};

const onStraight = (lapProgress: number): boolean => {
  const t = ((lapProgress % 1) + 1) % 1;
  return curvatureAt(t) < 0.12 && peakCurvatureAhead(t, 90) < 0.22;
};

/** Faster cars need more corridor look-ahead (push closes gaps before a cut can start). */
const overtakeLookAheadM = (lapProgress: number, speedMps: number): number => {
  const base = onStraight(lapProgress) ? 22 : MIN_GAP_M * 2;
  const speedScale = 0.75 + Math.min(1.35, speedMps / 75);
  return base * speedScale;
};

const overtakeTriggerM = (lapProgress: number): number =>
  onStraight(lapProgress) ? OVERTAKE_TRIGGER_M : MIN_GAP_M;

const isChangingLane = (car: CarState): boolean =>
  Math.abs(car.laneTargetM - car.laneOffsetM) > LANE_CHANGE_COMMIT_M;

/** Corridor for gap control — use target lane while committing to a pass. */
const gapControlLane = (car: CarState): number =>
  isChangingLane(car) ? car.laneTargetM : car.laneOffsetM;

const pickOvertakeLane = (
  cars: CarState[],
  self: CarState,
  blocker: CarState,
): number | null => {
  const current = self.laneOffsetM;
  const candidates: number[] = [];
  const straight = onStraight(self.lapProgress);
  const lookAhead = overtakeLookAheadM(self.lapProgress, self.speedMps);

  const outside = outsideOvertakeOffsetM(self.lapProgress);
  if (outside !== null) {
    candidates.push(outside);
  }

  if (straight) {
    candidates.push(
      OVERTAKE_LANE_M,
      -OVERTAKE_LANE_M,
      LANE_STEP_M * 1.5,
      -LANE_STEP_M * 1.5,
      LANE_STEP_M,
      -LANE_STEP_M,
    );
  }

  const awayFromBlocker = blocker.laneOffsetM >= 0 ? -LANE_STEP_M : LANE_STEP_M;
  candidates.push(
    awayFromBlocker,
    -awayFromBlocker,
    idealRacingLineOffsetM({
      lapProgress: self.lapProgress,
      carId: self.id,
      pressure: "attacking",
    }),
  );

  if (Math.abs(current) < 0.4) {
    candidates.push(-LANE_STEP_M, LANE_STEP_M);
  } else if (current < 0) {
    candidates.push(LANE_STEP_M, -LANE_STEP_M);
  } else {
    candidates.push(-LANE_STEP_M, LANE_STEP_M);
  }

  const seen = new Set<number>();
  const free: number[] = [];
  for (const lane of candidates) {
    const clamped = clampLane(lane);
    const key = Math.round(clamped * 20);
    if (seen.has(key)) continue;
    seen.add(key);
    if (sameCorridor(clamped, current) && Math.abs(clamped - current) < 0.35) continue;
    if (corridorFree(cars, self, clamped, lookAhead, blocker.id)) free.push(clamped);
  }
  if (free.length === 0) return null;
  free.sort((a, b) => Math.abs(a - current) - Math.abs(b - current));
  return free[0] ?? null;
};

/** Grid column lane at race start (for gradual release after lights out). */
const gridLaneFor = (car: CarState): number => gridLaneOffsetM(gridSlotForCar(car));

const blendGridRelease = (car: CarState, trafficLane: number, raceElapsedMs: number): number => {
  if (car.sfCrossedOnce || car.currentLap > 1 || raceElapsedMs >= GRID_RELEASE_MS) {
    return trafficLane;
  }
  const k = Math.min(1, raceElapsedMs / GRID_RELEASE_MS);
  const gridLane = gridLaneFor(car);
  return gridLane + (trafficLane - gridLane) * k;
};

const detectLanePressure = (
  cars: CarState[],
  self: CarState,
  blocked: boolean,
): LanePressure => {
  if (blocked) return "attacking";

  for (const other of cars) {
    if (other.id === self.id || isTrafficGhost(other)) continue;
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
  const look = onStraight(self.lapProgress) ? MIN_GAP_M * 1.4 : MIN_GAP_M * 1.1;
  if (corridorFree(cars, self, ideal, look)) return ideal;

  if (onStraight(self.lapProgress)) {
    for (const lane of [OVERTAKE_LANE_M, -OVERTAKE_LANE_M, LANE_STEP_M, -LANE_STEP_M]) {
      const clamped = clampLane(lane);
      if (corridorFree(cars, self, clamped, look)) return clamped;
    }
  }

  const center = 0;
  if (corridorFree(cars, self, center, MIN_GAP_M * 0.85)) return center;

  const nudge = clampLane(self.laneOffsetM + (ideal > self.laneOffsetM ? 0.65 : -0.65));
  if (corridorFree(cars, self, nudge, MIN_GAP_M * 0.75)) return nudge;

  return self.laneOffsetM;
};

/**
 * Soft racing traffic: keep min gap, cut to free lane to overtake, lerp lanes.
 * Mutates `cars` in place — no per-frame shallow copies.
 */
export const resolveTraffic = (
  cars: CarState[],
  dt: number,
  skipCollisions = false,
  raceElapsedMs = Infinity,
): CarState[] => {
  const baseAlpha = 1 - Math.exp(-LANE_RESPONSIVENESS * dt);
  const overtakeAlpha = 1 - Math.exp(-LANE_OVERTAKE_RESPONSIVENESS * dt);

  for (const car of cars) {
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
      car.laneOffsetM = clampLane(car.laneOffsetM + (car.laneTargetM - car.laneOffsetM) * baseAlpha);
      car.blockId = null;
      continue;
    }

    // Nearest car ahead in our corridor
    let nearest: CarState | null = null;
    let nearestGap = Infinity;
    for (const other of cars) {
      if (other.id === car.id || isTrafficGhost(other)) continue;
      if (!sameCorridor(car.laneOffsetM, other.laneOffsetM)) continue;
      const gap = alongGapM(car, other);
      if (gap > 0 && gap < nearestGap) {
        nearestGap = gap;
        nearest = other;
      }
    }

    // On straights, react to the next car ahead even in another lane.
    let nearestAny: CarState | null = null;
    let nearestAnyGap = Infinity;
    if (onStraight(car.lapProgress)) {
      for (const other of cars) {
        if (other.id === car.id || isTrafficGhost(other)) continue;
        const gap = alongGapM(car, other);
        if (gap > 0 && gap < nearestAnyGap) {
          nearestAnyGap = gap;
          nearestAny = other;
        }
      }
    }

    const passTarget =
      nearestAny !== null && nearestAnyGap < OVERTAKE_TRIGGER_M ? nearestAny : nearest;
    const passGap = passTarget === nearestAny ? nearestAnyGap : nearestGap;
    const triggerM = passTarget
      ? isBrokenDownOnTrack(passTarget)
        ? FOLLOW_RANGE_M
        : overtakeTriggerM(car.lapProgress)
      : MIN_GAP_M;
    const blocked = passTarget !== null && passGap < triggerM;
    let alpha = baseAlpha;
    if (blocked && passTarget) {
      car.blockId = passTarget.id;
      const cut = pickOvertakeLane(cars, car, passTarget);
      if (cut !== null) {
        car.laneTargetM = blendGridRelease(
          car,
          commitLaneTarget(car, cut),
          raceElapsedMs,
        );
        alpha = overtakeAlpha;
      } else if (isChangingLane(car)) {
        // Finish the move already in progress — don't flip while mid-pass.
        car.laneTargetM = blendGridRelease(car, car.laneTargetM, raceElapsedMs);
        alpha = overtakeAlpha;
      } else {
        // No clear corridor — hold lane and follow; don't hunt side-to-side.
        car.laneTargetM = blendGridRelease(car, car.laneOffsetM, raceElapsedMs);
        alpha = baseAlpha;
        if (passGap < MIN_GAP_M) {
          applyGapSpeedCap(car, passTarget, passGap, dt);
        }
      }
    } else {
      car.blockId = null;
      const pressure = detectLanePressure(cars, car, false);
      car.laneTargetM = blendGridRelease(
        car,
        pickFreeRacingLine(cars, car, pressure),
        raceElapsedMs,
      );
    }

    car.laneOffsetM = clampLane(car.laneOffsetM + (car.laneTargetM - car.laneOffsetM) * alpha);
  }

  // Second pass: enforce gap again after lane moves (same corridor only).
  // Uses the full follow range so closing speed tapers before MIN_GAP.
  for (const car of cars) {
    if (car.finished || car.isBoxing || car.status === "retired") continue;
    const selfLane = gapControlLane(car);
    const passing = isChangingLane(car);
    for (const other of cars) {
      if (other.id === car.id || isTrafficGhost(other)) continue;
      if (passing && other.id === car.blockId) continue;
      if (!sameCorridor(selfLane, other.laneOffsetM)) continue;
      const gap = alongGapM(car, other);
      if (gap > 0 && gap < FOLLOW_RANGE_M) {
        applyGapSpeedCap(car, other, gap, dt);
      }
    }
  }

  // Closing-speed contacts → damage / spin / retire (skip at lights out while bodies settle)
  if (!skipCollisions) {
    applyCollisions(cars);
  }
  for (const car of cars) {
    if (car.status === "retired" && !car.finished) {
      car.finished = true;
      car.speedMps = 0;
    }
  }

  return cars;
};

/** Grid stagger: odd/even columns match getGridSlot (±FIA.gridLaneOffsetM). */
export const gridLaneOffsetM = (index: number): number =>
  (index % 2 === 0 ? -1 : 1) * FIA.gridLaneOffsetM;
