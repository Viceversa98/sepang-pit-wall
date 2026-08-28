/**
 * Bake Esri World Imagery orthophoto for Sepang circuit bbox.
 * Usage: node scripts/bake-sepang-ortho.mjs
 *
 * Attribution: Esri, Maxar, Earthstar Geographics, and the GIS User Community
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";
import {
  HALF_SPAN_M,
  METRES_PER_UNIT,
  buildCenterlineTransform,
  localMToLatLng,
} from "./sepang-geo.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const csvPath = path.join(root, "public", "tracks", "sepang-centerline.csv");
const heightmapPath = path.join(root, "public", "terrain", "sepang-heightmap.json");
const outDir = path.join(root, "public", "textures");
const outImage = path.join(outDir, "sepang-ortho.webp");
const outMeta = path.join(outDir, "sepang-ortho.meta.json");
const outAttrib = path.join(outDir, "sepang-ortho.attribution.txt");

const OUTPUT_SIZE = 2048;
const ZOOM = 16;
const TILE = 256;
const ESRI =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile";

const lonLatToTile = (lng, lat, z) => {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  );
  return { x, y };
};

const tileToLonLat = (x, y, z) => {
  const n = 2 ** z;
  const lng = (x / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  const lat = (latRad * 180) / Math.PI;
  return { lng, lat };
};

const fetchTile = async (z, x, y) => {
  const url = `${ESRI}/${z}/${y}/${x}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "sepang-pit-wall/0.1" },
  });
  if (!res.ok) throw new Error(`tile ${z}/${y}/${x} ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
};

const readCenterline = () => {
  const raw = [];
  for (const line of fs.readFileSync(csvPath, "utf8").trim().split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const [x, y] = line.split(",").map(Number);
    if (Number.isFinite(x) && Number.isFinite(y)) raw.push({ x, y });
  }
  return raw;
};

const main = async () => {
  let boundsWorld;
  if (fs.existsSync(heightmapPath)) {
    const hm = JSON.parse(fs.readFileSync(heightmapPath, "utf8"));
    boundsWorld = hm.boundsWorld;
  } else {
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
    boundsWorld = {
      minX: minWx - padU,
      maxX: maxWx + padU,
      minZ: minWz - padU,
      maxZ: maxWz + padU,
    };
  }

  const transform = buildCenterlineTransform(readCenterline());
  const corners = [
    { x: boundsWorld.minX, z: boundsWorld.minZ },
    { x: boundsWorld.maxX, z: boundsWorld.minZ },
    { x: boundsWorld.maxX, z: boundsWorld.maxZ },
    { x: boundsWorld.minX, z: boundsWorld.maxZ },
  ];

  const lats = [];
  const lngs = [];
  for (const c of corners) {
    const lx = c.x * METRES_PER_UNIT;
    const lz = c.z * METRES_PER_UNIT;
    const rx = lx * transform.cos + lz * transform.sin;
    const rz = -lx * transform.sin + lz * transform.cos;
    const { lat, lng } = localMToLatLng(rx + transform.cx, rz + transform.cy);
    lats.push(lat);
    lngs.push(lng);
  }

  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const tMin = lonLatToTile(minLng, maxLat, ZOOM);
  const tMax = lonLatToTile(maxLng, minLat, ZOOM);
  const x0 = tMin.x;
  const y0 = tMin.y;
  const x1 = tMax.x;
  const y1 = tMax.y;
  const tilesW = x1 - x0 + 1;
  const tilesH = y1 - y0 + 1;

  console.log(`Fetching ${tilesW}×${tilesH} tiles at z${ZOOM}…`);

  const mosaicW = tilesW * TILE;
  const mosaicH = tilesH * TILE;
  const composites = [];

  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      try {
        const buf = await fetchTile(ZOOM, tx, ty);
        composites.push({
          input: buf,
          left: (tx - x0) * TILE,
          top: (ty - y0) * TILE,
        });
      } catch (err) {
        console.warn(`Missing tile ${tx},${ty}:`, err.message);
      }
    }
  }

  if (composites.length === 0) {
    console.error("No tiles fetched — check network");
    process.exit(1);
  }

  const mosaic = sharp({
    create: {
      width: mosaicW,
      height: mosaicH,
      channels: 3,
      background: { r: 30, g: 50, b: 30 },
    },
  })
    .composite(composites)
    .resize(OUTPUT_SIZE, OUTPUT_SIZE, { fit: "cover" })
    .webp({ quality: 82 });

  fs.mkdirSync(outDir, { recursive: true });
  await mosaic.toFile(outImage);

  const meta = {
    source: "Esri World Imagery",
    attribution:
      "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
    zoom: ZOOM,
    boundsWorld,
    boundsLatLng: { minLat, maxLat, minLng, maxLng },
    tileRange: { x0, y0, x1, y1 },
    imageSize: OUTPUT_SIZE,
    bakedAt: new Date().toISOString(),
  };

  fs.writeFileSync(outMeta, JSON.stringify(meta, null, 2));
  fs.writeFileSync(
    outAttrib,
    "Satellite imagery: Esri, Maxar, Earthstar Geographics, and the GIS User Community\n",
  );

  console.log(`Wrote ${outImage} (${OUTPUT_SIZE}px) + meta`);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
