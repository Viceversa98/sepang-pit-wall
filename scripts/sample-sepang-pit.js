/**
 * Build a dedicated Sepang pit-lane CAD on the RIGHT of the racing line
 * (same TUMFTM world frame as sepang-points.json). Entry/garage/exit flares.
 *
 * Usage: node scripts/sample-sepang-pit.js
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const pts = JSON.parse(
  fs.readFileSync(path.join(root, "public", "tracks", "sepang-points.json"), "utf8"),
);

const METRES_PER_UNIT = 4;
const TRACK_LENGTH_M = 5543;
const PIT_ENTRY_T = 5501 / TRACK_LENGTH_M;
const PIT_EXIT_T = 370 / TRACK_LENGTH_M;
/**
 * Lateral offset from racing centerline to pit centerline (metres).
 * Track half-width ~7.5 m + gap + pit half — reads as its own road, not kerb-glued.
 */
const PIT_LANE_OFFSET_M = 18;
const ENTRY_END = 0.12;
const GARAGE_END = 0.72;
const STEPS = 96;
/** +1 = right of forward (driver right). */
const PIT_SIDE_SIGN = 1;

const wrap01 = (t) => ((t % 1) + 1) % 1;
const lerp = (a, b, t) => a + (b - a) * t;

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

/** Left of forward (up × tangent). */
const leftAt = (t) => {
  const tan = tangentAt(t);
  let sx = tan.z;
  let sz = -tan.x;
  const L = Math.hypot(sx, sz) || 1;
  return { x: sx / L, z: sz / L };
};

/** Driver-right unit vector. */
const rightAt = (t) => {
  const left = leftAt(t);
  return { x: -left.x, z: -left.z };
};

const smoothstep = (k) => k * k * (3 - 2 * k);

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
    y: +(p.y - 0.08).toFixed(4),
    z: +(p.z + right.z * off).toFixed(4),
    u: +u.toFixed(4),
    offset_m: +flareOffsetM(u).toFixed(3),
  });
}

const csv = [
  "# x_u,y_u,z_u,pit_u,offset_m  # dedicated RIGHT-side pit CAD; TUMFTM ENU frame",
  ...samples.map((s) => `${s.x},${s.y},${s.z},${s.u},${s.offset_m}`),
].join("\n");

fs.writeFileSync(path.join(root, "public", "tracks", "sepang-pit-lane.csv"), csv);
fs.writeFileSync(
  path.join(root, "public", "tracks", "sepang-pit-points.json"),
  JSON.stringify(
    samples.map(({ x, y, z }) => ({ x, y, z })),
    null,
    2,
  ),
);

const vectorLines = samples
  .map((p) => `  new THREE.Vector3(${p.x}, ${p.y}, ${p.z}),`)
  .join("\n");

const cadTs = `import * as THREE from "three";

/**
 * Dedicated Sepang pit-lane CAD (RIGHT of racing line, world units).
 * Flared entry / garage / exit. Source: /public/tracks/sepang-pit-lane.csv
 * Regenerate: node scripts/sample-sepang-pit.js
 */
export const PIT_SEG_ENTRY_END = ${ENTRY_END};
export const PIT_SEG_GARAGE_END = ${GARAGE_END};

export const SEPANG_PIT_CONTROL_POINTS: THREE.Vector3[] = [
${vectorLines}
];
`;

fs.writeFileSync(path.join(root, "lib", "sepangPitCad.ts"), cadTs);

console.log(
  `Wrote ${samples.length} RIGHT-side pit CAD points @ ${PIT_LANE_OFFSET_M}m offset; regenerated lib/sepangPitCad.ts`,
);
