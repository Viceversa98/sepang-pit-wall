import type { SharedSimViews } from "@/shared/sharedState";
import type { WorkerHandles } from "@/sim/RaceDirector";

let shared: SharedSimViews | null = null;
let workers: WorkerHandles | null = null;

export const setRaceSimContext = (views: SharedSimViews, w: WorkerHandles): void => {
  shared = views;
  workers = w;
};

export const getRaceSimShared = (): SharedSimViews | null => shared;

export const getRaceSimWorkers = (): WorkerHandles | null => workers;
