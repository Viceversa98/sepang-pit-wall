import type { RaceControlFlag } from "@/lib/academy/types";

/** Approximate Sepang DRS: detect late lap, activate on main straight. */
export const DRS_DETECT_T = 0.82;
export const DRS_ZONE_START = 0.88;
export const DRS_ZONE_END = 0.98;
export const DRS_SPEED_MULT = 1.08;

export const controlSpeedMult = (flag: RaceControlFlag): number => {
  switch (flag) {
    case "yellow":
      return 0.72;
    case "doubleYellow":
      return 0.55;
    case "vsc":
      return 0.5;
    case "sc":
      return 0.42;
    case "red":
      return 0.15;
    case "chequered":
      return 0.35;
    default:
      return 1;
  }
};

export const isInDrsZone = (lapProgress: number): boolean =>
  lapProgress >= DRS_ZONE_START && lapProgress <= DRS_ZONE_END;

export const crossedDetection = (prev: number, next: number): boolean =>
  (prev < DRS_DETECT_T && next >= DRS_DETECT_T) ||
  (prev > next && (prev < DRS_DETECT_T || next >= DRS_DETECT_T));

export const PENALTY_MS: Record<string, number> = {
  plus5: 5_000,
  plus10: 10_000,
  driveThrough: 8_000,
  stopGo: 12_000,
  gridDrop: 0,
};
