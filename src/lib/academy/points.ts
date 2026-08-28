/** FIA race points — top 10 score. Fastest lap bonus handled separately. */
export const RACE_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1] as const;

export const SPRINT_POINTS = [8, 7, 6, 5, 4, 3, 2, 1] as const;

export const pointsForPosition = (
  position: number,
  table: readonly number[] = RACE_POINTS,
): number => {
  if (position < 1 || position > table.length) return 0;
  return table[position - 1] ?? 0;
};

export const formatPointsTable = (table: readonly number[] = RACE_POINTS): string =>
  table.map((pts, i) => `P${i + 1}=${pts}`).join(" · ");
