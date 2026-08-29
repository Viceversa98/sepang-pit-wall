import type { RacePhase } from "@/stores/raceStore";

/** Max-height Tailwind classes for the portrait strategy panel, by race phase. */
export const portraitStrategyPanelMaxClass = (phase: RacePhase): string => {
  switch (phase) {
    case "ready":
      return "max-h-[min(45dvh,420px)]";
    case "starting":
      return "max-h-[14dvh]";
    case "racing":
    case "finished":
      return "max-h-[min(48dvh,460px)]";
    default:
      return "";
  }
};

export const portraitStrategyPanelClass = (
  isPortrait: boolean,
  phase: RacePhase,
): string => (isPortrait ? portraitStrategyPanelMaxClass(phase) : "");
