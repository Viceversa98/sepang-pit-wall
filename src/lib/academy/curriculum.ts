import type { ChapterDef, MissionDef, RuleChapterId } from "./types";
import { ALL_MISSIONS } from "./missions";

export const CHAPTERS: ChapterDef[] = [
  {
    id: "weekend-start",
    title: "Weekend & start",
    blurb: "Practice, quali meaning, formation, five reds, aborted start.",
    missionIds: ["ws-sessions", "ws-lights", "ws-aborted"],
  },
  {
    id: "flags",
    title: "Flags",
    blurb: "What each flag means when race control waves it.",
    missionIds: ["fl-yellow", "fl-double", "fl-blue", "fl-red", "fl-misc"],
  },
  {
    id: "safety",
    title: "Safety periods",
    blurb: "Safety car, VSC, and red-flag restarts.",
    missionIds: ["sf-sc", "sf-vsc", "sf-red-restart"],
  },
  {
    id: "tyres",
    title: "Tyres",
    blurb: "Compounds, wear, and why you cannot stay on one set forever.",
    missionIds: ["ty-compounds", "ty-mandatory", "ty-wear"],
  },
  {
    id: "pits",
    title: "Pit lane",
    blurb: "Box call, speed limit, stop, unsafe release.",
    missionIds: ["pt-box", "pt-limit", "pt-unsafe"],
  },
  {
    id: "weather",
    title: "Weather strategy",
    blurb: "Slicks in rain, drying track, when to switch.",
    missionIds: ["wx-rain", "wx-dry"],
  },
  {
    id: "overtaking",
    title: "Overtaking & DRS",
    blurb: "DRS zones, detection, and blue-flag etiquette.",
    missionIds: ["ov-drs", "ov-blue"],
  },
  {
    id: "penalties",
    title: "Penalties",
    blurb: "Time penalties, drive-through, stop-go, and why stewards act.",
    missionIds: ["pn-time", "pn-drive", "pn-collision"],
  },
  {
    id: "points",
    title: "Points & championship",
    blurb: "How finishing positions become championship points.",
    missionIds: ["pc-table", "pc-p10", "pc-sprint"],
  },
  {
    id: "edge",
    title: "Race control edge cases",
    blurb: "Lapped cars under SC, pit under SC, parc fermé basics.",
    missionIds: ["ed-sc-lap", "ed-sc-pit", "ed-parc"],
  },
];

export const CHAPTER_ORDER: RuleChapterId[] = CHAPTERS.map((c) => c.id);

export const getMission = (id: string): MissionDef | undefined =>
  ALL_MISSIONS.find((m) => m.id === id);

export const getChapter = (id: RuleChapterId): ChapterDef | undefined =>
  CHAPTERS.find((c) => c.id === id);

export const getChapterForMission = (missionId: string): ChapterDef | undefined =>
  CHAPTERS.find((c) => c.missionIds.includes(missionId));

/** First incomplete mission in unlock order, or null if all done. */
export const nextMissionId = (completed: Set<string>): string | null => {
  for (const chapter of CHAPTERS) {
    for (const mid of chapter.missionIds) {
      if (!completed.has(mid)) return mid;
    }
  }
  return null;
};

export const isChapterUnlocked = (
  chapterId: RuleChapterId,
  completed: Set<string>,
): boolean => {
  const idx = CHAPTER_ORDER.indexOf(chapterId);
  if (idx <= 0) return true;
  const prev = CHAPTERS[idx - 1];
  return prev.missionIds.every((id) => completed.has(id));
};

export const isMissionUnlocked = (
  missionId: string,
  completed: Set<string>,
): boolean => {
  const chapter = getChapterForMission(missionId);
  if (!chapter || !isChapterUnlocked(chapter.id, completed)) return false;
  const i = chapter.missionIds.indexOf(missionId);
  if (i <= 0) return true;
  return completed.has(chapter.missionIds[i - 1]);
};
