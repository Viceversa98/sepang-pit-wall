/**
 * Report campus placements + OSM centroids vs TRACK_CLEARANCE_M.
 * Campus uses rotated AABB footprints (centroids alone miss fold overlaps).
 * Run: nub x tsx --tsconfig tsconfig.json scripts/check-track-clearance.ts
 */
import { resolveCampusPlacements, cornerWorld } from "../src/lib/sepangCampusLayout.ts";
import { projectWorldToTrack } from "../src/lib/trackProjection.ts";
import {
  TRACK_CLEARANCE_M,
  TRACK_HALF_M,
  footprintClearsTrack,
  footprintMinTrackDistanceM,
} from "../src/lib/trackClearance.ts";
import osm from "../src/data/sepang-osm-buildings.json" with { type: "json" };

const placementRing = (
  p: ReturnType<typeof resolveCampusPlacements>[number],
): { x: number; z: number }[] => {
  const hx = p.size.x / 2;
  const hz = p.size.z / 2;
  return [
    cornerWorld(p.position, p.yaw, -hx, -hz),
    cornerWorld(p.position, p.yaw, hx, -hz),
    cornerWorld(p.position, p.yaw, hx, hz),
    cornerWorld(p.position, p.yaw, -hx, hz),
  ];
};

const placements = resolveCampusPlacements();
console.log(`clearance limit ${TRACK_CLEARANCE_M} m  half-width ${TRACK_HALF_M} m`);
console.log("--- campus footprints (all segments) ---");
let campusOn = 0;
for (const p of placements) {
  const ring = placementRing(p);
  const clears = footprintClearsTrack(ring);
  const minD = footprintMinTrackDistanceM(ring);
  const proj = projectWorldToTrack(p.position.x, p.position.z);
  const ok = clears && minD >= TRACK_CLEARANCE_M;
  if (!ok) campusOn += 1;
  console.log(
    `${ok ? "OK" : "ON_TRACK"}  ${`${p.id}#${p.segmentIndex}`.padEnd(30)} laneM=${proj.laneOffsetM.toFixed(1).padStart(6)}  minD=${minD.toFixed(1).padStart(5)}  t=${proj.lapProgress.toFixed(3)}`,
  );
}

console.log("--- OSM centroids (backdrop still footprint-filters) ---");
let on = 0;
let off = 0;
const offenders: string[] = [];
for (const b of osm.buildings) {
  const c = b.centroidWorld;
  if (!c) continue;
  const proj = projectWorldToTrack(c.x, c.z);
  if (Math.abs(proj.laneOffsetM) < TRACK_CLEARANCE_M) {
    on += 1;
    offenders.push(
      `${b.name || b.osmId} laneM=${proj.laneOffsetM.toFixed(1)} t=${proj.lapProgress.toFixed(3)}`,
    );
  } else {
    off += 1;
  }
}
for (const line of offenders.slice(0, 40)) console.log(`ON_TRACK  ${line}`);
if (offenders.length > 40) console.log(`... +${offenders.length - 40} more`);
console.log(`OSM on/off ${on}/${off}  campus ON_TRACK ${campusOn}`);
if (campusOn > 0) process.exitCode = 1;
