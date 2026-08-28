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

const ringToLocalM = (ring) => {
  const out = [];
  for (const p of ring) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
    out.push(toLocalM(p.lat, p.lon));
  }
  return out;
};

const ringCentroid = (ringLocalM) => {
  if (!ringLocalM.length) return null;
  let x = 0;
  let y = 0;
  for (const p of ringLocalM) {
    x += p.eastM;
    y += p.northM;
  }
  return { eastM: x / ringLocalM.length, northM: y / ringLocalM.length };
};

const polygonAreaM2 = (ringLocalM) => {
  if (ringLocalM.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < ringLocalM.length; i++) {
    const a = ringLocalM[i];
    const b = ringLocalM[(i + 1) % ringLocalM.length];
    area += a.eastM * b.northM - b.eastM * a.northM;
  }
  return Math.abs(area) * 0.5;
};

const orientedBboxM = (ringLocalM) => {
  let minE = Infinity;
  let maxE = -Infinity;
  let minN = Infinity;
  let maxN = -Infinity;
  for (const p of ringLocalM) {
    minE = Math.min(minE, p.eastM);
    maxE = Math.max(maxE, p.eastM);
    minN = Math.min(minN, p.northM);
    maxN = Math.max(maxN, p.northM);
  }
  const widthM = maxE - minE;
  const depthM = maxN - minN;
  return { widthM, depthM, minE, maxE, minN, maxN };
};

const categorizeBuilding = (name, tags) => {
  const n = (name ?? "").toLowerCase();
  if (n === "roof") return "roof_skip";
  if (n.includes("grandstand") || n.includes("hillstand") || tags.building === "grandstand") {
    return "grandstand";
  }
  if (n.includes("pit") || n.includes("paddock") || n.includes("padock")) return "pit";
  if (n.includes("medical")) return "medical";
  if (n.includes("welcome") || n.includes("control")) return "welcome";
  if (n.includes("tower")) return "welcome";
  return "support";
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
      ...existing.osm,
      fetchedAt: existing.osm?.fetchedAt ?? null,
      query: existing.osm?.query ?? "way/relation[building] out geom",
      buildings: existing.osm?.buildings ?? [],
      note: `Overpass unavailable (${lastErr.slice(0, 180)}); kept ${existing.osm?.buildings?.length ?? 0} cached buildings`,
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
    const ringLocalM = ringToLocalM(geom);
    if (ringLocalM.length < 3) continue;
    const centroid = ringCentroid(ringLocalM);
    if (!centroid) continue;
    const tags = el.tags ?? {};
    const name = tags.name ?? tags.building ?? null;
    const bbox = orientedBboxM(ringLocalM);
    const category = categorizeBuilding(name, tags);
    buildings.push({
      osmId: el.id,
      type: el.type,
      name,
      levels: tags["building:levels"] ? Number(tags["building:levels"]) : null,
      heightM: tags.height ? Number.parseFloat(tags.height) : null,
      category,
      areaM2: polygonAreaM2(ringLocalM),
      bboxM: { widthM: bbox.widthM, depthM: bbox.depthM },
      centroid,
      ringLocalM,
      vertexCount: ringLocalM.length,
    });
  }

  existing.origin = ORIGIN;
  existing.bbox = BBOX;
  existing.osm = {
    fetchedAt: new Date().toISOString(),
    query: "way/relation[building] out geom",
    buildings,
  };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(existing, null, 2)}\n`);
  const renderable = buildings.filter((b) => b.category !== "roof_skip").length;
  console.log(
    `Wrote ${buildings.length} OSM buildings (${renderable} renderable) → ${path.relative(root, outPath)}`,
  );
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
