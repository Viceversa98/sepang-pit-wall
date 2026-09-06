/**
 * Rebuild pit CAD beside the (mirrored) centerline.
 * PIT_SIDE_SIGN: +1 = driver-right, -1 = screen-right when facing T1.
 *
 * Usage: node scripts/regenerate-sepang-pit.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const pts = JSON.parse(
  fs.readFileSync(path.join(root, "public/tracks/sepang-points.json"), "utf8"),
);

const METRES_PER_UNIT = 4;
const TRACK_LENGTH_M = 5543;
const PIT_ENTRY_T = 5501 / TRACK_LENGTH_M;
const PIT_EXIT_T = 370 / TRACK_LENGTH_M;
const PIT_LANE_OFFSET_M = 18;
const ENTRY_END = 0.12;
const GARAGE_END = 0.72;
const STEPS = 96;
// -1 = screen-right when cars face T1 (overview up). Matches "pit on right of track".
const PIT_SIDE_SIGN = -1;

const wrap01 = (t) => ((t % 1) + 1) % 1;
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (k) => k * k * (3 - 2 * k);

const sampleAt = (t) => {
  const n = pts.length;
  const u = wrap01(t) * n;
  const i = Math.floor(u) % n;
  const j = (i + 1) % n;
  const f = u - Math.floor(u);
  const a = pts[i];
  const b = pts[j];
  return {
    x: lerp(a.x, b.x, f),
    y: lerp(a.y, b.y, f),
    z: lerp(a.z, b.z, f),
  };
};

const tangentAt = (t) => {
  const a = sampleAt(t - 0.001);
  const b = sampleAt(t + 0.001);
  let dx = b.x - a.x;
  let dz = b.z - a.z;
  const L = Math.hypot(dx, dz) || 1;
  return { x: dx / L, z: dz / L };
};

/** Right of forward = cross(up, tangent) in Y-up Three.js. */
const rightAt = (t) => {
  const tan = tangentAt(t);
  let sx = tan.z;
  let sz = -tan.x;
  const L = Math.hypot(sx, sz) || 1;
  return { x: sx / L, z: sz / L };
};

const leftAt = (t) => {
  const right = rightAt(t);
  return { x: -right.x, z: -right.z };
};

const flareOffsetM = (u) => {
  if (u <= ENTRY_END) return PIT_LANE_OFFSET_M * smoothstep(u / ENTRY_END);
  if (u >= GARAGE_END) {
    return PIT_LANE_OFFSET_M * (1 - smoothstep((u - GARAGE_END) / (1 - GARAGE_END)));
  }
  return PIT_LANE_OFFSET_M;
};

const span = wrap01(PIT_EXIT_T - PIT_ENTRY_T + 1);
const samples = [];

for (let i = 0; i <= STEPS; i++) {
  const u = i / STEPS;
  const t = wrap01(PIT_ENTRY_T + span * u);
  const p = sampleAt(t);
  const right = rightAt(t);
  const off = (flareOffsetM(u) / METRES_PER_UNIT) * PIT_SIDE_SIGN;
  samples.push({
    x: +(p.x + right.x * off).toFixed(4),
    y: +(p.y + 0.02).toFixed(4),
    z: +(p.z + right.z * off).toFixed(4),
    u: +u.toFixed(4),
    offset_m: +flareOffsetM(u).toFixed(3),
  });
}

// Verify pit offset matches PIT_SIDE_SIGN near SF (~ mid garage).
const mid = samples[Math.floor(samples.length * 0.4)];
const tMid = wrap01(PIT_ENTRY_T + span * mid.u);
const c = sampleAt(tMid);
const r = rightAt(tMid);
const dot = (mid.x - c.x) * r.x + (mid.z - c.z) * r.z;
if (Math.sign(dot) !== Math.sign(PIT_SIDE_SIGN) || Math.abs(dot) < 0.5) {
  console.error(
    `Pit regenerate failed: expected side ${PIT_SIDE_SIGN}. dot=`,
    dot,
  );
  process.exit(1);
}

fs.writeFileSync(
  path.join(root, "public/tracks/sepang-pit-lane.csv"),
  [
    `# x_u,y_u,z_u,pit_u,offset_m  # pit CAD side=${PIT_SIDE_SIGN}`,
    ...samples.map((s) => `${s.x},${s.y},${s.z},${s.u},${s.offset_m}`),
  ].join("\n") + "\n",
);

fs.writeFileSync(
  path.join(root, "public/tracks/sepang-pit-points.json"),
  JSON.stringify(
    samples.map(({ x, y, z }) => ({ x, y, z })),
    null,
    2,
  ) + "\n",
);

const vectorLines = samples
  .map((p) => `  new THREE.Vector3(${p.x}, ${p.y}, ${p.z}),`)
  .join("\n");

const cadTs = `import * as THREE from "three";

/**
 * Dedicated Sepang pit-lane CAD (side=${PIT_SIDE_SIGN} of racing line, world units).
 * Flared entry / garage / exit. Source: /public/tracks/sepang-pit-lane.csv
 * Regenerate: node scripts/regenerate-sepang-pit.mjs
 */
export const PIT_SEG_ENTRY_END = ${ENTRY_END};
export const PIT_SEG_GARAGE_END = ${GARAGE_END};

export const SEPANG_PIT_CONTROL_POINTS: THREE.Vector3[] = [
${vectorLines}
];
`;

fs.writeFileSync(path.join(root, "src/lib/sepangPitCad.ts"), cadTs);
console.log(
  `Wrote ${samples.length} pit points side=${PIT_SIDE_SIGN} @ ${PIT_LANE_OFFSET_M}m (dot=${dot.toFixed(2)})`,
);
