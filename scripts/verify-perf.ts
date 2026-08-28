/**
 * F1 longitudinal benchmark check against public telemetry:
 *   0–100 km/h ≈ 2.6 s · 0–200 ≈ 5.2 s · 0–300 ≈ 8.5 s
 *   300→0 km/h ≈ <4 s over ~100 m (peak ~5–6 G, mechanical ~2 G at low speed)
 *
 * Run: npx tsx --tsconfig tsconfig.json scripts/verify-perf.ts
 */
import { longitudinalAccelMps2, longitudinalBrakeMps2 } from "../src/lib/racePhysics";

const DT = 0.001;
const GRIP = 1;

const kmh = (mps: number): number => mps * 3.6;

// Acceleration: 0 → 320 km/h at full throttle.
let v = 0;
let t = 0;
const marks: Record<number, number> = {};
while (kmh(v) < 320 && t < 30) {
  v += longitudinalAccelMps2(v, GRIP) * DT;
  t += DT;
  for (const m of [100, 200, 250, 300]) {
    if (marks[m] === undefined && kmh(v) >= m) marks[m] = t;
  }
}

// Braking: 300 km/h → 0.
let bv = 300 / 3.6;
let bt = 0;
let bd = 0;
let peakG = 0;
let lowSpeedG = 0;
while (bv > 0.2 && bt < 15) {
  const a = longitudinalBrakeMps2(bv, GRIP);
  peakG = Math.max(peakG, a / 9.81);
  if (kmh(bv) < 60) lowSpeedG = Math.max(lowSpeedG, a / 9.81);
  bd += bv * DT;
  bv = Math.max(0, bv - a * DT);
  bt += DT;
}

console.log(
  JSON.stringify(
    {
      accel: {
        t100: +(marks[100] ?? -1).toFixed(2),
        t200: +(marks[200] ?? -1).toFixed(2),
        t250: +(marks[250] ?? -1).toFixed(2),
        t300: +(marks[300] ?? -1).toFixed(2),
      },
      brake300to0: {
        timeS: +bt.toFixed(2),
        distanceM: +bd.toFixed(0),
        peakG: +peakG.toFixed(2),
        lowSpeedG: +lowSpeedG.toFixed(2),
      },
    },
    null,
    2,
  ),
);
