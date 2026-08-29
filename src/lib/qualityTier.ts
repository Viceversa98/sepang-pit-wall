export type QualityTier = "high" | "mobile";

export type RaceSceneQuality = {
  tier: QualityTier;
  dprCap: number;
  antialias: boolean;
  shadows: boolean;
  shadowMapSize: number;
  rainCount: number;
};

const HIGH_QUALITY: RaceSceneQuality = {
  tier: "high",
  dprCap: 1.5,
  antialias: true,
  shadows: true,
  shadowMapSize: 2048,
  rainCount: 3200,
};

const MOBILE_QUALITY: RaceSceneQuality = {
  tier: "mobile",
  dprCap: 1.5,
  antialias: true,
  shadows: false,
  shadowMapSize: 0,
  rainCount: 1800,
};

export const detectRaceSceneQuality = (): RaceSceneQuality => {
  if (typeof window === "undefined") return HIGH_QUALITY;

  const narrow = window.matchMedia("(max-width: 767px)").matches;
  const lowMemory =
    typeof navigator !== "undefined" &&
    "deviceMemory" in navigator &&
    (navigator as Navigator & { deviceMemory?: number }).deviceMemory !== undefined &&
    ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8) <= 4;

  // Touch ≠ weak GPU — only narrow viewports and low-RAM devices get the mobile tier.
  if (narrow || lowMemory) return MOBILE_QUALITY;
  return HIGH_QUALITY;
};
