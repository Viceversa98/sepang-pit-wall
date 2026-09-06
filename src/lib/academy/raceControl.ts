import type { RaceControlFlag } from "@/lib/academy/types";

/**
 * Sepang DRS zones (lap fraction):
 * - Kuala Lumpur / main straight (wraps S/F toward T1)
 * - Penang / back straight into T15
 */
export const DRS_ZONES = [
  { start: 0.93, end: 0.08 },
  { start: 0.84, end: 0.9 },
] as const;

/** @deprecated Prefer DRS_ZONES — kept for older single-zone callers. */
export const DRS_DETECT_T = 0.92;
export const DRS_ZONE_START = 0.93;
export const DRS_ZONE_END = 0.08;
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

const inZone = (t: number, start: number, end: number): boolean =>
  start <= end ? t >= start && t <= end : t >= start || t <= end;

export const isInDrsZone = (lapProgress: number): boolean => {
  const t = ((lapProgress % 1) + 1) % 1;
  return DRS_ZONES.some((z) => inZone(t, z.start, z.end));
};

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
