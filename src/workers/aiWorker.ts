/// <reference lib="webworker" />

import { PidController } from "@/shared/pid";
import {
  attachSharedSimState,
  HeaderIndex,
  vehicleBaseIndex,
  VehicleField,
  vehicleFlagsDecode,
  vehicleFlagsEncode,
  type SharedSimViews,
} from "@/shared/sharedState";
import {
  nearestWaypointIndex,
  targetWaypointIndex,
  type Waypoint,
} from "@/shared/waypoints";

export type AiWorkerInit = {
  buffer: SharedArrayBuffer;
  tickRateHz: number;
  waypoints?: readonly Waypoint[];
};

type VehicleAiState = {
  steerPid: PidController;
  speedPid: PidController;
  waypointIndex: number;
};

let views: SharedSimViews | null = null;
let waypoints: readonly Waypoint[] = [];
let vehicleAi: VehicleAiState[] = [];
let intervalId = 0;
let tickDt = 1 / 30;

const createVehicleAi = (): VehicleAiState => ({
  steerPid: new PidController({
    kp: 2.2,
    ki: 0.04,
    kd: 0.35,
    outputMin: -0.85,
    outputMax: 0.85,
    integralClamp: 0.45,
  }),
  speedPid: new PidController({
    kp: 0.12,
    ki: 0.015,
    kd: 0.04,
    outputMin: 0,
    outputMax: 1,
    integralClamp: 0.55,
  }),
  waypointIndex: 0,
});

const normalizeAngle = (angle: number): number => {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

const headingFromQuaternion = (qx: number, qy: number, qz: number, qw: number): number =>
  Math.atan2(2 * (qw * qy + qx * qz), 1 - 2 * (qy * qy + qz * qz));

const steerToward = (
  px: number,
  pz: number,
  heading: number,
  target: Waypoint,
): number => {
  const dx = target.x - px;
  const dz = target.z - pz;
  const desired = Math.atan2(dx, dz);
  return normalizeAngle(desired - heading);
};

const aiTick = (): void => {
  if (!views) return;
  if (Atomics.load(views.header, HeaderIndex.aiRunning) === 0) return;

  const vehicleCount = Atomics.load(views.header, HeaderIndex.vehicleCount);
  const floats = views.floats;

  for (let i = 0; i < vehicleCount; i++) {
    const base = vehicleBaseIndex(i);
    const flags = vehicleFlagsDecode(floats[base + VehicleField.flags]);
    if (!flags.aiEnabled || flags.kinematic) continue;

    const px = floats[base + VehicleField.posX];
    const pz = floats[base + VehicleField.posZ];
    const speed = floats[base + VehicleField.speed];
    const targetSpeed = Math.max(0, floats[base + VehicleField.targetSpeedMps]);
    const heading = headingFromQuaternion(
      floats[base + VehicleField.quatX],
      floats[base + VehicleField.quatY],
      floats[base + VehicleField.quatZ],
      floats[base + VehicleField.quatW],
    );

    const ai = vehicleAi[i] ?? createVehicleAi();
    vehicleAi[i] = ai;

    ai.waypointIndex = nearestWaypointIndex(waypoints, px, pz, ai.waypointIndex);
    const targetIndex = targetWaypointIndex(waypoints, ai.waypointIndex, 3);
    const target = waypoints[targetIndex];

    const steerError = steerToward(px, pz, heading, target);
    const steer = ai.steerPid.step(steerError, tickDt);

    const speedError = targetSpeed - speed;
    const throttle = ai.speedPid.step(speedError, tickDt);
    const brake =
      speed > targetSpeed + 6 ? Math.min(1, (speed - targetSpeed) * 0.06) : 0;

    floats[base + VehicleField.aiSteer] = steer;
    floats[base + VehicleField.aiThrottle] = Math.max(0, throttle * (1 - brake * 0.5));
    floats[base + VehicleField.aiBrake] = brake;
    floats[base + VehicleField.waypointIndex] = ai.waypointIndex;

    floats[base + VehicleField.flags] = vehicleFlagsEncode(flags);
  }

  Atomics.add(views.header, HeaderIndex.aiTick, 1);
};

const init = (message: AiWorkerInit): void => {
  views = attachSharedSimState(message.buffer);
  waypoints = message.waypoints ?? [];
  if (waypoints.length === 0) return;
  tickDt = 1 / message.tickRateHz;

  const vehicleCount = Atomics.load(views.header, HeaderIndex.vehicleCount);
  vehicleAi = Array.from({ length: vehicleCount }, () => createVehicleAi());

  for (let i = 0; i < vehicleCount; i++) {
    const base = vehicleBaseIndex(i);
    const flags = vehicleFlagsDecode(views.floats[base + VehicleField.flags]);
    views.floats[base + VehicleField.flags] = vehicleFlagsEncode({
      ...flags,
      aiEnabled: true,
    });
  }

  Atomics.store(views.header, HeaderIndex.aiRunning, 1);
  intervalId = self.setInterval(aiTick, tickDt * 1000);
};

const shutdown = (): void => {
  if (views) {
    Atomics.store(views.header, HeaderIndex.aiRunning, 0);
  }
  if (intervalId) self.clearInterval(intervalId);
  intervalId = 0;
  vehicleAi = [];
  views = null;
};

type AiWorkerMessage =
  | { type: "init"; payload: AiWorkerInit }
  | { type: "shutdown" };

self.onmessage = (event: MessageEvent<AiWorkerMessage>) => {
  const message = event.data;
  if (message.type === "init") {
    init(message.payload);
    return;
  }
  if (message.type === "shutdown") {
    shutdown();
  }
};
