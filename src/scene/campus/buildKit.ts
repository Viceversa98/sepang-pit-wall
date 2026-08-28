import * as THREE from "three";
import type { CampusKit, CampusPlacement } from "@/lib/sepangCampusLayout";
import { CAMPUS_COLOR, createConcrete, createGlass, createRoof } from "@/scene/campus/materials";

const addMesh = (
  group: THREE.Group,
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  pos: THREE.Vector3,
  rotY = 0,
  castShadow = true,
): THREE.Mesh => {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(pos);
  mesh.rotation.y = rotY;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
};

const buildPitGarage = (placement: CampusPlacement): THREE.Group => {
  const group = new THREE.Group();
  const { size } = placement;
  const concrete = createConcrete();
  const dark = createConcrete(CAMPUS_COLOR.concreteDark);
  const glass = createGlass();

  addMesh(group, new THREE.BoxGeometry(size.x, size.y, size.z), concrete, new THREE.Vector3(0, 0, 0));

  const bayCount = 4;
  for (let i = 0; i < bayCount; i++) {
    const z = -size.z / 2 + ((i + 0.5) / bayCount) * size.z;
    addMesh(
      group,
      new THREE.BoxGeometry(size.x * 0.92, size.y * 0.55, size.z / bayCount * 0.75),
      dark,
      new THREE.Vector3(0, -size.y * 0.12, z),
    );
    addMesh(
      group,
      new THREE.PlaneGeometry(size.x * 0.88, size.y * 0.42),
      glass,
      new THREE.Vector3(0, size.y * 0.08, z + size.z / bayCount * 0.38),
    );
  }

  addMesh(
    group,
    new THREE.BoxGeometry(size.x * 1.02, size.y * 0.08, size.z * 1.02),
    createRoof(),
    new THREE.Vector3(0, size.y * 0.52, 0),
  );
  return group;
};

const buildMainStand = (placement: CampusPlacement): THREE.Group => {
  const group = new THREE.Group();
  const { size } = placement;
  const concrete = createConcrete();
  const tiers = 5;
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const h = size.y * (0.35 + t * 0.65);
    const w = size.x * (0.7 + t * 0.3);
    addMesh(
      group,
      new THREE.BoxGeometry(w, h / tiers, size.z * 0.92),
      concrete,
      new THREE.Vector3(0, -size.y / 2 + (i + 0.5) * (size.y / tiers), 0),
    );
  }
  addMesh(
    group,
    new THREE.BoxGeometry(size.x, size.y * 0.06, size.z),
    createRoof(),
    new THREE.Vector3(0, size.y * 0.48, 0),
  );
  return group;
};

const buildTower = (placement: CampusPlacement): THREE.Group => {
  const group = new THREE.Group();
  const { size } = placement;
  const concrete = createConcrete(CAMPUS_COLOR.concreteWarm);
  const dark = createConcrete(CAMPUS_COLOR.concreteDark);

  // Twin spires — Sepang welcome / Petronas-inspired silhouette
  const spireOffset = size.x * 0.18;
  for (const sign of [-1, 1]) {
    addMesh(
      group,
      new THREE.CylinderGeometry(size.x * 0.07, size.x * 0.11, size.y * 0.92, 10),
      dark,
      new THREE.Vector3(sign * spireOffset, size.y * 0.02, 0),
    );
    addMesh(
      group,
      new THREE.CylinderGeometry(size.x * 0.04, size.x * 0.06, size.y * 0.22, 8),
      concrete,
      new THREE.Vector3(sign * spireOffset, size.y * 0.52, 0),
    );
  }

  addMesh(
    group,
    new THREE.BoxGeometry(size.x * 0.55, size.y * 0.28, size.z * 0.42),
    concrete,
    new THREE.Vector3(0, -size.y * 0.28, 0),
  );

  const canopyMat = new THREE.MeshStandardMaterial({
    color: CAMPUS_COLOR.canopy,
    roughness: 0.22,
    metalness: 0.28,
    side: THREE.DoubleSide,
  });
  const petals = 8;
  const radius = size.x * 0.38;
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2;
    addMesh(
      group,
      new THREE.SphereGeometry(radius * 0.38, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.52),
      canopyMat,
      new THREE.Vector3(Math.cos(a) * radius * 0.2, size.y * 0.44, Math.sin(a) * radius * 0.2),
      a,
    );
  }
  return group;
};

const buildTwinTowers = (placement: CampusPlacement): THREE.Group => {
  const group = new THREE.Group();
  const { size } = placement;
  const concrete = createConcrete();
  const offset = size.x * 0.28;
  addMesh(group, new THREE.BoxGeometry(size.x * 0.35, size.y, size.z * 0.35), concrete, new THREE.Vector3(-offset, 0, 0));
  addMesh(group, new THREE.BoxGeometry(size.x * 0.35, size.y, size.z * 0.35), concrete, new THREE.Vector3(offset, 0, 0));
  addMesh(group, new THREE.BoxGeometry(size.x * 0.9, size.y * 0.06, size.z * 0.5), createRoof(), new THREE.Vector3(0, size.y * 0.48, 0));
  return group;
};

const buildCoveredStand = (placement: CampusPlacement): THREE.Group => {
  const group = new THREE.Group();
  const { size } = placement;
  addMesh(group, new THREE.BoxGeometry(size.x, size.y * 0.65, size.z), createConcrete(), new THREE.Vector3(0, -size.y * 0.12, 0));
  addMesh(group, new THREE.BoxGeometry(size.x * 1.05, size.y * 0.08, size.z * 1.05), createRoof(), new THREE.Vector3(0, size.y * 0.35, 0));
  return group;
};

const buildOpenHill = (placement: CampusPlacement): THREE.Group => {
  const group = new THREE.Group();
  const { size } = placement;
  const grass = new THREE.MeshStandardMaterial({ color: CAMPUS_COLOR.grass, roughness: 0.96 });
  const steps = 4;
  for (let i = 0; i < steps; i++) {
    addMesh(
      group,
      new THREE.BoxGeometry(size.x * (0.85 + i * 0.04), size.y / steps, size.z / steps),
      grass,
      new THREE.Vector3(0, -size.y / 2 + (i + 0.5) * (size.y / steps), -size.z / 2 + (i + 0.5) * (size.z / steps)),
      0,
      false,
    );
  }
  return group;
};

const buildWelcome = (placement: CampusPlacement): THREE.Group => {
  const group = new THREE.Group();
  const { size } = placement;
  addMesh(group, new THREE.BoxGeometry(size.x, size.y * 0.7, size.z), createConcrete(), new THREE.Vector3(0, -size.y * 0.1, 0));
  addMesh(group, new THREE.BoxGeometry(size.x * 0.85, size.y * 0.35, size.z * 0.12), createGlass(), new THREE.Vector3(0, size.y * 0.05, size.z * 0.42));
  addMesh(group, new THREE.BoxGeometry(size.x, size.y * 0.06, size.z), createRoof(), new THREE.Vector3(0, size.y * 0.38, 0));
  return group;
};

const buildChalet = (placement: CampusPlacement): THREE.Group => {
  const group = new THREE.Group();
  const { size } = placement;
  addMesh(group, new THREE.BoxGeometry(size.x, size.y, size.z), createConcrete(CAMPUS_COLOR.concreteDark), new THREE.Vector3(0, 0, 0));
  addMesh(group, new THREE.BoxGeometry(size.x * 1.02, size.y * 0.08, size.z * 1.02), createRoof(), new THREE.Vector3(0, size.y * 0.48, 0));
  return group;
};

const buildSouthPaddock = (placement: CampusPlacement): THREE.Group => {
  const group = new THREE.Group();
  const { size } = placement;
  addMesh(group, new THREE.BoxGeometry(size.x, size.y, size.z), createConcrete(), new THREE.Vector3(0, 0, 0));
  addMesh(group, new THREE.BoxGeometry(size.x * 0.9, size.y * 0.5, size.z * 0.15), createConcrete(CAMPUS_COLOR.asphalt), new THREE.Vector3(0, -size.y * 0.1, size.z * 0.38));
  return group;
};

const buildWorkshops = (placement: CampusPlacement): THREE.Group => {
  const group = new THREE.Group();
  const { size } = placement;
  addMesh(group, new THREE.BoxGeometry(size.x, size.y, size.z), createConcrete(CAMPUS_COLOR.concreteDark), new THREE.Vector3(0, 0, 0));
  const bays = 5;
  for (let i = 0; i < bays; i++) {
    const x = -size.x / 2 + ((i + 0.5) / bays) * size.x;
    addMesh(
      group,
      new THREE.BoxGeometry(size.x / bays * 0.7, size.y * 0.75, size.z * 0.85),
      createConcrete(),
      new THREE.Vector3(x, -size.y * 0.08, 0),
    );
  }
  return group;
};

const buildHillCanopy = (placement: CampusPlacement): THREE.Group => {
  const group = buildOpenHill(placement);
  const { size } = placement;
  addMesh(
    group,
    new THREE.BoxGeometry(size.x * 1.08, size.y * 0.06, size.z * 0.92),
    createRoof(),
    new THREE.Vector3(0, size.y * 0.42, size.z * 0.08),
  );
  return group;
};

const buildMedical = (placement: CampusPlacement): THREE.Group => {
  const group = new THREE.Group();
  const { size } = placement;
  addMesh(group, new THREE.BoxGeometry(size.x, size.y, size.z), createConcrete(), new THREE.Vector3(0, 0, 0));
  const crossMat = new THREE.MeshStandardMaterial({
    color: "#ef4444",
    roughness: 0.5,
    metalness: 0.1,
  });
  addMesh(
    group,
    new THREE.BoxGeometry(size.x * 0.22, size.y * 0.35, size.z * 0.04),
    crossMat,
    new THREE.Vector3(0, size.y * 0.08, size.z * 0.48),
  );
  addMesh(
    group,
    new THREE.BoxGeometry(size.x * 0.08, size.y * 0.55, size.z * 0.04),
    crossMat,
    new THREE.Vector3(0, size.y * 0.08, size.z * 0.48),
  );
  addMesh(group, new THREE.BoxGeometry(size.x, size.y * 0.06, size.z), createRoof(), new THREE.Vector3(0, size.y * 0.48, 0));
  return group;
};

const buildControlPost = (placement: CampusPlacement): THREE.Group => {
  const group = new THREE.Group();
  const { size } = placement;
  addMesh(
    group,
    new THREE.BoxGeometry(size.x * 0.65, size.y * 0.55, size.z * 0.7),
    createConcrete(CAMPUS_COLOR.concreteDark),
    new THREE.Vector3(0, -size.y * 0.12, 0),
  );
  addMesh(
    group,
    new THREE.BoxGeometry(size.x * 1.1, size.y * 0.05, size.z * 0.85),
    createRoof(),
    new THREE.Vector3(0, size.y * 0.38, 0),
  );
  addMesh(
    group,
    new THREE.PlaneGeometry(size.x * 0.5, size.y * 0.35),
    createGlass(),
    new THREE.Vector3(0, size.y * 0.02, size.z * 0.36),
  );
  return group;
};

export const buildCampusKit = (placement: CampusPlacement): THREE.Group => {
  const kit: Record<CampusKit, (p: CampusPlacement) => THREE.Group> = {
    pit: buildPitGarage,
    mainStand: buildMainStand,
    tower: buildTower,
    twin: buildTwinTowers,
    covered: buildCoveredStand,
    openHill: buildOpenHill,
    hillCanopy: buildHillCanopy,
    welcome: buildWelcome,
    chalets: buildChalet,
    southPaddock: buildSouthPaddock,
    workshops: buildWorkshops,
    medical: buildMedical,
    controlPost: buildControlPost,
  };
  return kit[placement.def.kit](placement);
};
