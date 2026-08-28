import type { CarState } from "@/stores/raceStore";

/** Latest sim positions — updated every physics step for smooth 3D reads. */
let liveCars: CarState[] = [];

export const setLiveRaceCars = (cars: CarState[]): void => {
  liveCars = cars;
};

export const getLiveRaceCars = (): CarState[] => liveCars;

export const findLiveCar = (carId: string): CarState | undefined =>
  liveCars.find((c) => c.id === carId);
