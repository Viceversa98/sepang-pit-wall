/**
 * Bake hero campus building GLBs for SepangCampus runtime swap.
 * Run: node scripts/build-campus-glbs.mjs
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

if (typeof globalThis.FileReader === "undefined") {
  globalThis.FileReader = class FileReader {
    result = null;
    onload = null;
    onloadend = null;
    onerror = null;
    readAsArrayBuffer(blob) {
      Promise.resolve(blob.arrayBuffer())
        .then((buf) => {
          this.result = buf;
          this.onload?.({ target: this });
          this.onloadend?.({ target: this });
        })
        .catch((err) => this.onerror?.(err));
    }
  };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "../public/models/sepang");
const METRES_PER_UNIT = 4;
const u = (m) => m / METRES_PER_UNIT;

const CAMPUS_COLOR = {
  concrete: "#9ca3af",
  concreteDark: "#6b7280",
  concreteWarm: "#a8a29e",
  grass: "#1a4d2e",
  canopy: "#dc2626",
};

const concrete = (color = CAMPUS_COLOR.concrete) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0.06 });
const roof = () => new THREE.MeshStandardMaterial({ color: "#374151", roughness: 0.68, metalness: 0.18 });
const glass = () =>
  new THREE.MeshStandardMaterial({
    color: "#60a5fa",
    roughness: 0.08,
    metalness: 0.42,
    transparent: true,
    opacity: 0.52,
  });

/** id → { sx,sy,sz metres, kit } */
const BUILDINGS = [
  { id: "pit", sx: 20, sy: 14, sz: 80, kit: "pit" },
  { id: "mainGrandstandNorth", sx: 22, sy: 16, sz: 120, kit: "mainStand" },
  { id: "mainGrandstandSouth", sx: 20, sy: 16, sz: 90, kit: "mainStand" },
  { id: "tower", sx: 36, sy: 28, sz: 42, kit: "tower" },
  { id: "twinTowers", sx: 18, sy: 36, sz: 30, kit: "twin" },
  { id: "k1", sx: 14, sy: 12, sz: 55, kit: "covered" },
  { id: "grandstandF", sx: 18, sy: 12, sz: 60, kit: "covered" },
  { id: "welcome", sx: 24, sy: 12, sz: 18, kit: "welcome" },
  { id: "medicalCenter", sx: 18, sy: 8, sz: 14, kit: "medical" },
  { id: "controlPostWelcome", sx: 12, sy: 6, sz: 10, kit: "controlPost" },
  { id: "paddockChalets", sx: 18, sy: 8, sz: 44, kit: "chalets" },
  { id: "southPaddock", sx: 28, sy: 10, sz: 48, kit: "southPaddock" },
  { id: "hillstandK2", sx: 40, sy: 8, sz: 60, kit: "openHill" },
  { id: "hillstandC2", sx: 55, sy: 8, sz: 60, kit: "hillCanopy" },
  { id: "motorsportPark", sx: 80, sy: 8, sz: 90, kit: "workshops" },
];

const buildKit = ({ sx, sy, sz, kit }) => {
  const group = new THREE.Group();
  const wx = u(sx);
  const wy = u(sy);
  const wz = u(sz);

  if (kit === "pit") {
    group.add(new THREE.Mesh(new THREE.BoxGeometry(wx, wy, wz), concrete()));
    for (let i = 0; i < 4; i++) {
      const z = -wz / 2 + ((i + 0.5) / 4) * wz;
      const bay = new THREE.Mesh(new THREE.BoxGeometry(wx * 0.92, wy * 0.55, wz / 4 * 0.75), concrete(CAMPUS_COLOR.concreteDark));
      bay.position.set(0, -wy * 0.12, z);
      group.add(bay);
    }
  } else if (kit === "mainStand") {
    for (let i = 0; i < 5; i++) {
      const t = i / 5;
      const h = wy * (0.35 + t * 0.65);
      const w = wx * (0.7 + t * 0.3);
      const tier = new THREE.Mesh(new THREE.BoxGeometry(w, h / 5, wz * 0.92), concrete());
      tier.position.y = -wy / 2 + (i + 0.5) * (wy / 5);
      group.add(tier);
    }
  } else if (kit === "tower") {
    const spireOffset = wx * 0.18;
    for (const sign of [-1, 1]) {
      group.add(
        new THREE.Mesh(
          new THREE.CylinderGeometry(wx * 0.07, wx * 0.11, wy * 0.92, 10),
          concrete(CAMPUS_COLOR.concreteDark),
        ).translateX(sign * spireOffset).translateY(wy * 0.02),
      );
    }
    group.add(
      new THREE.Mesh(
        new THREE.BoxGeometry(wx * 0.55, wy * 0.28, wz * 0.42),
        concrete(CAMPUS_COLOR.concreteWarm),
      ).translateY(-wy * 0.28),
    );
  } else if (kit === "twin") {
    group.add(new THREE.Mesh(new THREE.BoxGeometry(wx * 0.35, wy, wz * 0.35), concrete()));
    const twin = new THREE.Mesh(new THREE.BoxGeometry(wx * 0.35, wy, wz * 0.35), concrete());
    twin.position.x = wx * 0.28;
    group.add(twin);
  } else if (kit === "covered") {
    group.add(new THREE.Mesh(new THREE.BoxGeometry(wx, wy * 0.65, wz), concrete()));
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(wx * 1.05, wy * 0.08, wz * 1.05), roof());
    canopy.position.y = wy * 0.35;
    group.add(canopy);
  } else if (kit === "welcome") {
    group.add(new THREE.Mesh(new THREE.BoxGeometry(wx, wy * 0.7, wz), concrete()));
    const facade = new THREE.Mesh(new THREE.BoxGeometry(wx * 0.85, wy * 0.35, wz * 0.12), glass());
    facade.position.set(0, wy * 0.05, wz * 0.42);
    group.add(facade);
  } else if (kit === "openHill") {
    const grass = new THREE.MeshStandardMaterial({ color: CAMPUS_COLOR.grass, roughness: 0.96 });
    for (let i = 0; i < 4; i++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(wx * (0.85 + i * 0.04), wy / 4, wz / 4), grass);
      step.position.set(0, -wy / 2 + (i + 0.5) * (wy / 4), -wz / 2 + (i + 0.5) * (wz / 4));
      group.add(step);
    }
  } else if (kit === "hillCanopy") {
    const grass = new THREE.MeshStandardMaterial({ color: CAMPUS_COLOR.grass, roughness: 0.96 });
    for (let i = 0; i < 4; i++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(wx * (0.85 + i * 0.04), wy / 4, wz / 4), grass);
      step.position.set(0, -wy / 2 + (i + 0.5) * (wy / 4), -wz / 2 + (i + 0.5) * (wz / 4));
      group.add(step);
    }
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(wx * 1.08, wy * 0.06, wz * 0.92), roof());
    canopy.position.set(0, wy * 0.42, wz * 0.08);
    group.add(canopy);
  } else if (kit === "medical") {
    group.add(new THREE.Mesh(new THREE.BoxGeometry(wx, wy, wz), concrete()));
    const crossMat = new THREE.MeshStandardMaterial({ color: "#ef4444", roughness: 0.5 });
    group.add(new THREE.Mesh(new THREE.BoxGeometry(wx * 0.22, wy * 0.35, wz * 0.04), crossMat).translateY(wy * 0.08).translateZ(wz * 0.48));
    group.add(new THREE.Mesh(new THREE.BoxGeometry(wx * 0.08, wy * 0.55, wz * 0.04), crossMat).translateY(wy * 0.08).translateZ(wz * 0.48));
  } else if (kit === "controlPost") {
    group.add(
      new THREE.Mesh(new THREE.BoxGeometry(wx * 0.65, wy * 0.55, wz * 0.7), concrete(CAMPUS_COLOR.concreteDark)).translateY(-wy * 0.12),
    );
    group.add(new THREE.Mesh(new THREE.BoxGeometry(wx * 1.1, wy * 0.05, wz * 0.85), roof()).translateY(wy * 0.38));
  } else if (kit === "workshops") {
    group.add(new THREE.Mesh(new THREE.BoxGeometry(wx, wy, wz), concrete(CAMPUS_COLOR.concreteDark)));
    for (let i = 0; i < 5; i++) {
      const x = -wx / 2 + ((i + 0.5) / 5) * wx;
      const bay = new THREE.Mesh(new THREE.BoxGeometry(wx / 5 * 0.7, wy * 0.75, wz * 0.85), concrete());
      bay.position.set(x, -wy * 0.08, 0);
      group.add(bay);
    }
  } else {
    group.add(new THREE.Mesh(new THREE.BoxGeometry(wx, wy, wz), concrete(CAMPUS_COLOR.concreteDark)));
  }

  const cap = new THREE.Mesh(new THREE.BoxGeometry(wx * 1.02, wy * 0.06, wz * 1.02), roof());
  cap.position.y = wy * 0.48;
  if (kit !== "openHill" && kit !== "hillCanopy" && kit !== "controlPost" && kit !== "medical") {
    group.add(cap);
  }
  if (kit === "medical") {
    cap.position.y = wy * 0.48;
    group.add(cap);
  }

  return group;
};

const exporter = new GLTFExporter();
fs.mkdirSync(OUT_DIR, { recursive: true });

for (const def of BUILDINGS) {
  const root = buildKit(def);
  root.name = def.id;
  const outPath = path.join(OUT_DIR, `${def.id}.glb`);
  const result = await new Promise((resolve, reject) => {
    exporter.parse(root, resolve, reject, { binary: true });
  });
  const buf = Buffer.from(result);
  fs.writeFileSync(outPath, buf);
  console.log(`Wrote ${outPath} (${buf.length} bytes)`);
}

console.log(`Exported ${BUILDINGS.length} campus GLBs → ${OUT_DIR}`);
