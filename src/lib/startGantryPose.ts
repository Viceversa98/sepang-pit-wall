import * as THREE from "three";
import { getStartFinishPose, metresToUnits } from "@/lib/trackCurve";

/** Start gantry over the S/F line — a few metres ahead so the grid sees all five reds. */
export const getStartGantryPose = (): {
  position: THREE.Vector3;
  yaw: number;
} => {
  const sf = getStartFinishPose();
  const position = sf.position
    .clone()
    .addScaledVector(sf.tangent, metresToUnits(3));
  position.y += metresToUnits(0.05);
  const yaw = Math.atan2(sf.tangent.x, sf.tangent.z);
  return { position, yaw };
};
