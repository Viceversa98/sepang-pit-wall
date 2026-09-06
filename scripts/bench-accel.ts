/** Simulate longitudinalAccelMps2 0→100/200/300. Run: nub x tsx --tsconfig tsconfig.json scripts/bench-accel.ts */
import { longitudinalAccelMps2 } from "../src/lib/racePhysics.ts";

const dt = 1 / 60;
const ceil = 372 / 3.6;
const marks = [
  { label: "0-100", v: 100 / 3.6 },
  { label: "0-200", v: 200 / 3.6 },
  { label: "0-300", v: 300 / 3.6 },
];

const sim = (label: string, step: (v: number) => number) => {
  let v = 0;
  let t = 0;
  const hit: Record<string, number> = {};
  while (t < 25) {
    v = Math.min(ceil, step(v));
    t += dt;
    for (const m of marks) {
      if (hit[m.label] === undefined && v >= m.v) hit[m.label] = t;
    }
    if (Object.keys(hit).length === marks.length) break;
  }
  console.log(
    label,
    marks.map((m) => `${m.label}=${hit[m.label]?.toFixed(2) ?? "na"}s`).join("  "),
  );
};

sim("racePhysics (real F1 model)", (v) => v + longitudinalAccelMps2(v, 1) * dt);

sim("old arcade (~40mps2 + 5% lerp to 360)", (v) => {
  const tw = 100 / 4;
  let sw = v / 4;
  sw = Math.min(tw + 0.35, sw + 10 * dt);
  sw += (tw - sw) * 0.05;
  return sw * 4;
});

console.log("Real F1 refs: 0-100~2.6s  0-200~4.9s  0-300~8.5s");
