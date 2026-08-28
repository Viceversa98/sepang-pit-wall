/**
 * Zero-copy vehicle state shared between main thread, physics worker, and AI worker.
 *
 * Layout:
 *   [0 .. HEADER_I32_COUNT)     Int32Array  — atomics / control flags
 *   [0 .. floats.length)        Float32Array view over same buffer
 *   [HEADER_FLOAT_OFFSET ..)    per-vehicle records (VEHICLE_STRIDE floats each)
 */

export const MAX_VEHICLES = 22;

/** Floats per vehicle transform + inputs + telemetry. */
export const VEHICLE_STRIDE = 21;

/** Int32 slots used with Atomics (must stay 4-byte aligned). */
export const HEADER_I32_COUNT = 16;

/** Float32 index where vehicle records begin (same byte offset as HEADER_I32_COUNT). */
export const HEADER_FLOAT_OFFSET = HEADER_I32_COUNT;

export const SHARED_BUFFER_BYTES =
  (HEADER_I32_COUNT + MAX_VEHICLES * VEHICLE_STRIDE) * Float32Array.BYTES_PER_ELEMENT;

/** Int32 header indices */
export const HeaderIndex = {
  physicsTick: 0,
  aiTick: 1,
  renderTick: 2,
  vehicleCount: 3,
  physicsRunning: 4,
  aiRunning: 5,
  simTimeMs: 6,
  flags: 7,
} as const;

/** Per-vehicle float offsets (relative to vehicle base index). */
export const VehicleField = {
  posX: 0,
  posY: 1,
  posZ: 2,
  quatX: 3,
  quatY: 4,
  quatZ: 5,
  quatW: 6,
  velX: 7,
  velY: 8,
  velZ: 9,
  speed: 10,
  steeringAngle: 11,
  throttle: 12,
  brake: 13,
  waypointIndex: 14,
  aiSteer: 15,
  aiThrottle: 16,
  aiBrake: 17,
  groundNormalY: 18,
  flags: 19,
  targetSpeedMps: 20,
} as const;

export type VehicleFlags = {
  onGround: boolean;
  aiEnabled: boolean;
  playerControlled: boolean;
  kinematic: boolean;
};

export const vehicleFlagsEncode = (flags: VehicleFlags): number =>
  (flags.onGround ? 1 : 0) |
  (flags.aiEnabled ? 1 << 1 : 0) |
  (flags.playerControlled ? 1 << 2 : 0) |
  (flags.kinematic ? 1 << 3 : 0);

export const vehicleFlagsDecode = (bits: number): VehicleFlags => ({
  onGround: (bits & 1) !== 0,
  aiEnabled: (bits & (1 << 1)) !== 0,
  playerControlled: (bits & (1 << 2)) !== 0,
  kinematic: (bits & (1 << 3)) !== 0,
});

export type SharedSimViews = {
  buffer: SharedArrayBuffer;
  header: Int32Array;
  floats: Float32Array;
};

export const createSharedSimState = (): SharedSimViews => {
  const buffer = new SharedArrayBuffer(SHARED_BUFFER_BYTES);
  const header = new Int32Array(buffer, 0, HEADER_I32_COUNT);
  const floats = new Float32Array(buffer);

  Atomics.store(header, HeaderIndex.vehicleCount, 1);
  Atomics.store(header, HeaderIndex.physicsRunning, 0);
  Atomics.store(header, HeaderIndex.aiRunning, 0);

  return { buffer, header, floats };
};

export const attachSharedSimState = (buffer: SharedArrayBuffer): SharedSimViews => ({
  buffer,
  header: new Int32Array(buffer, 0, HEADER_I32_COUNT),
  floats: new Float32Array(buffer),
});

export const vehicleBaseIndex = (vehicleIndex: number): number =>
  HEADER_FLOAT_OFFSET + vehicleIndex * VEHICLE_STRIDE;

export const readVehicleTransform = (
  floats: Float32Array,
  vehicleIndex: number,
): {
  position: [number, number, number];
  quaternion: [number, number, number, number];
  speed: number;
  steeringAngle: number;
  targetSpeedMps: number;
  flags: VehicleFlags;
} => {
  const base = vehicleBaseIndex(vehicleIndex);
  return {
    position: [
      floats[base + VehicleField.posX],
      floats[base + VehicleField.posY],
      floats[base + VehicleField.posZ],
    ],
    quaternion: [
      floats[base + VehicleField.quatX],
      floats[base + VehicleField.quatY],
      floats[base + VehicleField.quatZ],
      floats[base + VehicleField.quatW],
    ],
    speed: floats[base + VehicleField.speed],
    steeringAngle: floats[base + VehicleField.steeringAngle],
    targetSpeedMps: floats[base + VehicleField.targetSpeedMps],
    flags: vehicleFlagsDecode(floats[base + VehicleField.flags]),
  };
};

export const writeVehicleTransform = (
  floats: Float32Array,
  vehicleIndex: number,
  position: [number, number, number],
  quaternion: [number, number, number, number],
  speed: number,
  steeringAngle: number,
): void => {
  const base = vehicleBaseIndex(vehicleIndex);
  floats[base + VehicleField.posX] = position[0];
  floats[base + VehicleField.posY] = position[1];
  floats[base + VehicleField.posZ] = position[2];
  floats[base + VehicleField.quatX] = quaternion[0];
  floats[base + VehicleField.quatY] = quaternion[1];
  floats[base + VehicleField.quatZ] = quaternion[2];
  floats[base + VehicleField.quatW] = quaternion[3];
  floats[base + VehicleField.speed] = speed;
  floats[base + VehicleField.steeringAngle] = steeringAngle;
};

export type VehiclePoseInit = {
  position: [number, number, number];
  quaternion: [number, number, number, number];
  kinematic: boolean;
};

export const writeVehicleKinematicPose = (
  floats: Float32Array,
  vehicleIndex: number,
  position: [number, number, number],
  quaternion: [number, number, number, number],
): void => {
  const base = vehicleBaseIndex(vehicleIndex);
  floats[base + VehicleField.posX] = position[0];
  floats[base + VehicleField.posY] = position[1];
  floats[base + VehicleField.posZ] = position[2];
  floats[base + VehicleField.quatX] = quaternion[0];
  floats[base + VehicleField.quatY] = quaternion[1];
  floats[base + VehicleField.quatZ] = quaternion[2];
  floats[base + VehicleField.quatW] = quaternion[3];
  floats[base + VehicleField.velX] = 0;
  floats[base + VehicleField.velY] = 0;
  floats[base + VehicleField.velZ] = 0;
  floats[base + VehicleField.speed] = 0;
};
