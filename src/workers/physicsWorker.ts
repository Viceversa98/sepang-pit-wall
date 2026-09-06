/// <reference lib="webworker" />

import RAPIER from "@dimforge/rapier3d-compat";
import {
  attachSharedSimState,
  HeaderIndex,
  vehicleBaseIndex,
  VehicleField,
  vehicleFlagsDecode,
  vehicleFlagsEncode,
  type SharedSimViews,
  type VehiclePoseInit,
} from "@/shared/sharedState";

import type { TrackColliderMesh } from "@/scene/buildTrackCollider";
import { pathAlongAt, pathFrameAt, type Waypoint } from "@/shared/waypoints";
import {
  CHASSIS_HALF_EXTENTS,
  PHYSICS_RIDE_HEIGHT,
  VEHICLE_MASS,
} from "@/workers/raycastVehicle";
import {
  longitudinalAccelMps2,
  longitudinalBrakeMps2,
} from "@/lib/racePhysics";

export type PhysicsWorkerInit = {
  buffer: SharedArrayBuffer;
  fixedTimestep: number;
  vehicleCount: number;
  collider?: TrackColliderMesh;
  initialPoses?: VehiclePoseInit[];
  waypoints?: readonly Waypoint[];
};

type VehicleRuntime = {
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
};

let views: SharedSimViews | null = null;
let world: RAPIER.World | null = null;
let vehicles: VehicleRuntime[] = [];
let trackWaypoints: readonly Waypoint[] = [];
let fixedTimestep = 1 / 60;
let accumulator = 0;
let lastTime = 0;
let rafId = 0;

const writeBodyToShared = (index: number, body: RAPIER.RigidBody): void => {
  if (!views) return;

  const base = vehicleBaseIndex(index);
  const t = body.translation();
  const r = body.rotation();
  const linvel = body.linvel();
  const speed = Math.hypot(linvel.x, linvel.z);

  const floats = views.floats;
  const flags = vehicleFlagsDecode(floats[base + VehicleField.flags]);
  const kinematicSpeed = floats[base + VehicleField.speed];

  floats[base + VehicleField.posX] = t.x;
  floats[base + VehicleField.posY] = t.y;
  floats[base + VehicleField.posZ] = t.z;
  floats[base + VehicleField.quatX] = r.x;
  floats[base + VehicleField.quatY] = r.y;
  floats[base + VehicleField.quatZ] = r.z;
  floats[base + VehicleField.quatW] = r.w;
  floats[base + VehicleField.velX] = linvel.x;
  floats[base + VehicleField.velY] = linvel.y;
  floats[base + VehicleField.velZ] = linvel.z;
  // SAB speed is always gameplay m/s (1 world unit = 4 m).
  // Free cars: arcadeSpeed is authority — linvel after world.step() is not.
  const railSpeed = arcadeSpeed[index];
  floats[base + VehicleField.speed] = flags.kinematic
    ? kinematicSpeed
    : (Number.isFinite(railSpeed) ? railSpeed : speed) * 4;
};

const applyKinematicFromShared = (index: number, body: RAPIER.RigidBody): void => {
  if (!views) return;
  const base = vehicleBaseIndex(index);
  const floats = views.floats;
  const x = floats[base + VehicleField.posX];
  const y = floats[base + VehicleField.posY];
  const z = floats[base + VehicleField.posZ];
  const qx = floats[base + VehicleField.quatX];
  const qy = floats[base + VehicleField.quatY];
  const qz = floats[base + VehicleField.quatZ];
  const qw = floats[base + VehicleField.quatW];

  body.setTranslation({ x, y, z }, true);
  body.setRotation({ x: qx, y: qy, z: qz, w: qw }, true);
  body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  body.setAngvel({ x: 0, y: 0, z: 0 }, true);
};

const waypointHint: number[] = [];
/** Fractional index along waypoints for arcade free cars. */
const arcadeAlong: number[] = [];
const arcadeLane: number[] = [];
const arcadeYaw: number[] = [];
/** Path-rail speed authority in world-units/s (1 u = 4 m). Never re-read Rapier linvel after step — damping/solver settles ~57 m/s (~205 km/h). */
const arcadeSpeed: number[] = [];

const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));

const normalizeAngle = (a: number): number => {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
};

/** Approach target yaw without spinning the long way. */
const approachAngle = (from: number, to: number, maxStep: number): number => {
  const err = normalizeAngle(to - from);
  return from + clamp(err, -maxStep, maxStep);
};

/**
 * Sample the racing-line polyline (waypoints already lie on getTrackCurve).
 * Do NOT re-fit Catmull-Rom through them — that drifted ~100 m off asphalt.
 */
const samplePathCR = (
  along: number,
): { x: number; y: number; z: number; fwdX: number; fwdZ: number } => {
  const n = trackWaypoints.length;
  const i1 = ((Math.floor(along) % n) + n) % n;
  const t = along - Math.floor(along);
  const i0 = (i1 - 1 + n) % n;
  const i2 = (i1 + 1) % n;
  const i3 = (i1 + 2) % n;
  const p1 = trackWaypoints[i1];
  const p2 = trackWaypoints[i2];

  const x = p1.x + (p2.x - p1.x) * t;
  const y = p1.y + (p2.y - p1.y) * t;
  const z = p1.z + (p2.z - p1.z) * t;

  // Blend neighboring segment tangents so hairpins don't kink yaw.
  const a = trackWaypoints[i0];
  const b = trackWaypoints[i3];
  let tx0 = p1.x - a.x;
  let tz0 = p1.z - a.z;
  let tx1 = p2.x - p1.x;
  let tz1 = p2.z - p1.z;
  let tx2 = b.x - p2.x;
  let tz2 = b.z - p2.z;
  const l0 = Math.hypot(tx0, tz0) || 1;
  const l1 = Math.hypot(tx1, tz1) || 1;
  const l2 = Math.hypot(tx2, tz2) || 1;
  tx0 /= l0;
  tz0 /= l0;
  tx1 /= l1;
  tz1 /= l1;
  tx2 /= l2;
  tz2 /= l2;
  const tx = tx0 * (1 - t) * 0.25 + tx1 * 0.5 + tx2 * t * 0.25;
  const tz = tz0 * (1 - t) * 0.25 + tz1 * 0.5 + tz2 * t * 0.25;
  const tl = Math.hypot(tx, tz) || 1;
  return { x, y, z, fwdX: tx / tl, fwdZ: tz / tl };
};

/**
 * Path-rail arcade: Catmull-Rom rail + rate-limited yaw.
 * No nearest catch-up (that teleported). Progress only advances.
 */
const applyArcadePathDrive = (
  index: number,
  body: RAPIER.RigidBody,
  throttle: number,
  brake: number,
  steer: number,
): { steeringAngle: number; brakeOut: number } => {
  const n = trackWaypoints.length;
  if (n === 0) return { steeringAngle: 0, brakeOut: 0 };

  const t = body.translation();
  const base = vehicleBaseIndex(index);

  let justBootedRail = false;
  if (arcadeAlong[index] === undefined || Number.isNaN(arcadeAlong[index])) {
    // Fractional along from pose + desk hint. Integer nearest-wp alone
    // snapped cars backward onto the previous marker at lights-out.
    const deskLap = views ? views.floats[base + VehicleField.lapProgress] : NaN;
    const hintFromDesk =
      Number.isFinite(deskLap) && deskLap >= 0 && deskLap <= 1
        ? Math.floor(deskLap * n) % n
        : (waypointHint[index] ?? 0);
    const along = pathAlongAt(trackWaypoints, t.x, t.z, hintFromDesk);
    arcadeAlong[index] = ((along % n) + n) % n;
    const bootFrame = pathFrameAt(
      trackWaypoints,
      t.x,
      t.z,
      Math.floor(arcadeAlong[index]) % n,
    );
    // Prefer desk grid lane (metres→units); same sign as getGridSlot / pose.side.
    const deskLaneM = views ? views.floats[base + VehicleField.laneOffsetM] : NaN;
    arcadeLane[index] = Number.isFinite(deskLaneM)
      ? clamp(deskLaneM / 4, -1.15, 1.15)
      : clamp(bootFrame.crossTrack, -1.15, 1.15);
    const boot = samplePathCR(arcadeAlong[index]);
    arcadeYaw[index] = Math.atan2(boot.fwdX, boot.fwdZ);
    waypointHint[index] = Math.floor(arcadeAlong[index]) % n;
    justBootedRail = true;
  }

  const rawTarget = views ? views.floats[base + VehicleField.targetSpeedMps] : 50;
  const STRAIGHT_CEILING_MPS = 372 / 3.6;
  // No min-8 floor while parked — that shoved the field before AI wrote targets.
  let targetMps = Number.isFinite(rawTarget)
    ? Math.max(0, Math.min(STRAIGHT_CEILING_MPS, rawTarget))
    : 0;
  // Own speed in arcadeSpeed — do not seed from post-step linvel (Rapier drag wall).
  let speedWorld = arcadeSpeed[index];
  if (!Number.isFinite(speedWorld)) {
    speedWorld = Math.hypot(body.linvel().x, body.linvel().z);
    if (!Number.isFinite(speedWorld)) speedWorld = 0;
  }
  // Pit→track: kinematic zeros linvel; keep desk flare speed so merge doesn't stall.
  if (justBootedRail && views && speedWorld < 0.05) {
    const deskSpeed = views.floats[base + VehicleField.speed];
    if (Number.isFinite(deskSpeed) && deskSpeed > 1) {
      speedWorld = deskSpeed / 4;
    }
    if (!(Number.isFinite(rawTarget) && rawTarget > 5) && speedWorld > 0.05) {
      targetMps = Math.max(targetMps, speedWorld * 4);
      views.floats[base + VehicleField.targetSpeedMps] = targetMps;
    }
  }
  const speedMps = speedWorld * 4;
  const targetWorld = targetMps / 4;
  const overspeedWorld = speedWorld - targetWorld;
  // Never Math.min-snap down to target — that hid all board braking / lamps.
  // Over target ⇒ real brake curve (AI brake or coast scrub).
  let brakeOut = 0;
  if (overspeedWorld > 0.08) {
    const brakeAmt = Math.max(
      brake > 0.05 ? brake : 0,
      Math.min(1, 0.2 + overspeedWorld * 0.2),
    );
    brakeOut = brakeAmt;
    const brakeMps2 = longitudinalBrakeMps2(speedMps, 1) * brakeAmt;
    speedWorld = Math.max(
      targetWorld,
      speedWorld - (brakeMps2 / 4) * fixedTimestep,
    );
  } else {
    // Full throttle toward target — clear path digs in.
    const throttleIn = Math.max(0.35, throttle);
    const aMps2 = longitudinalAccelMps2(speedMps, 1) * throttleIn;
    speedWorld = Math.min(
      targetWorld,
      Math.max(0.15, speedWorld + (aMps2 / 4) * fixedTimestep),
    );
  }
  arcadeSpeed[index] = speedWorld;

  // Measure real segment length so advance matches rail (no stride teleport).
  const iProbe = Math.floor(arcadeAlong[index]) % n;
  const aProbe = trackWaypoints[iProbe];
  const bProbe = trackWaypoints[(iProbe + 1) % n];
  const segLen = Math.max(2.5, Math.hypot(bProbe.x - aProbe.x, bProbe.z - aProbe.z));
  arcadeAlong[index] =
    (arcadeAlong[index] + (speedWorld * fixedTimestep) / segLen + n * 4) % n;
  waypointHint[index] = Math.floor(arcadeAlong[index]) % n;

  // Position on rail; yaw aims slightly ahead so turn-in starts early/smooth.
  const pos = samplePathCR(arcadeAlong[index]);
  const lookAhead = clamp(0.35 + speedWorld * 0.04, 0.4, 1.1);
  const aim = samplePathCR((arcadeAlong[index] + lookAhead) % n);

  // Match getPoseAt: side = cross(up, fwd) so desk laneOffsetM keeps grid L/R.
  const sideX = pos.fwdZ;
  const sideZ = -pos.fwdX;

  // Traffic/grid lane in metres → world units (1 u = 4 m). Hold stagger.
  const desiredLaneM = views ? views.floats[base + VehicleField.laneOffsetM] : 0;
  const laneFromDesk = Number.isFinite(desiredLaneM)
    ? clamp(desiredLaneM / 4, -1.15, 1.15)
    : 0;
  // Tiny steer only for micro adjust (not a yank across the grid).
  const laneTarget = laneFromDesk + clamp(steer, -1, 1) * 0.04;
  const prevLane = arcadeLane[index] ?? laneTarget;
  // Follow desk faster on traffic cuts so cars peel instead of ghosting.
  const laneErr = Math.abs(laneTarget - prevLane);
  const laneFollow = laneErr > 0.12 ? 0.28 : 0.14;
  arcadeLane[index] = prevLane + (laneTarget - prevLane) * laneFollow;
  const lane = arcadeLane[index];

  let x = pos.x + sideX * lane;
  let y = pos.y + PHYSICS_RIDE_HEIGHT * 0.5;
  let z = pos.z + sideZ * lane;

  // Cap pose step — blocks rare teleports if state glitches.
  const maxStep = speedWorld * fixedTimestep * 1.5 + 0.08;
  const dx = x - t.x;
  const dy = y - t.y;
  const dz = z - t.z;
  const step = Math.hypot(dx, dz);
  if (step > maxStep && step > 1e-6) {
    const s = maxStep / step;
    x = t.x + dx * s;
    z = t.z + dz * s;
    y = t.y + clamp(dy, -0.15, 0.15);
  }

  const targetYaw = Math.atan2(aim.fwdX, aim.fwdZ) + lane * 0.03;
  const prevYaw = arcadeYaw[index] ?? targetYaw;
  // ~120 deg/s max — hairpins ease, no instant kink.
  const maxYawRate = 2.1;
  arcadeYaw[index] = approachAngle(
    prevYaw,
    targetYaw,
    maxYawRate * fixedTimestep,
  );
  const yaw = arcadeYaw[index];
  const half = yaw * 0.5;
  const fwdX = Math.sin(yaw);
  const fwdZ = Math.cos(yaw);

  body.setTranslation({ x, y, z }, true);
  body.setRotation(
    { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) },
    true,
  );
  body.setLinvel({ x: fwdX * speedWorld, y: 0, z: fwdZ * speedWorld }, true);
  body.setAngvel({ x: 0, y: 0, z: 0 }, true);

  return { steeringAngle: lane * 0.45, brakeOut };
};

const applyDriverInputs = (index: number, body: RAPIER.RigidBody): void => {
  if (!views || !world) return;

  const base = vehicleBaseIndex(index);
  const floats = views.floats;
  const flags = vehicleFlagsDecode(floats[base + VehicleField.flags]);

  if (flags.kinematic) {
    // Drop rail state so pit→track re-entry cold-starts on asphalt.
    arcadeAlong[index] = undefined as unknown as number;
    arcadeLane[index] = 0;
    arcadeYaw[index] = undefined as unknown as number;
    arcadeSpeed[index] = undefined as unknown as number;
    applyKinematicFromShared(index, body);
    return;
  }

  if (trackWaypoints.length === 0) return;

  const throttle = floats[base + VehicleField.aiThrottle];
  const brake = floats[base + VehicleField.aiBrake];
  const steer = floats[base + VehicleField.aiSteer];

  floats[base + VehicleField.throttle] = throttle;

  const result = applyArcadePathDrive(index, body, throttle, brake, steer);

  // Effective scrub (may exceed AI) — drives rear lamps.
  floats[base + VehicleField.brake] = result.brakeOut;
  floats[base + VehicleField.steeringAngle] = result.steeringAngle;
  floats[base + VehicleField.groundNormalY] = 1;
  floats[base + VehicleField.flags] = vehicleFlagsEncode({
    ...flags,
    onGround: true,
  });
};

const physicsStep = (): void => {
  if (!views || !world) return;

  for (let i = 0; i < vehicles.length; i++) {
    applyDriverInputs(i, vehicles[i].body);
  }

  world.step();

  for (let i = 0; i < vehicles.length; i++) {
    writeBodyToShared(i, vehicles[i].body);
  }

  Atomics.add(views.header, HeaderIndex.physicsTick, 1);
  Atomics.add(views.header, HeaderIndex.simTimeMs, Math.round(fixedTimestep * 1000));
};

const loop = (now: number): void => {
  if (!views) return;

  if (Atomics.load(views.header, HeaderIndex.physicsRunning) === 0) {
    rafId = self.requestAnimationFrame(loop);
    return;
  }

  if (lastTime === 0) lastTime = now;
  const frameDt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  accumulator += frameDt;

  while (accumulator >= fixedTimestep) {
    physicsStep();
    accumulator -= fixedTimestep;
  }

  rafId = self.requestAnimationFrame(loop);
};

const createVehicle = (
  index: number,
  pose?: VehiclePoseInit,
): VehicleRuntime => {
  if (!world) throw new Error("World not initialized");

  const px = pose?.position[0] ?? index * 3;
  const py = pose?.position[1] ?? 1.2;
  const pz = pose?.position[2] ?? 0;
  const qx = pose?.quaternion[0] ?? 0;
  const qy = pose?.quaternion[1] ?? 0;
  const qz = pose?.quaternion[2] ?? 0;
  const qw = pose?.quaternion[3] ?? 1;

  const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(px, py, pz)
    .setRotation({ x: qx, y: qy, z: qz, w: qw })
    // Path-rail owns speed via arcadeSpeed — damping on linvel must stay 0.
    .setLinearDamping(0)
    .setAngularDamping(0.55)
    .setAdditionalMass(VEHICLE_MASS)
    .enabledRotations(false, true, false)
    .setCanSleep(false);

  const body = world.createRigidBody(bodyDesc);
  // Belt-and-suspenders: Desc damping is easy to miss at runtime in some Rapier builds.
  body.setLinearDamping(0);
  body.setAngularDamping(0.55);
  // No chassis contacts — track is raycast-only; car-car bumps are strategy/traffic.
  // (Grid start + mutual contacts shoved everyone onto grass and parked them.)
  const carGroups = 0x0002_0000;
  const colliderDesc = RAPIER.ColliderDesc.cuboid(
    CHASSIS_HALF_EXTENTS.x,
    CHASSIS_HALF_EXTENTS.y,
    CHASSIS_HALF_EXTENTS.z,
  )
    .setFriction(0.2)
    .setRestitution(0)
    .setDensity(0)
    .setCollisionGroups(carGroups)
    .setSolverGroups(carGroups);
  const collider = world.createCollider(colliderDesc, body);

  if (views) {
    const base = vehicleBaseIndex(index);
    const flags = vehicleFlagsDecode(views.floats[base + VehicleField.flags]);
    views.floats[base + VehicleField.flags] = vehicleFlagsEncode({
      ...flags,
      kinematic: pose?.kinematic ?? false,
    });
  }

  writeBodyToShared(index, body);
  return { body, collider };
};

const buildWorld = (vehicleCount: number, collider?: TrackColliderMesh, initialPoses?: VehiclePoseInit[]): void => {
  world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

  // Track visible to queries; no solver contact with cars (filter empty).
  const trackGroups = 0x0001_0000;
  if (collider && collider.vertices.length >= 9 && collider.indices.length >= 3) {
    const groundBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    world.createCollider(
      RAPIER.ColliderDesc.trimesh(collider.vertices, collider.indices)
        .setCollisionGroups(trackGroups)
        .setSolverGroups(trackGroups),
      groundBody,
    );
  } else {
    const groundBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(120, 0.2, 120)
        .setCollisionGroups(trackGroups)
        .setSolverGroups(trackGroups),
      groundBody,
    );
  }

  vehicles = [];
  for (let i = 0; i < vehicleCount; i++) {
    vehicles.push(createVehicle(i, initialPoses?.[i]));
  }
};

const resetPoses = (poses: VehiclePoseInit[]): void => {
  if (!views) return;
  for (let i = 0; i < vehicles.length && i < poses.length; i++) {
    const pose = poses[i];
    const { body } = vehicles[i];
    const q = {
      x: pose.quaternion[0],
      y: pose.quaternion[1],
      z: pose.quaternion[2],
      w: pose.quaternion[3],
    };
    body.setTranslation(
      { x: pose.position[0], y: pose.position[1], z: pose.position[2] },
      true,
    );
    body.setRotation(q, true);

    // Standing start — zero linvel; path-rail accel builds forward only.
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    arcadeAlong[i] = undefined as unknown as number;
    arcadeLane[i] = 0;
    arcadeYaw[i] = undefined as unknown as number;
    arcadeSpeed[i] = undefined as unknown as number;
    // Seed hint from desk lap so local search opens near the grid, not wp0.
    const baseHint = vehicleBaseIndex(i);
    const lapHint = views.floats[baseHint + VehicleField.lapProgress];
    waypointHint[i] =
      Number.isFinite(lapHint) && lapHint >= 0 && lapHint <= 1 && trackWaypoints.length > 0
        ? Math.floor(lapHint * trackWaypoints.length) % trackWaypoints.length
        : 0;
    // Kill stale cruise targets from last stint — standing start only.
    views.floats[baseHint + VehicleField.targetSpeedMps] = 0;
    views.floats[baseHint + VehicleField.aiThrottle] = 0;
    views.floats[baseHint + VehicleField.aiBrake] = 0;

    const base = vehicleBaseIndex(i);
    const flags = vehicleFlagsDecode(views.floats[base + VehicleField.flags]);
    views.floats[base + VehicleField.flags] = vehicleFlagsEncode({
      ...flags,
      kinematic: pose.kinematic,
    });
    writeBodyToShared(i, body);
  }
};

const init = async (message: PhysicsWorkerInit): Promise<void> => {
  await RAPIER.init();

  views = attachSharedSimState(message.buffer);
  fixedTimestep = message.fixedTimestep;
  trackWaypoints = message.waypoints ?? [];

  Atomics.store(views.header, HeaderIndex.vehicleCount, message.vehicleCount);
  Atomics.store(views.header, HeaderIndex.physicsRunning, 1);

  buildWorld(message.vehicleCount, message.collider, message.initialPoses);
  lastTime = 0;
  accumulator = 0;
  rafId = self.requestAnimationFrame(loop);
};

const shutdown = (): void => {
  if (views) {
    Atomics.store(views.header, HeaderIndex.physicsRunning, 0);
  }
  if (rafId) self.cancelAnimationFrame(rafId);
  vehicles = [];
  world?.free();
  world = null;
  views = null;
};

type PhysicsWorkerMessage =
  | { type: "init"; payload: PhysicsWorkerInit }
  | { type: "resetPoses"; payload: { poses: VehiclePoseInit[] } }
  | { type: "shutdown" };

self.onmessage = (event: MessageEvent<PhysicsWorkerMessage>) => {
  const message = event.data;
  if (message.type === "init") {
    void init(message.payload);
    return;
  }
  if (message.type === "resetPoses") {
    resetPoses(message.payload.poses);
    return;
  }
  if (message.type === "shutdown") {
    shutdown();
  }
};
