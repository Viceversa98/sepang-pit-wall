/** Flag OSM backdrop footprints that intrude on the track or pit lane. */
import osmBuildingsJson from "../src/data/sepang-osm-buildings.json";
import { footprintMinTrackDistanceM, TRACK_CLEARANCE_M } from "../src/lib/trackClearance";

const bad: Array<Record<string, unknown>> = [];

for (const b of osmBuildingsJson.buildings) {
  const minM = footprintMinTrackDistanceM(b.ringWorld);
  if (minM < TRACK_CLEARANCE_M) {
    bad.push({
      osmId: b.osmId,
      name: b.name,
      heroId: b.heroId,
      minDistanceM: +minM.toFixed(1),
      heightM: b.heightM,
    });
  }
}

bad.sort((a, b) => (a.minDistanceM as number) - (b.minDistanceM as number));
console.log(JSON.stringify({ offenders: bad, total: bad.length }, null, 2));
