/**
 * Fetch Sepang OSM building footprints (Overpass) and merge into
 * data/sepang-campus-footprints.json.
 * Usage: node scripts/fetch-sepang-osm.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outPath = path.join(root, "data", "sepang-campus-footprints.json");
const ORIGIN = { lat: 2.76056, lng: 101.7375 };
const BBOX = [2.745, 101.72, 2.775, 101.755];

const query = `[out:json][timeout:60];
(
  way["building"](${BBOX.join(",")});
  relation["building"](${BBOX.join(",")});
);
out geom;`;

const toLocalM = (lat, lng) => {
  const mPerDegLat = 110540;
  const mPerDegLng = 111320 * Math.cos((ORIGIN.lat * Math.PI) / 180);
  return {
    eastM: (lng - ORIGIN.lng) * mPerDegLng,
    northM: (lat - ORIGIN.lat) * mPerDegLat,
  };
};

const ringCentroid = (ring) => {
  let x = 0;
  let y = 0;
  let n = 0;
  for (const p of ring) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
    const loc = toLocalM(p.lat, p.lon);
    x += loc.eastM;
    y += loc.northM;
    n += 1;
  }
  if (n === 0) return null;
  return { eastM: x / n, northM: y / n };
};

const loadExisting = () => {
  if (!fs.existsSync(outPath)) {
    return {
      source: "sepangCampusLayout + OSM Overpass",
      origin: ORIGIN,
      bbox: BBOX,
      layout: [],
      osm: { fetchedAt: null, buildings: [] },
    };
  }
  return JSON.parse(fs.readFileSync(outPath, "utf8"));
};

const main = async () => {
  const existing = loadExisting();
  const endpoints = [
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter",
  ];
  let data = null;
  let lastErr = "";
  for (const endpoint of endpoints) {
    const url = `${endpoint}?data=${encodeURIComponent(query)}`;
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "sepang-pit-wall/0.1" },
      });
      if (!res.ok) {
        lastErr = `${endpoint} ${res.status} ${await res.text()}`;
        continue;
      }
      data = await res.json();
      break;
    } catch (err) {
      lastErr = `${endpoint} ${err}`;
    }
  }
  if (!data) {
    existing.osm = {
      fetchedAt: null,
      query: "way/relation[building] bbox",
      buildings: [],
      note: `Overpass unavailable (${lastErr.slice(0, 180)}); layout footprints remain authoritative`,
    };
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `${JSON.stringify(existing, null, 2)}\n`);
    console.warn("Overpass unavailable — footprints JSON kept layout-only");
    return;
  }
  const buildings = [];
  for (const el of data.elements ?? []) {
    const geom = el.geometry ?? el.members?.flatMap((m) => m.geometry ?? []) ?? [];
    if (!geom.length) continue;
    const centroid = ringCentroid(geom);
    if (!centroid) continue;
    const tags = el.tags ?? {};
    buildings.push({
      osmId: el.id,
      type: el.type,
      name: tags.name ?? tags.building ?? null,
      levels: tags["building:levels"] ? Number(tags["building:levels"]) : null,
      heightM: tags.height ? Number.parseFloat(tags.height) : null,
      centroid,
      vertexCount: geom.length,
    });
  }
  existing.origin = ORIGIN;
  existing.bbox = BBOX;
  existing.osm = {
    fetchedAt: new Date().toISOString(),
    query: "way/relation[building] bbox",
    buildings,
  };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(existing, null, 2)}\n`);
  console.log(`Wrote ${buildings.length} OSM buildings → ${path.relative(root, outPath)}`);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
