import type { PitPhase } from "@/stores/raceStore";

/** Pit / box badge copy — intent (pendingBox) vs actual lane entry (isBoxing). */
export const pitStatusChip = (
  phase: PitPhase | null,
  hold: boolean,
  pendingBox: boolean,
  isBoxing: boolean,
): string | null => {
  if (!isBoxing && pendingBox) return "Box this lap";
  if (!isBoxing && !pendingBox) return null;
  if (phase === "in") return "In pit lane";
  if (phase === "stopped" && hold) return "Hold — traffic";
  if (phase === "stopped") return "In pits";
  if (phase === "out") return "Pit exit";
  return "In pits";
};

/** Longer pit wall copy for desktop HUD. */
export const pitPhaseLabel = (
  phase: PitPhase | null,
  hold: boolean,
  pendingBox: boolean,
  isBoxing: boolean,
): string | null => {
  if (!isBoxing && pendingBox) return "Box next lap — pit entry";
  if (!isBoxing && !pendingBox) return null;
  if (phase === "in") return "In pit lane";
  if (phase === "stopped" && hold) return "Hold — traffic";
  if (phase === "stopped") return "Servicing — tire change";
  if (phase === "out") return "Pit exit";
  return "In the pits";
};
