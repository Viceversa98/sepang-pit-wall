import { getContext, setContext } from "svelte";
import type { RaceLayoutMode } from "@/lib/viewportLayout";

const RACE_LAYOUT_KEY = Symbol("raceLayout");

export const setRaceLayoutContext = (getMode: () => RaceLayoutMode): void => {
  setContext(RACE_LAYOUT_KEY, getMode);
};

/** Call once at component init; returns a getter that tracks layout mode. */
export const useRaceLayoutGetter = (): (() => RaceLayoutMode) => {
  const getMode = getContext<(() => RaceLayoutMode) | undefined>(RACE_LAYOUT_KEY);
  return getMode ?? (() => "desktop");
};

export const useRaceLayoutMode = (): RaceLayoutMode => useRaceLayoutGetter()();
