/**
 * Headless caterpillar check: runs the real sim math (targetSpeedMps,
 * integrateSpeed, resolveTraffic) for a 20-car field over ~2 laps and
 * measures surging: slide/spin incidents, per-frame speed jerks, and
 * gap oscillation inside trains.
 *
 * Run: npx tsx --tsconfig tsconfig.json scripts/verify-caterpillar.ts
 */
import { integrateSpeed, targetSpeedMps } from "../src/lib/racePhysics";
import { resolveTraffic, gridLaneOffsetM, alongGapM } from "../src/lib/raceTraffic";
import { TRACK_LENGTH_M } from "../src/lib/trackCurve";
import type { CarState } from "../src/stores/raceStore";

const DT = 1 / 120;
const SIM_SECONDS = 200;
const CAR_COUNT = 20;

const makeCar = (i: number): CarState =>
  ({
    id: `car-${i}`,
    isPlayer: i === 0,
    finished: false,
    status: "racing",
    isBoxing: false,
    pendingBox: false,
    garageReturn: false,
    blockId: null,
    laneOffsetM: gridLaneOffsetM(i),
    laneTargetM: gridLaneOffsetM(i),
    lapProgress: ((1 - (12 + i * 8) / TRACK_LENGTH_M) % 1 + 1) % 1,
    currentLap: 1,
    currentLapTimeMs: 0,
    speedMps: 0,
    damage: 0,
    incidentTimer: 0,
    incidentKind: null,
    tireWear: 100,
    currentCompound: "medium",
    engineMode: "standard",
    pitProgress: 0,
    pitHoldTraffic: false,
  }) as unknown as CarState;

let cars = Array.from({ length: CAR_COUNT }, (_, i) => makeCar(i));

let incidents = 0;
let jerkEvents = 0;
let maxFrameDecel = 0;
const gapSamples: number[][] = Array.from({ length: CAR_COUNT }, () => []);
const incidentLog: Array<Record<string, unknown>> = [];
const speedReversals = new Array(CAR_COUNT).fill(0);
const lastAccelSign = new Array(CAR_COUNT).fill(0);
let maxSpeed = 0;

const steps = Math.round(SIM_SECONDS / DT);
for (let step = 0; step < steps; step += 1) {
  const t = step * DT;
  const prevSpeeds = cars.map((c) => c.speedMps);
  const prevStatus = cars.map((c) => c.status);

  const targets: Record<string, number> = {};
  for (const car of cars) {
    const target = targetSpeedMps({
      compound: "medium",
      engineMode: "standard",
      rain: 0,
      tireWear: car.tireWear,
      damage: car.damage,
      lapProgress: car.lapProgress,
      controlMult: 1,
      drsMult: 1,
      pitExitBlend: 1,
      pitExitScale: () => 1,
    });
    const phys = integrateSpeed({
      speedMps: car.speedMps,
      status: car.status,
      damage: car.damage,
      incidentTimer: car.incidentTimer,
      incidentKind: car.incidentKind,
      tireWear: car.tireWear,
      compound: "medium",
      engineMode: "standard",
      rain: 0,
      targetMps: target,
      dt: DT,
    });
    targets[car.id] = target;
    car.status = phys.status;
    car.damage = phys.damage;
    car.incidentTimer = phys.incidentTimer;
    car.incidentKind = phys.incidentKind;
    car.speedMps = phys.speedMps;
    car.lapProgress += (phys.speedMps * DT) / TRACK_LENGTH_M;
    if (car.lapProgress >= 1) {
      car.lapProgress -= 1;
      car.currentLap += 1;
    }
  }

  cars = resolveTraffic(cars, DT, t < 4.5);

  for (let i = 0; i < cars.length; i += 1) {
    const dv = cars[i].speedMps - prevSpeeds[i];
    maxSpeed = Math.max(maxSpeed, cars[i].speedMps);
    if (-dv / DT > maxFrameDecel) maxFrameDecel = -dv / DT;
    // A "jerk" = losing >3 m/s (~11 km/h) in a single 8.3 ms frame.
    if (dv < -3) jerkEvents += 1;
    if (prevStatus[i] === "racing" && cars[i].status !== "racing") {
      incidents += 1;
      if (incidentLog.length < 12) {
        incidentLog.push({
          t: +t.toFixed(1),
          car: cars[i].id,
          kind: cars[i].incidentKind,
          status: cars[i].status,
          lapT: +cars[i].lapProgress.toFixed(3),
          speed: +prevSpeeds[i].toFixed(1),
          target: +(targets[cars[i].id] ?? -1).toFixed(1),
        });
      }
    }
    // Acceleration sign reversals after launch settle (surge metric).
    if (t > 30) {
      const sign = dv > 0.02 ? 1 : dv < -0.02 ? -1 : 0;
      if (sign !== 0 && lastAccelSign[i] !== 0 && sign !== lastAccelSign[i]) {
        speedReversals[i] += 1;
      }
      if (sign !== 0) lastAccelSign[i] = sign;
    }
  }

  // Sample gap of each car to the car directly ahead (by race order), 10 Hz.
  if (t > 30 && step % 12 === 0) {
    const order = [...cars].sort(
      (a, b) => b.currentLap + b.lapProgress - (a.currentLap + a.lapProgress),
    );
    for (let i = 1; i < order.length; i += 1) {
      const idx = Number(order[i].id.split("-")[1]);
      gapSamples[idx].push(alongGapM(order[i], order[i - 1]));
    }
  }
}

const gapStats = gapSamples
  .map((samples, i) => {
    if (samples.length < 10) return null;
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const sd = Math.sqrt(
      samples.reduce((a, b) => a + (b - mean) ** 2, 0) / samples.length,
    );
    return { car: i, meanGapM: +mean.toFixed(1), sdGapM: +sd.toFixed(2), minGapM: +Math.min(...samples).toFixed(1) };
  })
  .filter(Boolean);

const minuteRate = speedReversals.map((r) => +(r / ((SIM_SECONDS - 30) / 60)).toFixed(1));

console.log(JSON.stringify({
  simSeconds: SIM_SECONDS,
  incidents,
  jerkEvents,
  maxFrameDecelMps2: +maxFrameDecel.toFixed(1),
  maxSpeedKmh: +(maxSpeed * 3.6).toFixed(0),
  accelReversalsPerMin: minuteRate,
  incidentLog,
  gapStats,
}, null, 2));
