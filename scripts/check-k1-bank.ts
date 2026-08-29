import { getPoseAt, metresToUnits, FIA, TRACK_LENGTH_M } from "../src/lib/trackCurve";
import { offsetBesideTrack, wrap01, yawFromTangent, cornerWorld } from "../src/lib/sepangCampusLayout";
import { projectWorldToTrack } from "../src/lib/trackProjection";
import { turnSignAt } from "../src/lib/racePhysics";

const half = FIA.trackWidthStartM / 2;
const runoffOuter = half + 0.55 + 4.5; // asphalt + curb + runoff

const sampleK1 = (bank: 1 | -1, clearanceM: number): void => {
  let worst = Infinity;
  let worstPt = { x: 0, z: 0, t: 0 };
  for (const seg of [0, 1]) {
    const spanT = 55 / TRACK_LENGTH_M;
    const u = seg === 0 ? -0.25 : 0.25;
    const t = wrap01(0.107 + u * spanT);
    const pose = getPoseAt(t);
    const sizeX = metresToUnits(14);
    const sizeZ = metresToUnits(27.5);
    const pos = offsetBesideTrack(pose, {
      bank,
      halfWidth: sizeX / 2,
      lift: 0,
      runoffM: clearanceM,
    });
    const yaw = yawFromTangent(pose.tangent);
    const hx = sizeX / 2;
    const hz = sizeZ / 2;
    for (let edge = 0; edge < 4; edge += 1) {
      for (let s = 0; s <= 16; s += 1) {
        const f = (s / 16) * 2 - 1;
        const [lx, lz] =
          edge === 0
            ? [hx, f * hz]
            : edge === 1
              ? [-hx, f * hz]
              : edge === 2
                ? [f * hx, hz]
                : [f * hx, -hz];
        const c = cornerWorld(pos, yaw, lx, lz);
        const pr = projectWorldToTrack(c.x, c.z);
        if (pr.lapProgress < 0.07 || pr.lapProgress > 0.13) continue;
        const abs = Math.abs(pr.laneOffsetM);
        if (abs < worst) {
          worst = abs;
          worstPt = { x: c.x, z: c.z, t: pr.lapProgress };
        }
      }
    }
  }
  console.log(
    JSON.stringify({
      bank,
      clearanceM,
      worstLaneM: +worst.toFixed(2),
      onAsphalt: worst <= half,
      onRunoff: worst <= runoffOuter,
      clearsRunoff: worst > runoffOuter + 1,
      atT: +worstPt.t.toFixed(3),
    }),
  );
};

console.log("turnSign at 0.107:", turnSignAt(0.107));
console.log("runoff outer lane m:", runoffOuter);
for (const bank of [-1] as const) {
  for (const clearanceM of [18, 20, 22, 24, 26, 28]) {
    sampleK1(bank, clearanceM);
  }
}
