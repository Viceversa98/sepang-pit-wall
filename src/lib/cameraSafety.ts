import * as THREE from "three";

/** Race overview + chase — Sepang campus fits inside this frustum. */
export const RACE_CAMERA_NEAR = 1.0;
/** Wider near on mobile — 24-bit depth buffer loses precision at 0.01–0.5 near + large far. */
export const RACE_CAMERA_NEAR_MOBILE = 2.0;
export const RACE_CAMERA_FAR = 3000;

/** Prevent chase/overview camera dipping under track floor on bad physics frames. */
export const MIN_CAMERA_Y = 0.5;

/** Max overview target step per frame (prevents physics/worker jumps from flinging the camera). */
export const MAX_CAMERA_PAN_UNITS_PER_FRAME = 12;

export const clampSimDelta = (delta: number, max = 0.1): number =>
  Math.min(Math.max(delta, 0), max);

export const isFiniteVec3 = (v: THREE.Vector3): boolean =>
  Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

/** Clamp Y after finite check — returns false if input was non-finite. */
export const clampCameraY = (v: THREE.Vector3, minY = MIN_CAMERA_Y): boolean => {
  if (!isFiniteVec3(v)) return false;
  if (v.y < minY) v.y = minY;
  return true;
};

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
