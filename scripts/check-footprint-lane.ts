import { resolveCampusPlacements, cornerWorld } from "../src/lib/sepangCampusLayout";
import { projectWorldToTrack } from "../src/lib/trackProjection";
import { FIA } from "../src/lib/trackCurve";

const half = FIA.trackWidthStartM / 2;

const sampleFootprint = (p: ReturnType<typeof resolveCampusPlacements>[0]): void => {
  const hx = p.size.x / 2;
  const hz = p.size.z / 2;
  let worstLane = Infinity;
  let worstT = 0;
  let worstPt = { x: 0, z: 0 };
  const STEPS = 24;
  for (let edge = 0; edge < 4; edge += 1) {
    for (let s = 0; s <= STEPS; s += 1) {
      const f = (s / STEPS) * 2 - 1;
      const [lx, lz] =
        edge === 0
          ? [hx, f * hz]
          : edge === 1
            ? [-hx, f * hz]
            : edge === 2
              ? [f * hx, hz]
              : [f * hx, -hz];
      const c = cornerWorld(p.position, p.yaw, lx, lz);
      const pr = projectWorldToTrack(c.x, c.z);
      if (pr.lapProgress < 0.07 || pr.lapProgress > 0.13) continue;
      const absLane = Math.abs(pr.laneOffsetM);
      if (absLane < worstLane) {
        worstLane = absLane;
        worstT = pr.lapProgress;
        worstPt = { x: c.x, z: c.z };
      }
    }
  }
  const onTrack = worstLane <= half;
  console.log(
    JSON.stringify({
      id: p.id,
      seg: p.segmentIndex,
      worstLaneM: +worstLane.toFixed(2),
      atT: +worstT.toFixed(3),
      onTrack,
      pt: { x: +worstPt.x.toFixed(2), z: +worstPt.z.toFixed(2) },
      pos: { x: +p.position.x.toFixed(2), z: +p.position.z.toFixed(2) },
      bank: p.def.bank,
      clearanceM: p.def.lateralClearanceM,
    }),
  );
};

for (const p of resolveCampusPlacements()) {
  if (p.id === "k1" || (p.def.t > 0.06 && p.def.t < 0.14)) {
    sampleFootprint(p);
  }
}
