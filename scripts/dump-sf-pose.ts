import { getTrackCurve } from "../src/lib/trackCurve.ts";

const c = getTrackCurve();
for (const t of [0, 0.05, 0.1, 0.55, 0.85, 0.91]) {
  const p = c.getPointAt(t);
  console.log(`t=${t} x=${p.x.toFixed(1)} z=${p.z.toFixed(1)}`);
}
const sf = c.getPointAt(0);
const ahead = c.getPointAt(0.02);
console.log("SF heading xz", {
  dx: +(ahead.x - sf.x).toFixed(2),
  dz: +(ahead.z - sf.z).toFixed(2),
});
