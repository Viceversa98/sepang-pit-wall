import type { EngineMode, TyreCompound } from "@/stores/raceStore";

export const ENGINE_COPY: Record<EngineMode, string> = {
  push: "Attack — burns tyres",
  standard: "Balanced pace",
  save: "Conserve — slower",
};

export const COMPOUND_COPY: Record<TyreCompound, string> = {
  soft: "Fast · fragile",
  medium: "Race default",
  hard: "Dry endurance",
  intermediate: "Light–medium rain",
  wet: "Heavy wet only",
};
