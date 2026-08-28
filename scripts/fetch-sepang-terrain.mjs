/**
 * Fetch Sepang DEM grid via Open-Meteo Elevation API.
 * Usage: node scripts/fetch-sepang-terrain.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  HALF_SPAN_M,
  METRES_PER_UNIT,
  ORIGIN,
  bilinearSample,
  buildCenterlineTransform,
  latLngToLocalM,
  localMToLatLng,
  worldToLocalM,
} from "./sepang-geo.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const csvPath = path.join(root, "public", "tracks", "sepang-centerline.csv");
const outPath = path.join(root, "src", "data", "sepang-heightmap.json");
const publicCopyPath = path.join(root, "public", "terrain", "sepang-heightmap.json");

const GRID = 121;
const BATCH = 80;

const readCenterline = () => {
  const raw = [];
  for (const line of fs.readFileSync(csvPath, "utf8").trim().split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const [x, y] = line.split(",").map(Number);
    if (Number.isFinite(x) && Number.isFinite(y)) raw.push({ x, y });
  }
  if (raw.length < 50) throw new Error("too few centerline points");
  return raw;
};

const fetchElevations = async (lats, lngs) => {
  const elevations = [];
  for (let i = 0; i < lats.length; i += BATCH) {
    const latBatch = lats.slice(i, i + BATCH);
    const lngBatch = lngs.slice(i, i + BATCH);
    const params = new URLSearchParams({
      latitude: latBatch.join(","),
      longitude: lngBatch.join(","),
    });
    const res = await fetch(`https://api.open-meteo.com/v1/elevation?${params}`, {
      headers: { "User-Agent": "sepang-pit-wall/0.1" },
    });
    if (!res.ok) throw new Error(`Open-Meteo elevation ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data.elevation)) throw new Error("invalid elevation response");
    elevations.push(...data.elevation);
  }
  return elevations;
};

const main = async () => {
  const raw = readCenterline();
  const transform = buildCenterlineTransform(raw);

  let minWx = Infinity;
  let maxWx = -Infinity;
  let minWz = Infinity;
  let maxWz = -Infinity;
  for (const p of transform.pts) {
    minWx = Math.min(minWx, p.x);
    maxWx = Math.max(maxWx, p.x);
    minWz = Math.min(minWz, p.z);
    maxWz = Math.max(maxWz, p.z);
  }

  const padU = HALF_SPAN_M / METRES_PER_UNIT;
  minWx -= padU;
  maxWx += padU;
  minWz -= padU;
  maxWz += padU;

  const cellSizeU = (maxWx - minWx) / (GRID - 1);
  const cellSizeM = cellSizeU * METRES_PER_UNIT;

  const lats = [];
  const lngs = [];
  const worldSamples = [];

  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const wx = minWx + i * cellSizeU;
      const wz = minWz + j * cellSizeU;
      worldSamples.push({ wx, wz });
      const local = worldToLocalM(wx, wz, transform);
      const { lat, lng } = localMToLatLng(local.eastM, local.northM);
      lats.push(lat);
      lngs.push(lng);
    }
  }

  console.log(`Fetching ${lats.length} elevation samples…`);
  let elevations;
  try {
    elevations = await fetchElevations(lats, lngs);
  } catch (err) {
    console.warn("Elevation fetch failed, using flat fallback:", err.message);
    elevations = lats.map(() => 45);
  }

  const minElev = Math.min(...elevations);
  const maxElev = Math.max(...elevations);

  const payload = {
    source: "open-meteo",
    attribution: "Open-Meteo (CC BY 4.0) — https://open-meteo.com",
    origin: ORIGIN,
    metresPerUnit: METRES_PER_UNIT,
    width: GRID,
    height: GRID,
    boundsWorld: { minX: minWx, maxX: maxWx, minZ: minWz, maxZ: maxWz },
    cellSizeU,
    cellSizeM,
    minElevationM: minElev,
    maxElevationM: maxElev,
    trackYOffsetM: 1.5,
    transform: {
      cx: transform.cx,
      cy: transform.cy,
      cos: transform.cos,
      sin: transform.sin,
      flipX: transform.flipX,
    },
    elevations: elevations.map((e) => +e.toFixed(2)),
    fetchedAt: new Date().toISOString(),
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  fs.mkdirSync(path.dirname(publicCopyPath), { recursive: true });
  fs.writeFileSync(publicCopyPath, JSON.stringify(payload, null, 2));
  console.log(
    `Wrote ${outPath} (+ public copy) — elev ${minElev.toFixed(1)}–${maxElev.toFixed(1)} m, grid ${GRID}², span ${((maxWx - minWx) * METRES_PER_UNIT).toFixed(0)} m`,
  );

  // Sanity: sample at first track point
  const p0 = transform.pts[0];
  const u = (p0.x - minWx) / (maxWx - minWx);
  const v = (p0.z - minWz) / (maxWz - minWz);
  const e0 = bilinearSample(payload.elevations, GRID, GRID, u, v);
  console.log(`Track point 0 elev ≈ ${e0.toFixed(2)} m ASL`);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
