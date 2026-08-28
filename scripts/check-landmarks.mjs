import * as THREE from "three";
import {
  CAMPUS_BUILDINGS,
  cornerWorld,
  MAIN_HALF,
  resolveCampusPlacements,
} from "../src/lib/sepangCampusLayout.ts";
import { getTrackCurve, metresToUnits } from "../src/lib/trackCurve.ts";

const CLEAR_MIN = MAIN_HALF + metresToUnits(14);

const minDistToTrack = (p) => {
  const curve = getTrackCurve();
  let best = Infinity;
  for (let i = 0; i <= 1200; i++) {
    const q = curve.getPointAt(i / 1200);
    const d = Math.hypot(p.x - q.x, p.z - q.z);
    if (d < best) best = d;
  }
  return best;
};

const placements = resolveCampusPlacements();
let failed = 0;

console.log({
  MAIN_HALF,
  CLEAR_MIN,
  buildings: CAMPUS_BUILDINGS.length,
  placements: placements.length,
});

for (const p of placements) {
  if (p.def.fixedWorld) {
    console.log(p.id, `#${p.segmentIndex}`, "fixedWorld", "SKIP");
    continue;
  }
  const hx = p.size.x / 2;
  const hz = p.size.z / 2;
  const corners = [
    [-hx, -hz],
    [-hx, hz],
    [hx, -hz],
    [hx, hz],
  ].map(([x, z]) => cornerWorld(p.position, p.yaw, x, z));
  const min = Math.min(...corners.map(minDistToTrack));
  const status = min < CLEAR_MIN ? "TOO_CLOSE" : "CLEAR";
  if (status !== "CLEAR") failed += 1;
  console.log(p.id, `#${p.segmentIndex}`, "minCorner", min.toFixed(3), status);
}

if (failed > 0) {
  console.error(`${failed} placement(s) too close to the racing ribbon`);
  process.exit(1);
}
console.log("all campus footprints CLEAR of racing ribbon (+14m buffer)");
