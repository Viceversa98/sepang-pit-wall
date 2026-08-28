/**
 * Project OSM building footprints to world coords + nearest track t/bank.
 * Writes src/data/sepang-osm-buildings.json and data/sepang-building-inventory.json
 * Usage: node scripts/align-sepang-osm.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  METRES_PER_UNIT,
  bilinearSample,
  buildCenterlineTransform,
  localMToWorld,
} from "./sepang-geo.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const footprintsPath = path.join(root, "data", "sepang-campus-footprints.json");
const csvPath = path.join(root, "public", "tracks", "sepang-centerline.csv");
const heightmapPath = path.join(root, "src", "data", "sepang-heightmap.json");
const osmOutPath = path.join(root, "src", "data", "sepang-osm-buildings.json");
const inventoryPath = path.join(root, "data", "sepang-building-inventory.json");

const TRACK_LENGTH_M = 5543;
const LEVEL_HEIGHT_M = 3.2;
const DEFAULT_HEIGHT_M = 6;

/** OSM name patterns → hero campus ID */
const HERO_NAME_MAP = [
  { match: /paddock\/pit|pit building/i, heroId: "pit" },
  { match: /^main grandstand$/i, heroId: "mainGrandstandNorth" },
  { match: /^k1 grandstand$/i, heroId: "k1" },
  { match: /^f grandstand$/i, heroId: "grandstandF" },
  { match: /^welcome center$/i, heroId: "welcome" },
  { match: /control post welcome/i, heroId: "controlPostWelcome" },
  { match: /^medical center$/i, heroId: "medicalCenter" },
  { match: /south pad/i, heroId: "southPaddock" },
];

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

const loadHeightmap = () => {
  if (!fs.existsSync(heightmapPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(heightmapPath, "utf8"));
};

const sampleTerrainY = (wx, wz, hm) => {
  if (!hm) return 0;
  const { boundsWorld, width, height, elevations, minElevationM, trackYOffsetM } = hm;
  const { minX, maxX, minZ, maxZ } = boundsWorld;
  const u = (wx - minX) / (maxX - minX);
  const v = (wz - minZ) / (maxZ - minZ);
  const elevM = bilinearSample(elevations, width, height, u, v);
  const relM = elevM - minElevationM + trackYOffsetM;
  return relM / METRES_PER_UNIT;
};

const nearestTrack = (wx, wz, trackPts) => {
  let bestI = 0;
  let bestD = Infinity;
  for (let i = 0; i < trackPts.length; i++) {
    const p = trackPts[i];
    const d = Math.hypot(p.x - wx, p.z - wz);
    if (d < bestD) {
      bestD = d;
      bestI = i;
    }
  }
  const p0 = trackPts[bestI];
  const p1 = trackPts[(bestI + 1) % trackPts.length];
  const tx = p1.x - p0.x;
  const tz = p1.z - p0.z;
  const len = Math.hypot(tx, tz) || 1;
  const tangentX = tx / len;
  const tangentZ = tz / len;
  const sideX = -tangentZ;
  const sideZ = tangentX;
  const dx = wx - p0.x;
  const dz = wz - p0.z;
  const bank = dx * sideX + dz * sideZ >= 0 ? 1 : -1;
  const t = bestI / trackPts.length;
  return { t, bank, distM: bestD * METRES_PER_UNIT };
};

const matchHeroId = (name) => {
  if (!name) return null;
  for (const { match, heroId } of HERO_NAME_MAP) {
    if (match.test(name)) return heroId;
  }
  return null;
};

const inferKit = (category, name, bboxM, heroId) => {
  if (heroId === "pit") return "pit";
  if (heroId === "k1" || heroId === "grandstandF") return "covered";
  if (heroId === "welcome" || heroId === "controlPostWelcome") return "welcome";
  if (heroId === "medicalCenter") return "medical";
  if (heroId === "southPaddock") return "southPaddock";
  if (heroId === "hillstandC2") return "hillCanopy";
  if (category === "grandstand") return "covered";
  if (category === "pit") return "workshops";
  if (category === "medical") return "medical";
  if (category === "welcome") return "controlPost";
  const span = Math.max(bboxM.widthM, bboxM.depthM);
  if (span > 80) return "workshops";
  if (span > 35) return "covered";
  return "support";
};

const categorizeBuilding = (name, tags = {}) => {
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

const synthesizeRingFromCentroid = (centroid, bboxM) => {
  const hw = (bboxM?.widthM ?? 14) / 2;
  const hd = (bboxM?.depthM ?? 14) / 2;
  const { eastM, northM } = centroid;
  return [
    { eastM: eastM - hw, northM: northM - hd },
    { eastM: eastM + hw, northM: northM - hd },
    { eastM: eastM + hw, northM: northM + hd },
    { eastM: eastM - hw, northM: northM + hd },
  ];
};

const defaultBboxForBuilding = (b) => {
  if (b.bboxM) return b.bboxM;
  const category = b.category ?? categorizeBuilding(b.name, {});
  if (category === "grandstand") return { widthM: 40, depthM: 80 };
  if (category === "pit") return { widthM: 30, depthM: 60 };
  if (category === "welcome") return { widthM: 24, depthM: 18 };
  if (category === "medical") return { widthM: 18, depthM: 14 };
  return { widthM: 12, depthM: 12 };
};

const main = () => {
  if (!fs.existsSync(footprintsPath)) {
    throw new Error(`Missing ${footprintsPath} — run campus:fetch first`);
  }
  const footprints = JSON.parse(fs.readFileSync(footprintsPath, "utf8"));
  const transform = buildCenterlineTransform(readCenterline());
  const trackPts = transform.pts;
  const hm = loadHeightmap();

  const osmBuildings = [];
  const inventory = {
    generatedAt: new Date().toISOString(),
    source: "align-sepang-osm.mjs",
    heroes: {},
    entries: [],
  };

  for (const b of footprints.osm?.buildings ?? []) {
    const category = b.category ?? categorizeBuilding(b.name, {});
    if (category === "roof_skip" || (b.name ?? "").toLowerCase() === "roof") continue;

    let ringLocalM = b.ringLocalM ?? [];
    const bboxM = defaultBboxForBuilding({ ...b, category });
    if (ringLocalM.length < 3) {
      if (!b.centroid) continue;
      ringLocalM = synthesizeRingFromCentroid(b.centroid, bboxM);
    }

    const ringWorld = ringLocalM.map((p) => {
      const w = localMToWorld(p.eastM, p.northM, transform);
      return { x: w.x, z: w.z };
    });

    let cx = 0;
    let cz = 0;
    for (const p of ringWorld) {
      cx += p.x;
      cz += p.z;
    }
    cx /= ringWorld.length;
    cz /= ringWorld.length;

    const { t, bank, distM } = nearestTrack(cx, cz, trackPts);
    const baseY = sampleTerrainY(cx, cz, hm);
    const heightM = b.heightM ?? (b.levels ? b.levels * LEVEL_HEIGHT_M : DEFAULT_HEIGHT_M);
    const heroId = matchHeroId(b.name);
    const kit = inferKit(category, b.name, bboxM, heroId);

    const entry = {
      osmId: b.osmId,
      name: b.name,
      category,
      heroId,
      kit,
      heightM,
      areaM2: b.areaM2 ?? bboxM.widthM * bboxM.depthM,
      bboxM,
      centroidWorld: { x: cx, z: cz },
      baseY,
      track: { t, bank, distM },
      ringWorld,
    };

    osmBuildings.push(entry);
    inventory.entries.push({
      osmId: b.osmId,
      name: b.name,
      heroId: heroId ?? `osm:${b.osmId}`,
      kit,
      trackT: t,
      bank,
      sizeM: {
        x: b.bboxM?.widthM ?? 12,
        y: heightM,
        z: b.bboxM?.depthM ?? 12,
      },
    });

    if (heroId) {
      const prev = inventory.heroes[heroId];
      if (!prev || (b.areaM2 ?? 0) > (prev.areaM2 ?? 0)) {
        inventory.heroes[heroId] = {
          osmId: b.osmId,
          name: b.name,
          t,
          bank,
          areaM2: b.areaM2,
          bboxM: b.bboxM,
          distM,
        };
      }
    }
  }

  // C2 hillstand has no OSM name — anchor near mid-lap outside T9–11 cluster
  const c2Cluster = osmBuildings
    .filter((b) => b.category === "support" && b.track.t > 0.48 && b.track.t < 0.62)
    .sort((a, b) => b.areaM2 - a.areaM2);
  if (c2Cluster.length > 0) {
    const anchor = c2Cluster[0];
    inventory.heroes.hillstandC2 = {
      osmId: null,
      name: "Hillstand C2 (inferred)",
      t: anchor.track.t,
      bank: anchor.track.bank,
      areaM2: anchor.areaM2,
      bboxM: { widthM: 55, depthM: 120 },
      distM: anchor.track.distM,
    };
  } else {
    inventory.heroes.hillstandC2 = {
      osmId: null,
      name: "Hillstand C2 (inferred)",
      t: 0.54,
      bank: 1,
      areaM2: 0,
      bboxM: { widthM: 55, depthM: 120 },
      distM: null,
    };
  }

  fs.mkdirSync(path.dirname(osmOutPath), { recursive: true });
  fs.writeFileSync(
    osmOutPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        metresPerUnit: METRES_PER_UNIT,
        trackLengthM: TRACK_LENGTH_M,
        buildings: osmBuildings,
      },
      null,
      2,
    )}\n`,
  );
  fs.writeFileSync(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`);

  console.log(`Aligned ${osmBuildings.length} buildings → ${path.relative(root, osmOutPath)}`);
  console.log(`Hero hints → ${path.relative(root, inventoryPath)}`);
  console.log("Hero t/bank:", JSON.stringify(inventory.heroes, null, 2));
};

main();
