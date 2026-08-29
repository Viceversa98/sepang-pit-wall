import * as THREE from "three";

/** Race overview + chase — Sepang campus fits inside this frustum. */
export const RACE_CAMERA_NEAR = 0.5;
export const RACE_CAMERA_FAR = 5000;

/** Max overview target step per frame (prevents physics/worker jumps from flinging the camera). */
export const MAX_CAMERA_PAN_UNITS_PER_FRAME = 12;

export const clampSimDelta = (delta: number, max = 0.1): number =>
  Math.min(Math.max(delta, 0), max);

export const isFiniteVec3 = (v: THREE.Vector3): boolean =>
  Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

/** Shorten delta if a worker hiccup teleports the target. */
export const clampPanDelta = (
  delta: THREE.Vector3,
  maxLength = MAX_CAMERA_PAN_UNITS_PER_FRAME,
): THREE.Vector3 => {
  if (!isFiniteVec3(delta)) {
    delta.set(0, 0, 0);
    return delta;
  }
  const lenSq = delta.lengthSq();
  const maxSq = maxLength * maxLength;
  if (lenSq > maxSq) delta.multiplyScalar(maxLength / Math.sqrt(lenSq));
  return delta;
};

export const safeLookAt = (
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3,
): boolean => {
  if (!isFiniteVec3(camera.position) || !isFiniteVec3(target)) return false;
  camera.lookAt(target);
  return true;
};
