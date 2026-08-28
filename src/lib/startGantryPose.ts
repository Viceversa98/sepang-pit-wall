import * as THREE from "three";
import { getGridSlot, metresToUnits } from "@/lib/trackCurve";

/** Start gantry ~22 m ahead of pole — in front of the grid, visible from overview/follow. */
export const getStartGantryPose = (): {
  position: THREE.Vector3;
  yaw: number;
} => {
  const pole = getGridSlot(0);
  const position = pole.position
    .clone()
    .addScaledVector(pole.tangent, metresToUnits(22));
  position.y += metresToUnits(0.4);
  const yaw = Math.atan2(pole.tangent.x, pole.tangent.z);
  return { position, yaw };
};
