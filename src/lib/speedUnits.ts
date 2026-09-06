/**
 * HUD / telemetry speed display unit.
 * Physics + AI always use m/s internally — only flip this for what players see.
 *
 * Change here → "mph" for miles per hour, "kph" for km/h.
 */
export type SpeedDisplayUnit = "kph" | "mph";

export const SPEED_DISPLAY_UNIT: SpeedDisplayUnit = "kph";

const MPS_TO_KPH = 3.6;
const MPS_TO_MPH = 2.23693629;

export const speedUnitLabel = (unit: SpeedDisplayUnit = SPEED_DISPLAY_UNIT): string =>
  unit === "mph" ? "mph" : "km/h";

/** Real along-track m/s → display number in SPEED_DISPLAY_UNIT. */
export const gameSpeedToDisplay = (
  speedMps: number,
  unit: SpeedDisplayUnit = SPEED_DISPLAY_UNIT,
): number =>
  Math.max(0, speedMps * (unit === "mph" ? MPS_TO_MPH : MPS_TO_KPH));

/** @deprecated Prefer gameSpeedToDisplay — respects SPEED_DISPLAY_UNIT. */
export const gameSpeedToDisplayKmh = (speedMps: number): number =>
  gameSpeedToDisplay(speedMps, "kph");
