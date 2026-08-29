/** Flag campus buildings whose footprint intrudes on the track or pit lane. */
import { cornerWorld, resolveCampusPlacements } from "../src/lib/sepangCampusLayout";
import { footprintMinTrackDistanceM, TRACK_CLEARANCE_M } from "../src/lib/trackClearance";

const offenders: Array<Record<string, unknown>> = [];
for (const p of resolveCampusPlacements()) {
  const hx = p.size.x / 2;
  const hz = p.size.z / 2;
  // Sample footprint perimeter + center.
  let worst = footprintMinTrackDistanceM([
    { x: p.position.x, z: p.position.z },
    ...Array.from({ length: 0 }),
  ]);
  const STEPS = 8;
  for (let e = 0; e < 4; e += 1) {
    for (let s = 0; s <= STEPS; s += 1) {
      const f = (s / STEPS) * 2 - 1;
      const [lx, lz] =
        e === 0 ? [hx, f * hz] : e === 1 ? [-hx, f * hz] : e === 2 ? [f * hx, hz] : [f * hx, -hz];
      const c = cornerWorld(p.position, p.yaw, lx, lz);
      worst = Math.min(worst, footprintMinTrackDistanceM([{ x: c.x, z: c.z }]));
    }
  }
  if (worst < TRACK_CLEARANCE_M) {
    offenders.push({
      id: p.id,
      segment: `${p.segmentIndex + 1}/${p.segmentCount}`,
      minDistanceM: +worst.toFixed(1),
      pos: { x: +p.position.x.toFixed(1), z: +p.position.z.toFixed(1) },
    });
  }
}

console.log(JSON.stringify({ offenders, checked: resolveCampusPlacements().length }, null, 2));
