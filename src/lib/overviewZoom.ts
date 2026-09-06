/** Numbered overview follow zoom — tell the pit wall "zoom 2" etc. */
export const OVERVIEW_ZOOM_MIN = 1;
export const OVERVIEW_ZOOM_MAX = 5;
export const OVERVIEW_ZOOM_DEFAULT = 2;

export type OverviewZoomLevel =
  | typeof OVERVIEW_ZOOM_MIN
  | 2
  | 3
  | 4
  | typeof OVERVIEW_ZOOM_MAX;

export type OverviewZoomPose = {
  /** Camera height above target (world units). */
  height: number;
  /** Camera offset behind target along −look (world units). */
  back: number;
};

/**
 * 1 = close (cars readable), 5 = high bird's-eye (ants).
 * Default 2 — old hardcoded 100/85 was level≈5.
 */
export const OVERVIEW_ZOOM_BY_LEVEL: Record<OverviewZoomLevel, OverviewZoomPose> = {
  1: { height: 30, back: 24 },
  2: { height: 45, back: 36 },
  3: { height: 62, back: 52 },
  4: { height: 82, back: 70 },
  5: { height: 105, back: 90 },
};

export const clampOverviewZoomLevel = (n: number): OverviewZoomLevel => {
  const rounded = Math.round(n);
  if (rounded <= OVERVIEW_ZOOM_MIN) return OVERVIEW_ZOOM_MIN;
  if (rounded >= OVERVIEW_ZOOM_MAX) return OVERVIEW_ZOOM_MAX;
  return rounded as OverviewZoomLevel;
};

export const overviewZoomPose = (level: number): OverviewZoomPose =>
  OVERVIEW_ZOOM_BY_LEVEL[clampOverviewZoomLevel(level)];
