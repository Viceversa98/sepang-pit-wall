import { createStore } from "@/stores/createStore";
import {
  getMission,
  isMissionUnlocked,
  nextMissionId,
} from "@/lib/academy/curriculum";
import type {
  BeatAnswer,
  MissionResult,
  PlayerChoice,
} from "@/lib/academy/types";

const STORAGE_KEY = "sepang-academy-progress-v1";

export type AcademyScreen = "landing" | "hub" | "debrief";

type Persisted = {
  completedIds: string[];
  starsByMission: Record<string, 0 | 1 | 2 | 3>;
};

const loadPersisted = (): Persisted => {
  if (typeof window === "undefined") return { completedIds: [], starsByMission: {} };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { completedIds: [], starsByMission: {} };
    const parsed = JSON.parse(raw) as Persisted;
    return {
      completedIds: Array.isArray(parsed.completedIds) ? parsed.completedIds : [],
      starsByMission: parsed.starsByMission ?? {},
    };
  } catch {
    return { completedIds: [], starsByMission: {} };
  }
};

const savePersisted = (completedIds: string[], starsByMission: Record<string, 0 | 1 | 2 | 3>) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ completedIds, starsByMission } satisfies Persisted),
  );
};

type AcademyStore = {
  screen: AcademyScreen;
  completedIds: string[];
  starsByMission: Record<string, 0 | 1 | 2 | 3>;
  activeMissionId: string | null;
  activeBeatId: string | null;
  coachOpen: boolean;
  answers: BeatAnswer[];
  lastResult: MissionResult | null;
  firedInjectIds: string[];

  openHub: () => void;
  closeHubToLanding: () => void;
  setActiveMission: (missionId: string) => void;
  clearMissionSession: () => void;
  openCoach: (beatId: string) => void;
  closeCoach: () => void;
  answerBeat: (choice: PlayerChoice) => void;
  markInjectFired: (injectId: string) => void;
  finishMissionSession: () => MissionResult | null;
  hydrate: () => void;
  completedSet: () => Set<string>;
  isUnlocked: (missionId: string) => boolean;
  nextId: () => string | null;
};

const initial = loadPersisted();

export const useAcademyStore = createStore<AcademyStore>((set, get) => ({
  screen: "landing",
  completedIds: initial.completedIds,
  starsByMission: initial.starsByMission,
  activeMissionId: null,
  activeBeatId: null,
  coachOpen: false,
  answers: [],
  lastResult: null,
  firedInjectIds: [],

  hydrate: () => {
    const data = loadPersisted();
    set({ completedIds: data.completedIds, starsByMission: data.starsByMission });
  },

  openHub: () => set({ screen: "hub", lastResult: null }),

  closeHubToLanding: () =>
    set({
      screen: "landing",
      activeMissionId: null,
      activeBeatId: null,
      coachOpen: false,
      answers: [],
      firedInjectIds: [],
      lastResult: null,
    }),

  setActiveMission: (missionId) =>
    set({
      activeMissionId: missionId,
      activeBeatId: null,
      coachOpen: false,
      answers: [],
      firedInjectIds: [],
      lastResult: null,
      screen: "landing",
    }),

  clearMissionSession: () =>
    set({
      activeMissionId: null,
      activeBeatId: null,
      coachOpen: false,
      answers: [],
      firedInjectIds: [],
    }),

  openCoach: (beatId) => set({ coachOpen: true, activeBeatId: beatId }),

  closeCoach: () => set({ coachOpen: false, activeBeatId: null }),

  answerBeat: (choice) => {
    const beatId = get().activeBeatId;
    if (!beatId) return;
    const answers = [
      ...get().answers.filter((a) => a.beatId !== beatId),
      { beatId, choiceId: choice.id, correct: choice.correct },
    ];
    set({ answers, coachOpen: false, activeBeatId: null });
  },

  markInjectFired: (injectId) => {
    if (get().firedInjectIds.includes(injectId)) return;
    set({ firedInjectIds: [...get().firedInjectIds, injectId] });
  },

  finishMissionSession: () => {
    const missionId = get().activeMissionId;
    if (!missionId) return null;
    const mission = getMission(missionId);
    if (!mission) return null;

    const answers = get().answers;
    let correctCount = 0;
    for (const beatId of mission.requiredCorrectBeatIds) {
      if (answers.some((a) => a.beatId === beatId && a.correct)) correctCount += 1;
    }
    const totalRequired = mission.requiredCorrectBeatIds.length;
    const passed = correctCount >= totalRequired && totalRequired > 0;
    const ratio = totalRequired === 0 ? 1 : correctCount / totalRequired;
    const stars = (passed ? (ratio >= 1 ? 3 : ratio >= 0.66 ? 2 : 1) : 0) as 0 | 1 | 2 | 3;

    const result: MissionResult = {
      missionId,
      passed,
      stars,
      correctCount,
      totalRequired,
    };

    let completedIds = get().completedIds;
    const starsByMission = { ...get().starsByMission };
    if (passed) {
      if (!completedIds.includes(missionId)) completedIds = [...completedIds, missionId];
      const prev = starsByMission[missionId] ?? 0;
      starsByMission[missionId] = Math.max(prev, stars) as 0 | 1 | 2 | 3;
      savePersisted(completedIds, starsByMission);
    }

    set({
      completedIds,
      starsByMission,
      lastResult: result,
      screen: "debrief",
      coachOpen: false,
      activeBeatId: null,
    });
    return result;
  },

  completedSet: () => new Set(get().completedIds),

  isUnlocked: (missionId) => isMissionUnlocked(missionId, new Set(get().completedIds)),

  nextId: () => nextMissionId(new Set(get().completedIds)),
}));
