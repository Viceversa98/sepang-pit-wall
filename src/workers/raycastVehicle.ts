/**
 * Rapier raycast vehicle — 4 downward rays + spring/damper + tire forces.
 * Rapier has no built-in RaycastVehicle (unlike cannon-es); this is the in-worker controller.
 *
 * World scale: 1 unit = 4 m. Gravity stays -9.81 in world units (game-tuned).
 * Chassis / wheels sized to FIA-ish footprint so they fit the ~15 m ribbon.
 */
import type RAPIER from "@dimforge/rapier3d-compat";

export type Vec3 = { x: number; y: number; z: number };

export type WheelConfig = {
  chassisConnectionLocal: Vec3;
  radius: number;
  restLength: number;
  maxTravel: number;
  stiffness: number;
  damping: number;
  frictionSlip: number;
  isFront: boolean;
};

export type VehicleInputs = {
  throttle: number;
  brake: number;
  steer: number;
};

export type RaycastVehicleResult = {
  onGround: boolean;
  groundNormalY: number;
  steeringAngle: number;
  wheelsInContact: number;
};

/** Half-width ~0.28, half-length ~0.75 (≈2.2 m × 6 m). */
export const CHASSIS_HALF_EXTENTS = { x: 0.28, y: 0.18, z: 0.72 } as const;

/** Mass in game units — pairs with spring stiffness below. */
export const VEHICLE_MASS = 320;

/** Chassis COM height above asphalt when suspension is near rest. */
export const PHYSICS_RIDE_HEIGHT = 0.42;

/**
 * Wheel hardpoints near chassis corners.
 * At rest: spring supports ~mass*g/4 ≈ 785 N → stiffness*compression ≈ 785 ⇒
 * compression ≈ 0.08 at k=9800.
 */
export const DEFAULT_WHEELS: readonly WheelConfig[] = [
  {
    chassisConnectionLocal: { x: 0.26, y: -0.02, z: 0.55 },
    radius: 0.16,
    restLength: 0.28,
    maxTravel: 0.14,
    stiffness: 5200,
    damping: 1100,
    frictionSlip: 2.4,
    isFront: true,
  },
  {
    chassisConnectionLocal: { x: -0.26, y: -0.02, z: 0.55 },
    radius: 0.16,
    restLength: 0.28,
    maxTravel: 0.14,
    stiffness: 5200,
    damping: 1100,
    frictionSlip: 2.4,
    isFront: true,
  },
  {
    chassisConnectionLocal: { x: 0.26, y: -0.02, z: -0.55 },
    radius: 0.16,
    restLength: 0.28,
    maxTravel: 0.14,
    stiffness: 5200,
    damping: 1100,
    frictionSlip: 2.6,
    isFront: false,
  },
  {
    chassisConnectionLocal: { x: -0.26, y: -0.02, z: -0.55 },
    radius: 0.16,
    restLength: 0.28,
    maxTravel: 0.14,
    stiffness: 5200,
    damping: 1100,
    frictionSlip: 2.6,
    isFront: false,
  },
];

const MAX_STEER = 0.72;
const ENGINE_FORCE = 1000;
const BRAKE_FORCE = 1600;
const LAT_FORCE_GAIN = 620;
const LAT_FORCE_MAX = 2200;
const DOWNFORCE_BASE = 25;
const DOWNFORCE_SPEED = 1.2;
const SPRING_FORCE_MAX = 9000;
const REBOUND_FORCE_MAX = 3500;

const rotateByQuat = (q: Vec3 & { w: number }, v: Vec3): Vec3 => {
  const { x: qx, y: qy, z: qz, w: qw } = q;
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

const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

const applyForceAtPoint = (
  body: RAPIER.RigidBody,
  force: Vec3,
  worldPoint: Vec3,
  dt: number,
): void => {
  const impulse = { x: force.x * dt, y: force.y * dt, z: force.z * dt };
  const origin = body.translation();
  const r = {
    x: worldPoint.x - origin.x,
    y: worldPoint.y - origin.y,
    z: worldPoint.z - origin.z,
  };
  const torque = cross(r, impulse);
  body.applyImpulse(impulse, true);
  body.applyTorqueImpulse(torque, true);
};

export const stepRaycastVehicle = (
  RAPIER: typeof import("@dimforge/rapier3d-compat").default,
  world: RAPIER.World,
  body: RAPIER.RigidBody,
  wheels: readonly WheelConfig[],
  inputs: VehicleInputs,
  dt: number,
): RaycastVehicleResult => {
  const rotation = body.rotation();
  const origin = body.translation();
  const linvel = body.linvel();
  const angvel = body.angvel();
  const speed = Math.hypot(linvel.x, linvel.z);
  const steerAngle = Math.max(-1, Math.min(1, inputs.steer)) * MAX_STEER;

  const chassisUp = rotateByQuat(rotation, { x: 0, y: 1, z: 0 });
  const chassisFwd = rotateByQuat(rotation, { x: 0, y: 0, z: 1 });
  const chassisRight = rotateByQuat(rotation, { x: 1, y: 0, z: 0 });

  let wheelsInContact = 0;
  let normalYSum = 0;

  for (const wheel of wheels) {
    const connOffset = rotateByQuat(rotation, wheel.chassisConnectionLocal);
    const connWorld = {
      x: origin.x + connOffset.x,
      y: origin.y + connOffset.y,
      z: origin.z + connOffset.z,
    };

    const down = { x: -chassisUp.x, y: -chassisUp.y, z: -chassisUp.z };
    const maxToi = wheel.restLength + wheel.maxTravel + wheel.radius + 0.35;
    const ray = new RAPIER.Ray(connWorld, down);
    const hit = world.castRay(
      ray,
      maxToi,
      true,
      undefined,
      undefined,
      undefined,
      body,
    );

    if (!hit) continue;

    const suspensionLength = Math.max(0, hit.timeOfImpact - wheel.radius);
    const compression = wheel.restLength - suspensionLength;
    if (compression < -wheel.maxTravel) continue;

    wheelsInContact += 1;
    normalYSum += chassisUp.y;

    const contactPoint = {
      x: connWorld.x + down.x * hit.timeOfImpact,
      y: connWorld.y + down.y * hit.timeOfImpact,
      z: connWorld.z + down.z * hit.timeOfImpact,
    };

    // compressVel > 0 when chassis moves into the ground (along down).
    const compressVel =
      linvel.x * down.x + linvel.y * down.y + linvel.z * down.z;
    // Damper resists compression rate: adds lift when slamming down, pulls down on rebound.
    const springForce =
      wheel.stiffness * Math.max(0, compression) + wheel.damping * compressVel;
    const clampedSpring = Math.max(
      -REBOUND_FORCE_MAX,
      Math.min(SPRING_FORCE_MAX, springForce),
    );

    applyForceAtPoint(
      body,
      {
        x: chassisUp.x * clampedSpring,
        y: chassisUp.y * clampedSpring,
        z: chassisUp.z * clampedSpring,
      },
      contactPoint,
      dt,
    );

    const wheelSteer = wheel.isFront ? steerAngle : 0;
    const cos = Math.cos(wheelSteer);
    const sin = Math.sin(wheelSteer);
    const wheelFwd = {
      x: chassisFwd.x * cos + chassisRight.x * sin,
      y: 0,
      z: chassisFwd.z * cos + chassisRight.z * sin,
    };
    const fwdLen = Math.hypot(wheelFwd.x, wheelFwd.z) || 1;
    wheelFwd.x /= fwdLen;
    wheelFwd.z /= fwdLen;

    const wheelRight = {
      x: chassisUp.y * wheelFwd.z - chassisUp.z * wheelFwd.y,
      y: chassisUp.z * wheelFwd.x - chassisUp.x * wheelFwd.z,
      z: chassisUp.x * wheelFwd.y - chassisUp.y * wheelFwd.x,
    };
    const rightLen = Math.hypot(wheelRight.x, wheelRight.y, wheelRight.z) || 1;
    wheelRight.x /= rightLen;
    wheelRight.y /= rightLen;
    wheelRight.z /= rightLen;

    const rx = contactPoint.x - origin.x;
    const rz = contactPoint.z - origin.z;
    // v_contact = v_com + ω × r  (ω = (0,ωy,0) → (ωy·rz, 0, −ωy·rx))
    // Inverted signs here caused yaw positive-feedback / continuous spin.
    const contactVel = {
      x: linvel.x + angvel.y * rz,
      y: linvel.y,
      z: linvel.z - angvel.y * rx,
    };

    const latSpeed =
      contactVel.x * wheelRight.x +
      contactVel.y * wheelRight.y +
      contactVel.z * wheelRight.z;
    const longSpeed = contactVel.x * wheelFwd.x + contactVel.z * wheelFwd.z;

    const loadFactor =
      0.45 + 0.55 * Math.min(1, Math.max(0, clampedSpring) / 2000);
    const grip = wheel.frictionSlip * loadFactor;
    const latForce = Math.max(
      -LAT_FORCE_MAX * grip,
      Math.min(LAT_FORCE_MAX * grip, -latSpeed * LAT_FORCE_GAIN * grip),
    );

    let longForce = 0;
    if (!wheel.isFront) {
      longForce += inputs.throttle * ENGINE_FORCE;
    }
    longForce -= inputs.brake * BRAKE_FORCE * (wheel.isFront ? 0.6 : 0.4);
    if (inputs.brake <= 0.05 && inputs.throttle < 0.05) {
      longForce -= longSpeed * 28;
    }

    applyForceAtPoint(
      body,
      {
        x: wheelRight.x * latForce + wheelFwd.x * longForce,
        y: wheelRight.y * latForce,
        z: wheelRight.z * latForce + wheelFwd.z * longForce,
      },
      contactPoint,
      dt,
    );
  }

  const downforce = DOWNFORCE_BASE + speed * DOWNFORCE_SPEED;
  body.applyImpulse({ x: 0, y: -downforce * dt, z: 0 }, true);

  return {
    onGround: wheelsInContact >= 2,
    groundNormalY: wheelsInContact > 0 ? normalYSum / wheelsInContact : 0,
    steeringAngle: steerAngle,
    wheelsInContact,
  };
};
