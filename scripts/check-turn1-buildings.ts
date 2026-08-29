import { resolveCampusPlacements, cornerWorld } from "../src/lib/sepangCampusLayout";
import { minDistanceToTrackM } from "../src/lib/trackClearance";
import { getPoseAt } from "../src/lib/trackCurve";

const near = resolveCampusPlacements().filter((p) => {
  const t = p.def.t;
  return (t > 0.05 && t < 0.15) || !!p.def.fixedWorld;
});

for (const p of near) {
  const hx = p.size.x / 2;
  const hz = p.size.z / 2;
  let worst = minDistanceToTrackM(p.position.x, p.position.z);
  for (const [lx, lz] of [
    [-hx, -hz],
    [-hx, hz],
    [hx, -hz],
    [hx, hz],
  ]) {
    const c = cornerWorld(p.position, p.yaw, lx, lz);
    worst = Math.min(worst, minDistanceToTrackM(c.x, c.z));
  }
  const pose = getPoseAt(p.def.t ?? 0);
  console.log(
    JSON.stringify({
      id: p.id,
      seg: p.segmentIndex,
      t: p.def.t,
      bank: p.def.bank,
      clearance: p.def.lateralClearanceM,
      pos: { x: +p.position.x.toFixed(2), z: +p.position.z.toFixed(2) },
      yaw: +p.yaw.toFixed(3),
      sizeU: { x: +p.size.x.toFixed(2), z: +p.size.z.toFixed(2) },
      minDistM: +worst.toFixed(2),
      side: { x: +pose.side.x.toFixed(3), z: +pose.side.z.toFixed(3) },
    }),
  );
}
