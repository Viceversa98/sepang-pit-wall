/**
 * Benchmark stepRaceSimulation hot path — measures ms per tick after
 * zero-allocation refactor.
 *
 * Run: npx tsx --tsconfig tsconfig.json scripts/bench-sim-step.ts
 */
import { integrateSpeedInto, targetSpeedMps } from "../src/lib/racePhysics";
import { nearestCarAhead, resolveTraffic, gridLaneOffsetM, raceDistance } from "../src/lib/raceTraffic";
import { TRACK_LENGTH_M } from "../src/lib/trackCurve";
import type { CarState } from "../src/stores/raceStore";
import type { IntegrateResult } from "../src/lib/racePhysics";

const CAR_COUNT = 10;
const DT = 1 / 120;
const WARMUP = 500;
const TICKS = 8000;

const phys: IntegrateResult = {
  speedMps: 0,
  status: "racing",
  damage: 0,
  incidentTimer: 0,
  incidentKind: null,
  tireWear: 88,
  extraWear: 0,
  grip: 1,
  brakeIntensity: 0,
};

const makeCar = (i: number): CarState =>
  ({
    id: `car-${i}`,
    name: `C${i}`,
    color: "#fff",
    isPlayer: i === 0,
    finished: false,
    status: "racing",
    isBoxing: false,
    pendingBox: false,
    garageReturn: false,
    blockId: null,
    laneOffsetM: gridLaneOffsetM(i),
    laneTargetM: gridLaneOffsetM(i),
    lapProgress: (i * 0.04) % 1,
    currentLap: 1,
    tireWear: 88,
    currentCompound: "medium",
    engineMode: "standard",
    speedMps: 55 + i * 2,
    damage: 0,
    incidentTimer: 0,
    incidentKind: null,
    brakeIntensity: 0,
    pitProgress: 0,
    pitPhase: null,
    pitStopElapsed: 0,
    pitBoxIndex: 0,
    pitHoldTraffic: false,
    pitServiceDone: false,
    unsafeReleasePenaltyMs: 0,
    currentLapTimeMs: 0,
    lastLapTimeMs: 0,
    finishTimeMs: null,
    pendingCompound: null,
    pitLapPending: false,
    pitExitBlend: 1,
    timePenaltyMs: 0,
    drsEligible: false,
  }) as CarState;

const step = (cars: CarState[]): void => {
  for (let ci = 0; ci < cars.length; ci += 1) {
    const car = cars[ci];
    if (car.finished || car.isBoxing) continue;
    const targetMps = targetSpeedMps(car.lapProgress, car.currentCompound, 0.1, car.engineMode);
    integrateSpeedInto(phys, {
      speedMps: car.speedMps,
      status: car.status,
      damage: car.damage,
      incidentTimer: car.incidentTimer,
      incidentKind: car.incidentKind,
      tireWear: car.tireWear,
      compound: car.currentCompound,
      engineMode: car.engineMode,
      rain: 0.1,
      targetMps,
      dt: DT,
    });
    car.speedMps = phys.speedMps;
    car.lapProgress += (phys.speedMps * DT) / TRACK_LENGTH_M;
    if (car.lapProgress >= 1) car.lapProgress -= 1;
    nearestCarAhead(cars, car); // DRS scan cost
    raceDistance(car);
  }
  resolveTraffic(cars, DT, false);
};

let cars = Array.from({ length: CAR_COUNT }, (_, i) => makeCar(i));
for (let i = 0; i < WARMUP; i += 1) step(cars);

const t0 = performance.now();
for (let i = 0; i < TICKS; i += 1) step(cars);
const elapsed = performance.now() - t0;

console.log(
  JSON.stringify(
    {
      cars: CAR_COUNT,
      ticks: TICKS,
      totalMs: +elapsed.toFixed(1),
      msPerTick: +(elapsed / TICKS).toFixed(4),
      simHzCapacity: +(1000 / (elapsed / TICKS)).toFixed(0),
    },
    null,
    2,
  ),
);
