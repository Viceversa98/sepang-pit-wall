import * as THREE from "three";
import {
  getGridSlot,
  getPitBoxT,
  getPitCurve,
  getTrackCurve,
  metresToUnits,
  pitBoxLaneBlend,
  PIT_BOX_LATERAL,
  PIT_ENTRY_T,
  PIT_EXIT_T,
} from "@/lib/trackCurve";
import { JACK_LIFT_M, PIT_POSE_BLEND } from "@/lib/pitStop";
import type { CarState, RacePhase } from "@/stores/raceStore";

const UP = new THREE.Vector3(0, 1, 0);
const _trackPoint = new THREE.Vector3();
const _trackTan = new THREE.Vector3();
const _pitPoint = new THREE.Vector3();
const _pitTan = new THREE.Vector3();
const _blendPoint = new THREE.Vector3();
const _blendTan = new THREE.Vector3();
const _side = new THREE.Vector3();

/** Keep mesh wheels just above asphalt ribbon. */
export const ASPHALT_LIFT = metresToUnits(0.06);
export const JACK_LIFT = metresToUnits(JACK_LIFT_M);

export type CarWorldPose = {
  position: THREE.Vector3;
  tangent: THREE.Vector3;
};

const wrap01 = (t: number): number => ((t % 1) + 1) % 1;

const smoothstep = (k: number): number => {
  const x = Math.min(1, Math.max(0, k));
  return x * x * (3 - 2 * x);
};

/**
 * World pose for a car — shared by Car mesh + FollowCamera.
 * Pit: left FAST lane for transit; pull RIGHT into own box only; on out
 * merge LEFT to fast lane so exit never cuts through other stalls.
 */
export const sampleCarPose = (
  car: CarState,
  phase: RacePhase,
  _carId: string,
  gridIndex: number,
  out?: CarWorldPose,
): CarWorldPose => {
  const position = out?.position ?? new THREE.Vector3();
  const tangent = out?.tangent ?? new THREE.Vector3();

  if ((phase === "starting" || phase === "ready") && gridIndex >= 0) {
    const slot = getGridSlot(gridIndex);
    position.copy(slot.position);
    position.y += ASPHALT_LIFT;
    tangent.copy(slot.tangent).normalize();
    return { position, tangent };
  }

  const trackCurve = getTrackCurve();
  const pitCurve = getPitCurve();
  const lane = car.isBoxing ? 0 : metresToUnits(car.laneOffsetM);

  let point: THREE.Vector3;
  let tan: THREE.Vector3;

  if (car.isBoxing) {
    const progress = Math.min(1, Math.max(0, car.pitProgress));
    _pitPoint.copy(pitCurve.getPointAt(progress));
    _pitTan.copy(pitCurve.getTangentAt(progress)).normalize();

    if (progress < PIT_POSE_BLEND) {
      const w = smoothstep(progress / PIT_POSE_BLEND);
      _trackPoint.copy(trackCurve.getPointAt(wrap01(PIT_ENTRY_T)));
      _trackTan.copy(trackCurve.getTangentAt(wrap01(PIT_ENTRY_T))).normalize();
      point = _blendPoint.copy(_trackPoint).lerp(_pitPoint, w);
      tan = _blendTan.copy(_trackTan).lerp(_pitTan, w).normalize();
    } else if (progress > 1 - PIT_POSE_BLEND) {
      const w = smoothstep((progress - (1 - PIT_POSE_BLEND)) / PIT_POSE_BLEND);
      _trackPoint.copy(trackCurve.getPointAt(wrap01(PIT_EXIT_T)));
      _trackTan.copy(trackCurve.getTangentAt(wrap01(PIT_EXIT_T))).normalize();
      point = _blendPoint.copy(_pitPoint).lerp(_trackPoint, w);
      tan = _blendTan.copy(_pitTan).lerp(_trackTan, w).normalize();
    } else {
      point = _pitPoint;
      tan = _pitTan;
    }

    // Lateral: 0 = left fast lane, 1 = right box (own stall only)
    const boxT = getPitBoxT(car.pitBoxIndex);
    const boxBlend = smoothstep(
      pitBoxLaneBlend(progress, boxT, car.pitPhase, car.pitHoldTraffic),
    );
    _side.crossVectors(UP, tan).normalize();
    // Driver-right toward building
    position.copy(point).addScaledVector(_side, -PIT_BOX_LATERAL * boxBlend);
  } else {
    const t = wrap01(car.lapProgress);
    point = trackCurve.getPointAt(t);
    tan = trackCurve.getTangentAt(t).normalize();
    _side.crossVectors(UP, tan).normalize();
    position.copy(point).addScaledVector(_side, lane);
  }

  position.y += ASPHALT_LIFT;

  const jacked =
    car.isBoxing &&
    (car.pitPhase === "stopped" || car.pitHoldTraffic) &&
    car.pitStopElapsed > 0.05;
  if (jacked) {
    position.y += JACK_LIFT;
  }

  tangent.copy(tan!);

  return { position, tangent };
};
