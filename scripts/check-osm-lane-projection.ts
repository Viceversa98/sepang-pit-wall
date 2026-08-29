import osmBuildingsJson from "../src/data/sepang-osm-buildings.json";
import { CAMPUS_BUILDINGS } from "../src/lib/sepangCampusLayout";
import { projectWorldToTrack } from "../src/lib/trackProjection";
import { FIA } from "../src/lib/trackCurve";
import { footprintClearsTrack } from "../src/lib/trackClearance";

const half = FIA.trackWidthStartM / 2;
const heroIds = new Set(CAMPUS_BUILDINGS.map((d) => d.id));

const bad: Array<Record<string, unknown>> = [];

for (const b of osmBuildingsJson.buildings) {
  if (b.heroId && heroIds.has(b.heroId as (typeof CAMPUS_BUILDINGS)[number]["id"])) {
    continue;
  }
  if ((b.name ?? "").toLowerCase() === "roof") continue;

  let worstLane = Infinity;
  let worstT = 0;
  for (const p of b.ringWorld) {
    const pr = projectWorldToTrack(p.x, p.z);
    const abs = Math.abs(pr.laneOffsetM);
    if (abs < worstLane) {
      worstLane = abs;
      worstT = pr.lapProgress;
    }
  }

  const passesOld = footprintClearsTrack(b.ringWorld);
  const onTrack = worstLane <= half + 0.5;
  const nearTurn1 = worstT > 0.06 && worstT < 0.14;

  if (onTrack || (nearTurn1 && worstLane < half + 3)) {
    bad.push({
      osmId: b.osmId,
      name: b.name,
      heroId: b.heroId,
      worstLaneM: +worstLane.toFixed(2),
      atT: +worstT.toFixed(3),
      passesOldFilter: passesOld,
      wouldRender: passesOld,
    });
  }
}

bad.sort((a, b) => (a.worstLaneM as number) - (b.worstLaneM as number));
console.log(JSON.stringify(bad, null, 2));
