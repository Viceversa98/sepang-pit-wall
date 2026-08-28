import * as THREE from "three";

/** F1CarMesh nose is +Z; physics, AI, and cameras share this axis. */
export const VEHICLE_FORWARD = new THREE.Vector3(0, 0, 1);

const _tangent = new THREE.Vector3();

export const quatFromTangent = (
  tangent: THREE.Vector3,
  out = new THREE.Quaternion(),
): THREE.Quaternion =>
  out.setFromUnitVectors(VEHICLE_FORWARD, _tangent.copy(tangent).normalize());

/** Yaw (rad) in the XZ plane for a body quaternion with +Z forward. */
export const headingFromQuaternion = (
  qx: number,
  qy: number,
  qz: number,
  qw: number,
): number => {
  const x = 2 * (qx * qz + qw * qy);
  const z = 1 - 2 * (qx * qx + qy * qy);
  return Math.atan2(x, z);
};

export const forwardFromQuaternion = (
  qx: number,
  qy: number,
  qz: number,
  qw: number,
  out = new THREE.Vector3(),
): THREE.Vector3 => {
  out.set(2 * (qx * qz + qw * qy), 0, 1 - 2 * (qx * qx + qy * qy));
  return out.normalize();
};
