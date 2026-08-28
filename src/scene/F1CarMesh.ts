import * as THREE from "three";
import { metresToUnits } from "@/lib/trackCurve";

const ACCENT = "#ec4899";
const ACCENT_PURPLE = "#7c3aed";

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

type Station = {
  z: number;
  halfW: number;
  halfH: number;
  y0: number;
};

const sampleRoundedRect = (
  halfW: number,
  halfH: number,
  y0: number,
  corner: number,
  segs: number,
): { x: number; y: number }[] => {
  const r = Math.min(corner, halfW * 0.9, halfH * 0.9);
  const pts: { x: number; y: number }[] = [];
  const y1 = y0 + halfH * 2;
  const perCorner = Math.max(3, Math.floor(segs / 4));
  const corners: [number, number, number, number][] = [
    [-halfW + r, y0 + r, Math.PI, Math.PI * 1.5],
    [halfW - r, y0 + r, Math.PI * 1.5, Math.PI * 2],
    [halfW - r, y1 - r, 0, Math.PI * 0.5],
    [-halfW + r, y1 - r, Math.PI * 0.5, Math.PI],
  ];
  for (const [cx, cy, a0, a1] of corners) {
    for (let i = 0; i <= perCorner; i++) {
      const t = i / perCorner;
      const a = a0 + (a1 - a0) * t;
      pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
  }
  return pts;
};

const buildLoftHull = (stations: Station[], radialHint = 24): THREE.BufferGeometry => {
  const rings = stations.map((s) =>
    sampleRoundedRect(s.halfW, s.halfH, s.y0, Math.min(s.halfW, s.halfH) * 0.45, radialHint),
  );
  const segs = rings[0].length;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < rings.length; i++) {
    const s = stations[i];
    for (let j = 0; j < segs; j++) {
      const p = rings[i][j];
      positions.push(p.x, p.y, s.z);
    }
  }

  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < segs; j++) {
      const j2 = (j + 1) % segs;
      const a = i * segs + j;
      const b = i * segs + j2;
      const c = (i + 1) * segs + j;
      const d = (i + 1) * segs + j2;
      indices.push(a, c, b, b, c, d);
    }
  }

  const nose = stations[0];
  const rear = stations[stations.length - 1];
  const noseCenter = positions.length / 3;
  positions.push(0, nose.y0 + nose.halfH, nose.z + nose.halfW * 0.2);
  const rearCenter = positions.length / 3;
  positions.push(0, rear.y0 + rear.halfH, rear.z - rear.halfW * 0.15);

  for (let j = 0; j < segs; j++) {
    const j2 = (j + 1) % segs;
    indices.push(noseCenter, j2, j);
    const r0 = (rings.length - 1) * segs + j;
    const r1 = (rings.length - 1) * segs + j2;
    indices.push(rearCenter, r0, r1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
};

const makeTextTexture = (label: string, opts?: { fontSize?: number; fill?: string }) => {
  if (typeof document === "undefined") return null;
  const fontSize = opts?.fontSize ?? 64;
  const fill = opts?.fill ?? "#ffffff";
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = fill;
  ctx.font = `bold ${fontSize}px Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, canvas.width / 2, canvas.height / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
};

const addBox = (
  parent: THREE.Object3D,
  args: [number, number, number],
  material: THREE.Material,
  position: [number, number, number],
  rotation?: [number, number, number],
  castShadow = true,
): THREE.Mesh => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...args), material);
  mesh.position.set(...position);
  if (rotation) mesh.rotation.set(...rotation);
  mesh.castShadow = castShadow;
  parent.add(mesh);
  return mesh;
};

const addDecalPlane = (
  parent: THREE.Object3D,
  texture: THREE.CanvasTexture | null,
  position: [number, number, number],
  size: [number, number],
  rotation?: [number, number, number],
): void => {
  if (!texture) return;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(size[0], size[1]),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    }),
  );
  mesh.position.set(...position);
  if (rotation) mesh.rotation.set(...rotation);
  mesh.renderOrder = 2;
  parent.add(mesh);
};

const addWheel = (
  parent: THREE.Object3D,
  x: number,
  z: number,
  width: number,
  tyreR: number,
  mats: Record<string, THREE.MeshStandardMaterial>,
  name: string,
): void => {
  const group = new THREE.Group();
  group.name = name;
  group.position.set(x, tyreR, z);

  const tyre = new THREE.Mesh(
    new THREE.CylinderGeometry(tyreR, tyreR, width, 24),
    mats.rubber,
  );
  tyre.rotation.z = Math.PI / 2;
  tyre.castShadow = true;
  group.add(tyre);

  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(tyreR * 0.55, tyreR * 0.55, width * 0.42, 16),
    mats.rim,
  );
  rim.rotation.z = Math.PI / 2;
  rim.castShadow = true;
  group.add(rim);

  const stripe = new THREE.Mesh(
    new THREE.CylinderGeometry(tyreR * 1.01, tyreR * 1.01, width * 0.045, 20),
    mats.stripeYellow,
  );
  stripe.rotation.z = Math.PI / 2;
  group.add(stripe);

  parent.add(group);
};

const addSuspension = (
  parent: THREE.Object3D,
  x: number,
  z: number,
  u: (m: number) => number,
  tyreR: number,
  carbon: THREE.MeshStandardMaterial,
): void => {
  const side = Math.sign(x) || 1;
  const railX = side * u(0.58);
  const span = Math.abs(x - railX);
  const midX = (x + railX) * 0.5;

  const lower = new THREE.Mesh(
    new THREE.CylinderGeometry(u(0.026), u(0.026), span, 8),
    carbon,
  );
  lower.position.set(midX, tyreR * 0.92, z);
  lower.rotation.z = Math.PI / 2;
  lower.castShadow = true;
  parent.add(lower);

  const upper = new THREE.Mesh(
    new THREE.CylinderGeometry(u(0.018), u(0.018), span * 1.02, 8),
    carbon,
  );
  upper.position.set(midX, u(0.32), z + u(0.05));
  upper.rotation.set(0.12, 0, side * 0.12);
  upper.castShadow = true;
  parent.add(upper);

  const link = new THREE.Mesh(
    new THREE.CylinderGeometry(u(0.015), u(0.015), span * 0.98, 8),
    carbon,
  );
  link.position.set(midX, u(0.16), z - u(0.04));
  link.rotation.set(-0.1, 0, side * 0.2);
  link.castShadow = true;
  parent.add(link);
};

/**
 * Academy open-wheel: flat-floor rounded-rect loft (coke-bottle) + halo + wings.
 */
export const createF1CarMesh = (color: string, isPlayer = false): THREE.Group => {
  const u = metresToUnits;
  const e = isPlayer ? 0.28 : 0.1;

  const mats = {
    body: new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: e * 0.25,
      metalness: 0.45,
      roughness: 0.35,
    }),
    carbon: new THREE.MeshStandardMaterial({
      color: "#111114",
      metalness: 0.3,
      roughness: 0.65,
    }),
    aero: new THREE.MeshStandardMaterial({
      color: "#151518",
      metalness: 0.4,
      roughness: 0.42,
    }),
    accent: new THREE.MeshStandardMaterial({
      color: ACCENT,
      metalness: 0.35,
      roughness: 0.4,
      emissive: ACCENT,
      emissiveIntensity: 0.08,
    }),
    purple: new THREE.MeshStandardMaterial({
      color: ACCENT_PURPLE,
      metalness: 0.35,
      roughness: 0.4,
    }),
    rubber: new THREE.MeshStandardMaterial({
      color: "#0a0a0a",
      metalness: 0.02,
      roughness: 0.92,
    }),
    rim: new THREE.MeshStandardMaterial({
      color: "#c0c4cc",
      metalness: 0.75,
      roughness: 0.35,
    }),
    stripeYellow: new THREE.MeshStandardMaterial({
      color: "#fbbf24",
      metalness: 0.35,
      roughness: 0.4,
      emissive: "#f59e0b",
      emissiveIntensity: 0.12,
    }),
    halo: new THREE.MeshStandardMaterial({
      color: "#f8fafc",
      metalness: 0.55,
      roughness: 0.28,
    }),
    helmShell: new THREE.MeshStandardMaterial({
      color: "#f1f5f9",
      metalness: 0.4,
      roughness: 0.25,
    }),
    visor: new THREE.MeshStandardMaterial({
      color: "#020617",
      metalness: 0.9,
      roughness: 0.1,
    }),
    seat: new THREE.MeshStandardMaterial({
      color: "#334155",
      roughness: 0.7,
      metalness: 0.05,
    }),
  };

  const academyTex = makeTextTexture("F1 ACADEMY", { fontSize: 72 });
  const fuelTex = makeTextTexture("FUELLING THE FUTURE", { fontSize: 48 });
  const numTex = makeTextTexture("22", { fontSize: 160 });

  const wheelbase = u(3.7);
  const frontZ = wheelbase * 0.5;
  const rearZ = -wheelbase * 0.5;
  const tyreR = u(0.36);
  const frontTyreW = u(0.305);
  const rearTyreW = u(0.405);
  const trackFront = u(1.12);
  const trackRear = u(1.08);

  const hullGeo = buildLoftHull(
    [
      { z: frontZ + u(1.12), halfW: u(0.1), halfH: u(0.08), y0: u(0.3) },
      { z: frontZ + u(1.12) - u(0.35), halfW: u(0.18), halfH: u(0.11), y0: u(0.24) },
      { z: frontZ + u(0.25), halfW: u(0.26), halfH: u(0.14), y0: u(0.14) },
      { z: frontZ - u(0.25), halfW: u(0.4), halfH: u(0.18), y0: u(0.1) },
      { z: u(1.05), halfW: u(0.95), halfH: u(0.32), y0: u(0.08) },
      { z: u(0.55), halfW: u(1.12), halfH: u(0.36), y0: u(0.08) },
      { z: u(0.05), halfW: u(1.15), halfH: u(0.38), y0: u(0.08) },
      { z: u(-0.4), halfW: u(1.0), halfH: u(0.34), y0: u(0.08) },
      { z: u(-0.85), halfW: u(0.55), halfH: u(0.28), y0: u(0.1) },
      { z: u(-1.25), halfW: u(0.35), halfH: u(0.26), y0: u(0.14) },
      { z: rearZ + u(0.25), halfW: u(0.22), halfH: u(0.2), y0: u(0.16) },
      { z: rearZ + u(0.02), halfW: u(0.14), halfH: u(0.14), y0: u(0.18) },
    ],
    28,
  );

  const coverGeo = buildLoftHull(
    [
      { z: u(0.45), halfW: u(0.3), halfH: u(0.12), y0: u(0.55) },
      { z: u(0.05), halfW: u(0.14), halfH: u(0.1), y0: u(0.62) },
      { z: u(-0.4), halfW: u(0.3), halfH: u(0.18), y0: u(0.6) },
      { z: u(-0.9), halfW: u(0.22), halfH: u(0.16), y0: u(0.58) },
      { z: u(-1.35), halfW: u(0.14), halfH: u(0.12), y0: u(0.5) },
    ],
    20,
  );

  const haloHoopPts = [
    v3(-u(0.34), u(0.62), u(0.08)),
    v3(-u(0.34), u(0.82), u(0.08)),
    v3(-u(0.34), u(1.1), u(0.2)),
    v3(-u(0.34) * 0.6, u(1.1), u(0.38)),
    v3(-u(0.34) * 0.25, u(1.1), u(0.55)),
    v3(0, u(1.1), u(0.7)),
    v3(u(0.34) * 0.25, u(1.1), u(0.55)),
    v3(u(0.34) * 0.6, u(1.1), u(0.38)),
    v3(u(0.34), u(1.1), u(0.2)),
    v3(u(0.34), u(0.82), u(0.08)),
    v3(u(0.34), u(0.62), u(0.08)),
  ];
  const haloHoopGeo = new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(haloHoopPts, false, "centripetal", 0.5),
    128,
    u(0.045),
    14,
    false,
  );

  const haloStalkPts = [
    v3(0, u(0.58), u(0.7)),
    v3(0, u(0.78), u(0.7)),
    v3(0, u(0.96), u(0.7)),
    v3(0, u(1.1), u(0.7)),
  ];
  const haloStalkGeo = new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(haloStalkPts, false, "centripetal", 0.5),
    32,
    u(0.048),
    12,
    false,
  );

  const root = new THREE.Group();
  root.name = "f1Car";

  const bodyGroup = new THREE.Group();
  bodyGroup.name = "bodyGroup";
  root.add(bodyGroup);

  const hull = new THREE.Mesh(hullGeo, mats.body);
  hull.castShadow = true;
  hull.receiveShadow = true;
  bodyGroup.add(hull);

  const cover = new THREE.Mesh(coverGeo, mats.body);
  cover.castShadow = true;
  bodyGroup.add(cover);

  addBox(bodyGroup, [u(0.08), u(0.14), u(0.62)], mats.carbon, [-u(0.28), u(0.52), u(0.28)]);
  addBox(bodyGroup, [u(0.08), u(0.14), u(0.62)], mats.carbon, [u(0.28), u(0.52), u(0.28)]);
  addBox(bodyGroup, [u(0.028), u(0.48), u(1.0)], mats.body, [0, u(0.95), u(-0.95)]);
  addBox(bodyGroup, [u(0.3), u(0.26), u(0.38)], mats.body, [0, u(1.0), u(-0.2)]);
  addBox(bodyGroup, [u(0.22), u(0.07), u(0.16)], mats.accent, [0, u(1.12), u(-0.18)]);
  addBox(bodyGroup, [u(2.0), u(0.04), u(3.95)], mats.carbon, [0, u(0.035), u(-0.05)], undefined, true);
  bodyGroup.children[bodyGroup.children.length - 1]!.receiveShadow = true;
  addBox(bodyGroup, [u(1.1), u(0.14), u(0.38)], mats.carbon, [0, u(0.14), rearZ + u(0.05)]);
  addBox(bodyGroup, [u(0.05), u(0.22), u(0.5)], mats.purple, [u(0.2), u(0.8), u(-0.5)], [0, 0, 0.28]);

  addDecalPlane(root, academyTex, [-u(1.02), u(0.4), u(0.1)], [u(1.3), u(0.26)], [0, -Math.PI / 2, 0]);
  addDecalPlane(root, academyTex, [u(1.02), u(0.4), u(0.1)], [u(1.3), u(0.26)], [0, Math.PI / 2, 0]);
  addDecalPlane(root, fuelTex, [0, u(0.36), frontZ + u(0.4)], [u(0.85), u(0.13)], [-0.28, 0, 0]);
  addDecalPlane(root, numTex, [-u(0.58), u(0.92), rearZ - u(0.5)], [u(0.34), u(0.4)], [0, -Math.PI / 2, 0]);
  addDecalPlane(root, numTex, [u(0.58), u(0.92), rearZ - u(0.5)], [u(0.34), u(0.4)], [0, Math.PI / 2, 0]);

  const driver = new THREE.Group();
  driver.name = "driver";
  driver.position.set(0, u(0.88), u(0.34));
  addBox(driver, [u(0.38), u(0.08), u(0.42)], mats.seat, [0, u(-0.14), u(-0.02)]);
  addBox(driver, [u(0.44), u(0.14), u(0.3)], mats.body, [0, u(-0.08), u(0.02)]);
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(u(0.055), u(0.065), u(0.09), 10),
    mats.carbon,
  );
  neck.position.set(0, u(-0.02), u(0.04));
  neck.castShadow = true;
  driver.add(neck);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(u(0.16), 16, 14), mats.helmShell);
  helmet.castShadow = true;
  helmet.scale.set(1, 1.1, 1.14);
  helmet.renderOrder = 2;
  driver.add(helmet);
  const visorMesh = new THREE.Mesh(
    new THREE.BoxGeometry(u(0.24), u(0.08), u(0.09)),
    mats.visor,
  );
  visorMesh.position.set(0, u(0.015), u(0.12));
  visorMesh.castShadow = true;
  visorMesh.renderOrder = 3;
  driver.add(visorMesh);
  root.add(driver);

  const haloGroup = new THREE.Group();
  haloGroup.name = "haloGroup";
  const haloHoop = new THREE.Mesh(haloHoopGeo, mats.halo);
  haloHoop.castShadow = true;
  haloGroup.add(haloHoop);
  const haloStalk = new THREE.Mesh(haloStalkGeo, mats.halo);
  haloStalk.castShadow = true;
  haloGroup.add(haloStalk);
  root.add(haloGroup);

  const frontWing = new THREE.Group();
  frontWing.name = "frontWing";
  addBox(frontWing, [u(2.2), u(0.035), u(0.36)], mats.aero, [0, u(0.08), frontZ + u(1.18)]);
  addBox(frontWing, [u(1.9), u(0.028), u(0.22)], mats.aero, [0, u(0.14), frontZ + u(1.1)]);
  addBox(frontWing, [u(1.5), u(0.022), u(0.14)], mats.body, [0, u(0.19), frontZ + u(1.02)]);
  addBox(frontWing, [u(0.045), u(0.18), u(0.14)], mats.carbon, [-u(0.07), u(0.18), frontZ + u(0.95)]);
  addBox(frontWing, [u(0.045), u(0.18), u(0.14)], mats.carbon, [u(0.07), u(0.18), frontZ + u(0.95)]);
  addBox(frontWing, [u(0.055), u(0.45), u(0.5)], mats.accent, [-u(1.08), u(0.24), frontZ + u(1.1)]);
  addBox(frontWing, [u(0.055), u(0.45), u(0.5)], mats.accent, [u(1.08), u(0.24), frontZ + u(1.1)]);
  root.add(frontWing);

  const rearWing = new THREE.Group();
  rearWing.name = "rearWing";
  addBox(rearWing, [u(0.045), u(0.62), u(0.045)], mats.carbon, [-u(0.14), u(0.72), rearZ - u(0.08)]);
  addBox(rearWing, [u(0.045), u(0.62), u(0.045)], mats.carbon, [u(0.14), u(0.72), rearZ - u(0.08)]);
  addBox(rearWing, [u(1.15), u(0.045), u(0.28)], mats.aero, [0, u(1.02), rearZ - u(0.52)]);
  addBox(rearWing, [u(1.1), u(0.035), u(0.15)], mats.aero, [0, u(1.15), rearZ - u(0.46)]);
  addBox(rearWing, [u(0.045), u(0.58), u(0.45)], mats.purple, [-u(0.58), u(0.9), rearZ - u(0.5)]);
  addBox(rearWing, [u(0.045), u(0.58), u(0.45)], mats.purple, [u(0.58), u(0.9), rearZ - u(0.5)]);
  addBox(rearWing, [u(0.8), u(0.03), u(0.09)], mats.carbon, [0, u(0.3), rearZ - u(0.2)]);
  root.add(rearWing);

  addWheel(root, -trackFront, frontZ, frontTyreW, tyreR, mats, "wheelFL");
  addWheel(root, trackFront, frontZ, frontTyreW, tyreR, mats, "wheelFR");
  addWheel(root, -trackRear, rearZ, rearTyreW, tyreR, mats, "wheelRL");
  addWheel(root, trackRear, rearZ, rearTyreW, tyreR, mats, "wheelRR");

  addSuspension(root, -trackFront, frontZ, u, tyreR, mats.carbon);
  addSuspension(root, trackFront, frontZ, u, tyreR, mats.carbon);
  addSuspension(root, -trackRear, rearZ, u, tyreR, mats.carbon);
  addSuspension(root, trackRear, rearZ, u, tyreR, mats.carbon);

  const brakeLightMats: THREE.MeshStandardMaterial[] = [];
  const addBrakeLight = (x: number, y: number, z: number) => {
    const mat = new THREE.MeshStandardMaterial({
      color: "#4a0808",
      emissive: "#ff2200",
      emissiveIntensity: 0,
      metalness: 0.1,
      roughness: 0.35,
      toneMapped: false,
    });
    brakeLightMats.push(mat);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(u(0.14), u(0.05), u(0.04)), mat);
    lamp.position.set(x, y, z);
    lamp.name = "brakeLight";
    lamp.renderOrder = 4;
    root.add(lamp);
  };
  addBrakeLight(-u(0.42), u(0.22), rearZ - u(0.12));
  addBrakeLight(u(0.42), u(0.22), rearZ - u(0.12));
  addBrakeLight(0, u(0.24), rearZ - u(0.14));

  root.userData.brakeLightMats = brakeLightMats;

  root.userData.dispose = () => {
    hullGeo.dispose();
    coverGeo.dispose();
    haloHoopGeo.dispose();
    haloStalkGeo.dispose();
    Object.values(mats).forEach((m) => m.dispose());
    brakeLightMats.forEach((m) => m.dispose());
    academyTex?.dispose();
    fuelTex?.dispose();
    numTex?.dispose();
    root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        if (obj.geometry && obj.geometry !== hullGeo && obj.geometry !== coverGeo &&
            obj.geometry !== haloHoopGeo && obj.geometry !== haloStalkGeo) {
          obj.geometry.dispose();
        }
        if (obj.material instanceof THREE.MeshBasicMaterial && obj.material.map) {
          // decal materials share textures disposed above
          obj.material.dispose();
        }
      }
    });
  };


  return root;
};

/** Spin wheels and steer fronts from physics telemetry. */
export const updateF1CarWheels = (
  root: THREE.Object3D,
  speedMps: number,
  steer: number,
  dt: number,
): void => {
  const spin = (speedMps / 0.36) * dt;
  for (const name of ["wheelFL", "wheelFR", "wheelRL", "wheelRR"]) {
    const wheel = root.getObjectByName(name);
    if (wheel) wheel.rotateX(spin);
  }
  const steerAngle = steer * 0.42;
  const fl = root.getObjectByName("wheelFL");
  const fr = root.getObjectByName("wheelFR");
  if (fl) fl.rotation.y = steerAngle;
  if (fr) fr.rotation.y = steerAngle;
};

/** Drive rear brake lamp emissive from sim brake demand (0–1). */
export const updateF1CarBrakeLights = (root: THREE.Object3D, intensity: number): void => {
  const mats = root.userData.brakeLightMats as THREE.MeshStandardMaterial[] | undefined;
  if (!mats?.length) return;

  const on = Math.max(0, Math.min(1, intensity));
  const lit = on > 0.08;
  const emissiveIntensity = lit ? 0.55 + on * 2.4 : 0;

  for (const mat of mats) {
    mat.emissiveIntensity = emissiveIntensity;
    mat.color.set(lit ? "#ff1a00" : "#3a0808");
  }
};
