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

export type PhysicsWorkerInit = {
  buffer: SharedArrayBuffer;
  fixedTimestep: number;
  vehicleCount: number;
  collider?: TrackColliderMesh;
  initialPoses?: VehiclePoseInit[];
};

type VehicleRuntime = {
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
};

let views: SharedSimViews | null = null;
let world: RAPIER.World | null = null;
let vehicles: VehicleRuntime[] = [];
let fixedTimestep = 1 / 60;
let accumulator = 0;
let lastTime = 0;
let rafId = 0;

const rotateVectorByQuat = (
  q: { x: number; y: number; z: number; w: number },
  v: { x: number; y: number; z: number },
): { x: number; y: number; z: number } => {
  const qx = q.x;
  const qy = q.y;
  const qz = q.z;
  const qw = q.w;
  const ix = qw * v.x + qy * v.z - qz * v.y;
  const iy = qw * v.y + qz * v.x - qx * v.z;
  const iz = qw * v.z + qx * v.y - qy * v.x;
  const iw = -qx * v.x - qy * v.y - qz * v.z;
  return {
    x: ix * qw + iw * -qx + iy * -qz - iz * -qy,
    y: iy * qw + iw * -qy + iz * -qx - ix * -qz,
    z: iz * qw + iw * -qz + ix * -qy - iy * -qx,
  };
};

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
  floats[base + VehicleField.speed] = flags.kinematic ? kinematicSpeed : speed;
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

const applyDriverInputs = (index: number, body: RAPIER.RigidBody): void => {
  if (!views || !world) return;

  const base = vehicleBaseIndex(index);
  const floats = views.floats;
  const flags = vehicleFlagsDecode(floats[base + VehicleField.flags]);

  if (flags.kinematic) {
    applyKinematicFromShared(index, body);
    return;
  }

  const throttle = floats[base + VehicleField.aiThrottle];
  const brake = floats[base + VehicleField.aiBrake];
  const steer = floats[base + VehicleField.aiSteer];

  floats[base + VehicleField.steeringAngle] = steer;
  floats[base + VehicleField.throttle] = throttle;
  floats[base + VehicleField.brake] = brake;

  const rotation = body.rotation();
  const fwd = rotateVectorByQuat(rotation, { x: 0, y: 0, z: 1 });
  const speed = Math.hypot(body.linvel().x, body.linvel().z);

  const engineForce = 420 * throttle;
  const brakeForce = 520 * brake;

  body.applyImpulse(
    {
      x: fwd.x * engineForce * fixedTimestep,
      y: 0,
      z: fwd.z * engineForce * fixedTimestep,
    },
    true,
  );

  const linvel = body.linvel();
  const lateral = rotateVectorByQuat(rotation, { x: 1, y: 0, z: 0 });
  const lateralSpeed = linvel.x * lateral.x + linvel.z * lateral.z;
  const lateralDamp = Math.min(1, 14 * fixedTimestep);
  body.applyImpulse(
    {
      x: -lateral.x * lateralSpeed * lateralDamp * 58,
      y: 0,
      z: -lateral.z * lateralSpeed * lateralDamp * 58,
    },
    true,
  );

  const downforce = 12 + speed * 0.35;
  body.applyImpulse({ x: 0, y: -downforce * fixedTimestep, z: 0 }, true);

  if (brakeForce > 0) {
    body.setLinvel(
      {
        x: linvel.x * (1 - brakeForce * fixedTimestep * 0.0035),
        y: linvel.y,
        z: linvel.z * (1 - brakeForce * fixedTimestep * 0.0035),
      },
      true,
    );
  }

  const steerGain = 110 + Math.min(speed, 75) * 1.8;
  const yawTorque = steer * steerGain;
  body.applyTorqueImpulse({ x: 0, y: yawTorque * fixedTimestep, z: 0 }, true);

  const origin = body.translation();
  const ray = new RAPIER.Ray(
    { x: origin.x, y: origin.y + 0.4, z: origin.z },
    { x: 0, y: -1, z: 0 },
  );
  const hit = world.castRay(ray, 2.5, true);
  const onGround = hit !== null;
  floats[base + VehicleField.groundNormalY] = onGround ? 1 : 0;
  floats[base + VehicleField.flags] = vehicleFlagsEncode({ ...flags, onGround });
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
    .setLinearDamping(0.08)
    .setAngularDamping(0.65)
    .enabledRotations(false, true, false);

  const body = world.createRigidBody(bodyDesc);
  const colliderDesc = RAPIER.ColliderDesc.cuboid(0.9, 0.35, 2.1)
    .setFriction(1.35)
    .setRestitution(0.02);
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

  if (collider && collider.vertices.length >= 9 && collider.indices.length >= 3) {
    const groundBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    world.createCollider(
      RAPIER.ColliderDesc.trimesh(collider.vertices, collider.indices),
      groundBody,
    );
  } else {
    const groundBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    world.createCollider(RAPIER.ColliderDesc.cuboid(120, 0.2, 120), groundBody);
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
    body.setTranslation(
      { x: pose.position[0], y: pose.position[1], z: pose.position[2] },
      true,
    );
    body.setRotation(
      { x: pose.quaternion[0], y: pose.quaternion[1], z: pose.quaternion[2], w: pose.quaternion[3] },
      true,
    );
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);

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
