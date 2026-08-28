import type { ScenarioSnapshot } from "./scenarioRunner";

type SnapshotListener = (snap: ScenarioSnapshot, prev: ScenarioSnapshot | null) => void;

let listener: SnapshotListener | null = null;
let prevSnap: ScenarioSnapshot | null = null;

export const registerMissionSnapshotListener = (fn: SnapshotListener | null) => {
  listener = fn;
  if (!fn) prevSnap = null;
};

export const emitRaceSnapshot = (snap: ScenarioSnapshot) => {
  const prev = prevSnap;
  prevSnap = snap;
  listener?.(snap, prev);
};

export const resetMissionSnapshotPrev = () => {
  prevSnap = null;
};
