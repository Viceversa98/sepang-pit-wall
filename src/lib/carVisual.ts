import { TRACK_LENGTH_M } from "@/lib/trackCurve";
import type { CarState } from "@/stores/raceStore";

export type CarVisualPose = {
  lapProgress: number;
  laneOffsetM: number;
  pitProgress: number;
};

const wrap01 = (t: number): number => ((t % 1) + 1) % 1;

/** Shortest delta along lap fraction (handles S/F wrap). */
const lapProgressDelta = (from: number, to: number): number => {
  let d = wrap01(to) - wrap01(from);
  if (d > 0.5) d -= 1;
  if (d < -0.5) d += 1;
  return d;
};

/**
 * Predict along-track motion from speed, then lightly correct toward sim state.
 * Avoids the rubber-band feel of pure exponential smoothing.
 */
export const stepCarVisual = (
  visual: CarVisualPose,
  car: Pick<
    CarState,
    "lapProgress" | "laneOffsetM" | "pitProgress" | "isBoxing" | "speedMps"
  >,
  delta: number,
  initialized: boolean,
): CarVisualPose => {
  const dt = Math.min(delta, 0.05);
  if (!initialized || car.isBoxing) {
    return {
      lapProgress: car.lapProgress,
      laneOffsetM: car.laneOffsetM,
      pitProgress: car.pitProgress,
    };
  }

  if (Math.abs(lapProgressDelta(visual.lapProgress, car.lapProgress)) > 0.08) {
    return {
      lapProgress: car.lapProgress,
      laneOffsetM: car.laneOffsetM,
      pitProgress: car.pitProgress,
    };
  }

  const progressRate = Math.max(0, car.speedMps) / TRACK_LENGTH_M;
  let lapProgress = wrap01(visual.lapProgress + progressRate * dt);
  lapProgress = wrap01(
    lapProgress + lapProgressDelta(lapProgress, car.lapProgress) * Math.min(1, 18 * dt),
  );

  const laneOffsetM =
    visual.laneOffsetM + (car.laneOffsetM - visual.laneOffsetM) * Math.min(1, 16 * dt);

  return {
    lapProgress,
    laneOffsetM,
    pitProgress: car.pitProgress,
  };
};
