import * as THREE from "three";
import { createRoadRibbon } from "@/lib/roadGeometry";
import { FIA, getTrackCurve, metresToUnits } from "@/lib/trackCurve";

const MAIN_WIDTH = metresToUnits(FIA.trackWidthStartM);
/** Extra runoff so raycast tires still find ground near the painted edges. */
const COLLIDER_WIDTH = MAIN_WIDTH * 2.4;

export type TrackColliderMesh = {
  vertices: Float32Array;
  indices: Uint32Array;
};

/**
 * Rapier trimesh for the circuit (closed loop).
 * Wider than visual asphalt so cars do not fall into the void at the kerb.
 */
export const buildTrackCollider = (): TrackColliderMesh => {
  const mainGeo = createRoadRibbon(getTrackCurve(), {
    width: COLLIDER_WIDTH,
    segments: 640,
    closed: true,
    yOffset: 0.02,
  });

  const posAttr = mainGeo.attributes.position as THREE.BufferAttribute;
  const vertices = new Float32Array(posAttr.array);

  const indexAttr = mainGeo.index;
  let indices: Uint32Array;
  if (indexAttr) {
    indices = new Uint32Array(indexAttr.array);
  } else {
    indices = new Uint32Array(posAttr.count);
    for (let i = 0; i < posAttr.count; i++) indices[i] = i;
  }

  mainGeo.dispose();
  return { vertices, indices };
};
