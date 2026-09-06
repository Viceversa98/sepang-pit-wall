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
  pathFrameAt,
  type Waypoint,
} from "@/shared/waypoints";
import { headingFromQuaternion } from "@/lib/vehicleOrientation";
import {
  sepangBrakingEnvelopeMps,
  SEPANG_RACE_STRAIGHT_MPS,
} from "@/lib/sepangSpeedProfile";

export type AiWorkerInit = {
  buffer: SharedArrayBuffer;
  tickRateHz: number;
  waypoints?: readonly Waypoint[];
};

type VehicleAiState = {
  speedPid: PidController;
  waypointIndex: number;
};

let views: SharedSimViews | null = null;
let waypoints: readonly Waypoint[] = [];
let vehicleAi: VehicleAiState[] = [];
let intervalId = 0;
let tickDt = 1 / 30;

const createVehicleAi = (): VehicleAiState => ({
  speedPid: new PidController({
    kp: 0.12,
    ki: 0.012,
    kd: 0.02,
    outputMin: 0,
    outputMax: 1,
    integralClamp: 0.5,
  }),
  waypointIndex: 0,
});

const normalizeAngle = (angle: number): number => {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));

/**
 * Pure pursuit in vehicle frame (+Z forward, +X right).
 * Aim point right of nose → +localX → +steer (wheel mixes +chassisRight).
 */
const purePursuitSteer = (
  px: number,
  pz: number,
  heading: number,
  aimX: number,
  aimZ: number,
): number => {
  const fwdX = Math.sin(heading);
  const fwdZ = Math.cos(heading);
  const rightX = fwdZ;
  const rightZ = -fwdX;
  const dx = aimX - px;
  const dz = aimZ - pz;
  const localX = dx * rightX + dz * rightZ;
  const localZ = dx * fwdX + dz * fwdZ;
  // atan2(x,z): right of nose → positive.
  return clamp(Math.atan2(localX, Math.max(0.35, localZ)) / 0.85, -1, 1);
};

/** Local bend severity over a short window (not the whole approach). */
const cornerSeverity = (startIndex: number, segments = 3): number => {
  const n = waypoints.length;
  if (n < 3) return 0;
  let peak = 0;
  let prev = Math.atan2(
    waypoints[(startIndex + 1) % n].x - waypoints[startIndex % n].x,
    waypoints[(startIndex + 1) % n].z - waypoints[startIndex % n].z,
  );
  for (let i = 1; i <= segments; i++) {
    const a = waypoints[(startIndex + i) % n];
    const b = waypoints[(startIndex + i + 1) % n];
    const h = Math.atan2(b.x - a.x, b.z - a.z);
    peak = Math.max(peak, Math.abs(normalizeAngle(h - prev)));
    prev = h;
  }
  return peak;
};

const WP_SPACING_M = 18;

const aiTick = (): void => {
  if (!views) return;
  if (Atomics.load(views.header, HeaderIndex.aiRunning) === 0) return;

  const vehicleCount = Atomics.load(views.header, HeaderIndex.vehicleCount);
  const floats = views.floats;
  const n = waypoints.length;
  if (n === 0) return;

  for (let i = 0; i < vehicleCount; i++) {
    const base = vehicleBaseIndex(i);
    const flags = vehicleFlagsDecode(floats[base + VehicleField.flags]);
    if (!flags.aiEnabled || flags.kinematic) continue;

    const px = floats[base + VehicleField.posX];
    const pz = floats[base + VehicleField.posZ];
    const speed = floats[base + VehicleField.speed];
    const heading = headingFromQuaternion(
      floats[base + VehicleField.quatX],
      floats[base + VehicleField.quatY],
      floats[base + VehicleField.quatZ],
      floats[base + VehicleField.quatW],
    );

    const ai = vehicleAi[i] ?? createVehicleAi();
    vehicleAi[i] = ai;

    // Desk writes lapProgress + grip/DRS scales each frame (SC via gripScale).
    const deskLap = floats[base + VehicleField.lapProgress];
    const hintFromDesk =
      Number.isFinite(deskLap) && deskLap >= 0 && deskLap <= 1
        ? Math.floor(deskLap * n) % n
        : ai.waypointIndex;
    // Resync after lights-out / teleport — local search from stale mid-lap index misses the grid.
    const hintDelta = Math.abs(hintFromDesk - ai.waypointIndex);
    const wrapDelta = Math.min(hintDelta, n - hintDelta);
    if (wrapDelta > 20) {
      ai.waypointIndex = hintFromDesk;
      ai.speedPid.reset();
    }

    const frame = pathFrameAt(waypoints, px, pz, ai.waypointIndex);
    ai.waypointIndex = frame.index;

    // Desk gripScale already includes compound × engine × field pace.
    const paceMul = 1;
    const lapT =
      Number.isFinite(deskLap) && deskLap >= 0 && deskLap <= 1
        ? deskLap
        : frame.index / n;
    const gripRaw = floats[base + VehicleField.gripScale];
    const gripScale =
      Number.isFinite(gripRaw) && gripRaw > 0.05 ? gripRaw : 1;
    const drsRaw = floats[base + VehicleField.drsMult];
    const drsMult =
      Number.isFinite(drsRaw) && drsRaw > 0.05 ? drsRaw : 1;
    // Sepang telemetry envelope × grip × DRS (DRS only non-1 in zones).
    const cornerCap = sepangBrakingEnvelopeMps(
      lapT,
      paceMul * gripScale,
    );
    const localSev = cornerSeverity(frame.index, 3);

    const lookM = clamp(8 + speed * 0.22, 10, localSev > 0.15 ? 28 : 45);
    const lookSteps = Math.max(1, Math.round(lookM / WP_SPACING_M));
    const aim = waypoints[(frame.index + lookSteps) % n];

    const desiredLaneM = floats[base + VehicleField.laneOffsetM];
    const laneErr =
      (Number.isFinite(desiredLaneM) ? desiredLaneM / 4 : 0) - frame.crossTrack;
    let steer = clamp(laneErr * 0.35, -0.35, 0.35);
    steer = clamp(
      steer + purePursuitSteer(px, pz, heading, aim.x, aim.z) * 0.08,
      -0.4,
      0.4,
    );

    // Soft straight ceiling rises with DRS; corners stay on envelope.
    const straightCeil =
      SEPANG_RACE_STRAIGHT_MPS * 1.05 * paceMul * gripScale * drsMult;
    let targetSpeed = Math.min(straightCeil, cornerCap * Math.max(1, drsMult));

    const speedError = targetSpeed - speed;
    const throttle = ai.speedPid.step(speedError, tickDt);
    const overspeed = speed - targetSpeed;
    // Boards: light lamps early (~7 km/h over), hard into big hairpins.
    const brake =
      overspeed > 2
        ? Math.min(1, 0.2 + (overspeed - 2) * 0.14)
        : 0;

    floats[base + VehicleField.aiSteer] = steer;
    // Lift fully once braking; otherwise dig in when under target.
    floats[base + VehicleField.aiThrottle] =
      brake > 0.2 ? 0 : Math.max(speedError > 1 ? 0.55 : 0.2, throttle);
    floats[base + VehicleField.aiBrake] = brake;
    floats[base + VehicleField.targetSpeedMps] = targetSpeed;

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
