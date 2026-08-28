/** One-shot slim Overpass fetch (centers only). */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outPath = path.join(root, "data", "sepang-campus-footprints.json");
const ORIGIN = { lat: 2.76056, lng: 101.7375 };
const BBOX = [2.755, 101.73, 2.765, 101.745];
const query = `[out:json][timeout:25];way["building"](${BBOX.join(",")});out center 80;`;
const endpoints = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];

const main = async () => {
  const existing = JSON.parse(fs.readFileSync(outPath, "utf8"));
  const mPerDegLat = 110540;
  const mPerDegLng = 111320 * Math.cos((ORIGIN.lat * Math.PI) / 180);
  let data = null;
  for (const endpoint of endpoints) {
    try {
      const res = await fetch(`${endpoint}?data=${encodeURIComponent(query)}`, {
        headers: { "User-Agent": "sepang-pit-wall/0.1" },
      });
      console.log(endpoint, res.status);
      if (!res.ok) continue;
      data = await res.json();
      break;
    } catch (err) {
      console.error(endpoint, err);
    }
  }
  if (!data) {
    existing.osm = {
      fetchedAt: null,
      query: "way[building] out center 80",
      buildings: [],
      note: "Overpass unavailable; layout footprints remain authoritative",
    };
    fs.writeFileSync(outPath, `${JSON.stringify(existing, null, 2)}\n`);
    console.log("Overpass unavailable — footprints JSON kept layout-only");
    return;
  }
  const buildings = [];
  for (const el of data.elements ?? []) {
    const c = el.center ?? el;
    if (!Number.isFinite(c.lat) || !Number.isFinite(c.lon)) continue;
    buildings.push({
      osmId: el.id,
      type: el.type,
      name: el.tags?.name ?? el.tags?.building ?? null,
      levels: el.tags?.["building:levels"] ? Number(el.tags["building:levels"]) : null,
      heightM: el.tags?.height ? Number.parseFloat(el.tags.height) : null,
      centroid: {
        eastM: (c.lon - ORIGIN.lng) * mPerDegLng,
        northM: (c.lat - ORIGIN.lat) * mPerDegLat,
      },
      vertexCount: 1,
    });
  }
  existing.osm = {
    fetchedAt: new Date().toISOString(),
    query: "way[building] out center 80",
    buildings,
  };
  fs.writeFileSync(outPath, `${JSON.stringify(existing, null, 2)}\n`);
  console.log(`Wrote ${buildings.length} OSM buildings`);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
