import * as THREE from "three";
import { sampleCarPose, type CarWorldPose } from "@/lib/carPose";
import { VEHICLE_FORWARD } from "@/lib/vehicleOrientation";
import { metresToUnits } from "@/lib/trackCurve";
import type { CameraMode, CarState, RacePhase } from "@/stores/raceStore";

const BACK = metresToUnits(14);
const HEIGHT = metresToUnits(5.5);
const LOOK_AHEAD = metresToUnits(12);
const SIDE = metresToUnits(2.2);
const LERP = 10;

const _side = new THREE.Vector3();

export type FollowCameraState = {
  snapped: boolean;
  desired: THREE.Vector3;
  lookAt: THREE.Vector3;
  up: THREE.Vector3;
  poseScratch: CarWorldPose;
};

export const createFollowCameraState = (): FollowCameraState => ({
  snapped: false,
  desired: new THREE.Vector3(),
  lookAt: new THREE.Vector3(),
  up: new THREE.Vector3(0, 1, 0),
  poseScratch: {
    position: new THREE.Vector3(),
    tangent: new THREE.Vector3(),
  },
});

const _tangent = new THREE.Vector3();

/**
 * Elevated chase cam behind the player. Only runs when mode === "follow".
 */
export const updateFollowCamera = (
  camera: THREE.PerspectiveCamera,
  car: CarState,
  phase: RacePhase,
  gridIndex: number,
  mode: CameraMode,
  delta: number,
  state: FollowCameraState,
  carGroup?: THREE.Object3D,
): void => {
  if (mode !== "follow") {
    state.snapped = false;
    return;
  }

  let position = state.poseScratch.position;
  let tangent = state.poseScratch.tangent;

  if (carGroup && !car.isBoxing) {
    position = carGroup.position;
    _tangent.copy(VEHICLE_FORWARD).applyQuaternion(carGroup.quaternion).normalize();
    tangent = _tangent;
  } else {
    const pose = sampleCarPose(car, phase, car.id, gridIndex, state.poseScratch);
    position = pose.position;
    tangent = pose.tangent;
  }

  const side = _side.crossVectors(state.up, tangent).normalize();

  state.desired
    .copy(position)
    .addScaledVector(tangent, -BACK)
    .addScaledVector(state.up, HEIGHT)
    .addScaledVector(side, SIDE);

  state.lookAt.copy(position).addScaledVector(tangent, LOOK_AHEAD);

  // During racing the mesh already moves smoothly every frame — lagging the
  // camera behind the car while lookAt snaps instantly was the jerk (overview
  // avoids this by rigidly translating camera + target together).
  const hardLock = Boolean(carGroup);

  if (hardLock || !state.snapped) {
    camera.position.copy(state.desired);
    state.snapped = true;
  } else {
    const t = 1 - Math.exp(-LERP * delta);
    camera.position.lerp(state.desired, t);
  }

  camera.up.copy(state.up);
  camera.lookAt(state.lookAt);
};
