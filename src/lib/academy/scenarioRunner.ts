import type {
  MissionAction,
  MissionDef,
  MissionInject,
  MissionTrigger,
  RaceControlFlag,
} from "./types";

export type ScenarioSnapshot = {
  phase: string;
  elapsedMs: number;
  currentLap: number;
  lapProgress: number;
  pitPhase: string | null;
  pitHoldTraffic: boolean;
  pitServiceDone: boolean;
  isBoxing: boolean;
  raceControl: RaceControlFlag;
  startLightsOut: boolean;
};

export const triggerMatches = (
  trigger: MissionTrigger,
  snap: ScenarioSnapshot,
  prev: ScenarioSnapshot | null,
): boolean => {
  switch (trigger.kind) {
    case "onReady":
      return snap.phase === "ready" && prev?.phase !== "ready";
    case "onLightsOut":
      return snap.startLightsOut && !prev?.startLightsOut;
    case "onLap":
      return snap.currentLap >= trigger.lap && (prev?.currentLap ?? 0) < trigger.lap;
    case "onProgress":
      return (
        snap.currentLap === trigger.lap &&
        snap.lapProgress >= trigger.progress &&
        (prev == null ||
          prev.currentLap !== trigger.lap ||
          prev.lapProgress < trigger.progress)
      );
    case "onElapsed":
      return snap.elapsedMs >= trigger.ms && (prev?.elapsedMs ?? 0) < trigger.ms;
    case "onPitStopped":
      return (
        snap.isBoxing &&
        snap.pitPhase === "stopped" &&
        snap.pitServiceDone &&
        !(prev?.pitServiceDone && prev.pitPhase === "stopped")
      );
    case "onPitHoldTraffic":
      return (
        snap.pitHoldTraffic &&
        snap.pitPhase === "stopped" &&
        !prev?.pitHoldTraffic
      );
    case "onFinished":
      return snap.phase === "finished" && prev?.phase !== "finished";
    case "onControl":
      return snap.raceControl === trigger.flag && prev?.raceControl !== trigger.flag;
    default:
      return false;
  }
};

export const collectDueInjects = (
  mission: MissionDef,
  fired: Set<string>,
  snap: ScenarioSnapshot,
  prev: ScenarioSnapshot | null,
): MissionInject[] => {
  const due: MissionInject[] = [];
  for (const inject of mission.injects) {
    if (fired.has(inject.id)) continue;
    if (triggerMatches(inject.trigger, snap, prev)) due.push(inject);
  }
  return due;
};

export type ScenarioDispatch = {
  openCoach: (beatId: string) => void;
  setControl: (flag: RaceControlFlag) => void;
  clearControl: () => void;
  forceRain: (override: "auto" | "dry" | "light" | "heavy") => void;
  forceWear: (wear: number) => void;
  spawnPitTraffic: () => void;
  enableDrsZone: () => void;
  blueFlagPlayer: () => void;
  addPenalty: (kind: "plus5" | "plus10" | "driveThrough" | "stopGo" | "gridDrop") => void;
  finishRace: () => void;
};

export const applyMissionAction = (
  action: MissionAction,
  dispatch: ScenarioDispatch,
): void => {
  switch (action.type) {
    case "coach":
      dispatch.openCoach(action.beatId);
      break;
    case "setControl":
      dispatch.setControl(action.flag);
      break;
    case "clearControl":
      dispatch.clearControl();
      break;
    case "forceRain":
      dispatch.forceRain(action.override);
      break;
    case "forceWear":
      dispatch.forceWear(action.wear);
      break;
    case "spawnPitTraffic":
      dispatch.spawnPitTraffic();
      break;
    case "enableDrsZone":
      dispatch.enableDrsZone();
      break;
    case "blueFlagPlayer":
      dispatch.blueFlagPlayer();
      break;
    case "addPenalty":
      dispatch.addPenalty(action.kind);
      break;
    case "finishRace":
      dispatch.finishRace();
      break;
  }
};
