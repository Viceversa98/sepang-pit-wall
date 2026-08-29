import type { EngineMode, TyreCompound } from "@/stores/raceStore";

export const ENGINE_SEGMENTS: { value: EngineMode; label: string; ariaLabel: string }[] = [
  { value: "push", label: "Push", ariaLabel: "Engine push mode" },
  { value: "standard", label: "Std", ariaLabel: "Engine standard mode" },
  { value: "save", label: "Save", ariaLabel: "Engine save mode" },
];

export const COMPOUND_SEGMENTS: {
  value: TyreCompound;
  label: string;
  ariaLabel: string;
  selectedClass: string;
}[] = [
  {
    value: "soft",
    label: "S",
    ariaLabel: "Soft compound",
    selectedClass: "border-rose-400/55 bg-rose-500/20 text-rose-100",
  },
  {
    value: "medium",
    label: "M",
    ariaLabel: "Medium compound",
    selectedClass: "border-amber-400/55 bg-amber-500/20 text-amber-100",
  },
  {
    value: "hard",
    label: "H",
    ariaLabel: "Hard compound",
    selectedClass: "border-slate-300/55 bg-slate-400/15 text-slate-100",
  },
  {
    value: "intermediate",
    label: "I",
    ariaLabel: "Intermediate compound",
    selectedClass: "border-emerald-400/55 bg-emerald-500/20 text-emerald-100",
  },
  {
    value: "wet",
    label: "W",
    ariaLabel: "Wet compound",
    selectedClass: "border-sky-400/55 bg-sky-500/20 text-sky-100",
  },
];
