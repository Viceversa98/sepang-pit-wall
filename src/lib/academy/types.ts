export type RuleChapterId =
  | "weekend-start"
  | "flags"
  | "safety"
  | "tyres"
  | "pits"
  | "weather"
  | "overtaking"
  | "penalties"
  | "points"
  | "edge";

export type RaceControlFlag =
  | "green"
  | "yellow"
  | "doubleYellow"
  | "sc"
  | "vsc"
  | "red"
  | "blue"
  | "white"
  | "blackOrange"
  | "black"
  | "chequered";

export type PenaltyKind = "plus5" | "plus10" | "driveThrough" | "stopGo" | "gridDrop";

export type WeatherOverrideLite = "auto" | "dry" | "light" | "heavy";

export type TyreCompoundLite =
  | "soft"
  | "medium"
  | "hard"
  | "intermediate"
  | "wet";

export type ChoiceEffect =
  | { type: "none" }
  | { type: "setCompound"; compound: TyreCompoundLite }
  | { type: "requestBox" }
  | { type: "releaseSafe" }
  | { type: "releaseUnsafe" }
  | { type: "setEngine"; mode: "push" | "standard" | "save" }
  | { type: "setControl"; flag: RaceControlFlag }
  | { type: "clearControl" }
  | { type: "addPenalty"; kind: PenaltyKind }
  | { type: "abortStart" }
  | { type: "goRacing" };

export type PlayerChoice = {
  id: string;
  label: string;
  correct: boolean;
  feedback: string;
  effect?: ChoiceEffect;
};

export type CoachBeat = {
  id: string;
  title: string;
  body: string;
  choices: PlayerChoice[];
};

export type MissionTrigger =
  | { kind: "onReady" }
  | { kind: "onLightsOut" }
  | { kind: "onLap"; lap: number }
  | { kind: "onProgress"; lap: number; progress: number }
  | { kind: "onElapsed"; ms: number }
  | { kind: "onPitStopped" }
  | { kind: "onPitHoldTraffic" }
  | { kind: "onFinished" }
  | { kind: "onControl"; flag: RaceControlFlag };

export type MissionAction =
  | { type: "coach"; beatId: string }
  | { type: "setControl"; flag: RaceControlFlag }
  | { type: "clearControl" }
  | { type: "forceRain"; override: WeatherOverrideLite }
  | { type: "forceWear"; wear: number }
  | { type: "spawnPitTraffic" }
  | { type: "enableDrsZone" }
  | { type: "blueFlagPlayer" }
  | { type: "addPenalty"; kind: PenaltyKind }
  | { type: "finishRace" };

export type MissionInject = {
  id: string;
  trigger: MissionTrigger;
  action: MissionAction;
};

export type MissionSetup = {
  totalLaps: number;
  weatherOverride?: WeatherOverrideLite;
  startCompound?: TyreCompoundLite;
  /** Skip grid-ready banner and begin lights after a short settle. */
  autoBegin?: boolean;
};

export type MissionDef = {
  id: string;
  chapterId: RuleChapterId;
  title: string;
  learnLine: string;
  debriefPass: string;
  debriefFail: string;
  setup: MissionSetup;
  beats: CoachBeat[];
  injects: MissionInject[];
  /** Beat ids that must be answered correctly to pass. */
  requiredCorrectBeatIds: string[];
};

export type ChapterDef = {
  id: RuleChapterId;
  title: string;
  blurb: string;
  missionIds: string[];
};

export type MissionResult = {
  missionId: string;
  passed: boolean;
  stars: 0 | 1 | 2 | 3;
  correctCount: number;
  totalRequired: number;
};

export type BeatAnswer = {
  beatId: string;
  choiceId: string;
  correct: boolean;
};
