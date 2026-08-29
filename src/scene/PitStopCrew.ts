import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { sampleCarPose } from "@/lib/carPose";
import { metresToUnits } from "@/lib/trackCurve";
import {
  FIELD_META,
  gridIndexForCar,
  gridSlotForCar,
  type CarState,
  type RacePhase,
} from "@/stores/raceStore";
import type { CarVisualPose } from "@/lib/carVisual";

const CREW_GLB = "/models/pit/crew.glb";
const CREW_ANIM_RANGE = 55;

type CrewCorner = { x: number; z: number };
type CarEntryLike = { visual: CarVisualPose; gridIndex: number };

type CrewEntry = {
  root: THREE.Group;
  jackFront: THREE.Group;
  jackRear: THREE.Group;
  gunMeshes: THREE.Mesh[];
  lollipopMat: THREE.MeshStandardMaterial;
  crewGroups: THREE.Group[];
  cornerGroups: THREE.Group[];
  gridIndex: number;
  usesGlb: boolean;
};

const corners: CrewCorner[] = (() => {
  const lat = metresToUnits(1.35);
  const lon = metresToUnits(1.6);
  return [
    { x: -lat, z: lon },
    { x: lat, z: lon },
    { x: -lat, z: -lon },
    { x: lat, z: -lon },
  ];
})();

const createPhotorealCrew = (color: string, gunning: boolean): THREE.Group => {
  const group = new THREE.Group();
  const crouch = gunning ? 0.35 : 0.08;
  const armReach = gunning ? 0.55 : 0.15;
  const suitMat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.45,
    metalness: 0.15,
  });
  const torsoMat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.4,
    metalness: 0.2,
  });

  const legGeo = new THREE.CapsuleGeometry(metresToUnits(0.09), metresToUnits(0.45), 4, 8);
  const leftLeg = new THREE.Mesh(legGeo, suitMat);
  leftLeg.position.set(-metresToUnits(0.12), metresToUnits(0.35 - crouch * 0.2), 0);
  leftLeg.castShadow = true;
  group.add(leftLeg);

  const rightLeg = new THREE.Mesh(legGeo, suitMat);
  rightLeg.position.set(metresToUnits(0.12), metresToUnits(0.35 - crouch * 0.2), 0);
  rightLeg.castShadow = true;
  group.add(rightLeg);

  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(metresToUnits(0.42), metresToUnits(0.55), metresToUnits(0.28)),
    torsoMat,
  );
  torso.position.y = metresToUnits(0.95 - crouch);
  torso.castShadow = true;
  group.add(torso);

  const armGeo = new THREE.CapsuleGeometry(metresToUnits(0.07), metresToUnits(0.4), 4, 6);
  const leftArm = new THREE.Mesh(armGeo, suitMat);
  leftArm.position.set(
    -metresToUnits(0.32),
    metresToUnits(0.95 - crouch),
    metresToUnits(armReach * 0.4),
  );
  leftArm.rotation.set(armReach * 0.9, 0, -0.4);
  leftArm.castShadow = true;
  group.add(leftArm);

  const rightArm = new THREE.Mesh(armGeo, suitMat);
  rightArm.position.set(
    metresToUnits(0.32),
    metresToUnits(0.95 - crouch),
    metresToUnits(armReach * 0.4),
  );
  rightArm.rotation.set(armReach * 0.9, 0, 0.4);
  rightArm.castShadow = true;
  group.add(rightArm);

  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(metresToUnits(0.18), 16, 16),
    new THREE.MeshStandardMaterial({ color: "#0f172a", roughness: 0.25, metalness: 0.55 }),
  );
  helmet.position.y = metresToUnits(1.42 - crouch);
  helmet.castShadow = true;
  group.add(helmet);

  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(metresToUnits(0.22), metresToUnits(0.1), metresToUnits(0.06)),
    new THREE.MeshStandardMaterial({
      color: "#38bdf8",
      emissive: "#0ea5e9",
      emissiveIntensity: 0.25,
      transparent: true,
      opacity: 0.65,
      roughness: 0.1,
      metalness: 0.8,
    }),
  );
  visor.position.set(0, metresToUnits(1.4 - crouch), metresToUnits(0.12));
  group.add(visor);

  if (gunning) {
    const gun = new THREE.Mesh(
      new THREE.CylinderGeometry(
        metresToUnits(0.06),
        metresToUnits(0.08),
        metresToUnits(0.35),
        8,
      ),
      new THREE.MeshStandardMaterial({ color: "#fbbf24", metalness: 0.7, roughness: 0.25 }),
    );
    gun.position.set(0, metresToUnits(0.7 - crouch), metresToUnits(0.55));
    gun.castShadow = true;
    group.add(gun);
  }

  group.userData.gunningParts = { leftLeg, rightLeg, torso, leftArm, rightArm, helmet, visor };
  return group;
};

const createPitStopCrew = (carId: string): CrewEntry => {
  const meta = FIELD_META.find((c) => c.id === carId);
  const gridIndex = gridIndexForCar(carId);
  const suit = meta?.color ?? "#e2e8f0";
  const root = new THREE.Group();
  root.name = `pit-crew-${carId}`;
  root.visible = false;

  const crewGroups: THREE.Group[] = [];
  const cornerGroups: THREE.Group[] = [];
  for (const c of corners) {
    const cornerGroup = new THREE.Group();
    cornerGroup.position.set(c.x, 0, c.z);
    const crew = createPhotorealCrew(suit, true);
    cornerGroup.add(crew);
    root.add(cornerGroup);
    cornerGroups.push(cornerGroup);
    crewGroups.push(crew);
  }

  const jackLen = metresToUnits(1.8);
  const jackMat = new THREE.MeshStandardMaterial({
    color: "#f59e0b",
    metalness: 0.65,
    roughness: 0.28,
  });
  const jackGeo = new THREE.BoxGeometry(metresToUnits(0.35), metresToUnits(0.25), jackLen);

  const jackFront = new THREE.Group();
  jackFront.position.set(0, metresToUnits(0.15), metresToUnits(2.2));
  const jackFrontMesh = new THREE.Mesh(jackGeo, jackMat);
  jackFrontMesh.castShadow = true;
  jackFront.add(jackFrontMesh);
  root.add(jackFront);

  const jackRear = new THREE.Group();
  jackRear.position.set(0, metresToUnits(0.15), -metresToUnits(2.2));
  const jackRearMesh = new THREE.Mesh(jackGeo, jackMat);
  jackRearMesh.castShadow = true;
  jackRear.add(jackRearMesh);
  root.add(jackRear);

  const lollipopMat = new THREE.MeshStandardMaterial({
    color: "#f8fafc",
    emissive: "#ef4444",
    emissiveIntensity: 0.55,
    toneMapped: false,
  });
  const lollipopGroup = new THREE.Group();
  lollipopGroup.position.set(metresToUnits(2.2), metresToUnits(1.2), metresToUnits(0.2));
  lollipopGroup.add(
    new THREE.Mesh(
      new THREE.CylinderGeometry(metresToUnits(0.06), metresToUnits(0.06), metresToUnits(2.2), 6),
      new THREE.MeshStandardMaterial({ color: "#334155" }),
    ),
  );
  const lollipopSign = new THREE.Mesh(
    new THREE.BoxGeometry(metresToUnits(0.7), metresToUnits(0.55), metresToUnits(0.08)),
    lollipopMat,
  );
  lollipopSign.position.y = metresToUnits(1.2);
  lollipopGroup.add(lollipopSign);
  root.add(lollipopGroup);

  const gunMeshes: THREE.Mesh[] = [];
  for (let i = 0; i < corners.length; i++) {
    const c = corners[i];
    const gunFlash = new THREE.Mesh(
      new THREE.SphereGeometry(metresToUnits(0.18), 8, 8),
      new THREE.MeshStandardMaterial({
        color: "#fde68a",
        emissive: "#fbbf24",
        emissiveIntensity: 0,
        transparent: true,
        opacity: 0,
        toneMapped: false,
      }),
    );
    gunFlash.position.set(c.x * 0.85, metresToUnits(0.35), c.z * 0.75);
    root.add(gunFlash);
    gunMeshes.push(gunFlash);
  }

  return {
    root,
    jackFront,
    jackRear,
    gunMeshes,
    lollipopMat,
    crewGroups,
    cornerGroups,
    gridIndex,
    usesGlb: false,
  };
};

const updateCrewGunning = (crew: THREE.Group, gunning: boolean): void => {
  const parts = crew.userData.gunningParts as
    | {
        leftLeg: THREE.Mesh;
        rightLeg: THREE.Mesh;
        torso: THREE.Mesh;
        leftArm: THREE.Mesh;
        rightArm: THREE.Mesh;
        helmet: THREE.Mesh;
        visor: THREE.Mesh;
      }
    | undefined;
  if (!parts) return;

  const crouch = gunning ? 0.35 : 0.08;
  const armReach = gunning ? 0.55 : 0.15;

  parts.leftLeg.position.y = metresToUnits(0.35 - crouch * 0.2);
  parts.rightLeg.position.y = metresToUnits(0.35 - crouch * 0.2);
  parts.torso.position.y = metresToUnits(0.95 - crouch);
  parts.leftArm.position.set(
    -metresToUnits(0.32),
    metresToUnits(0.95 - crouch),
    metresToUnits(armReach * 0.4),
  );
  parts.leftArm.rotation.x = armReach * 0.9;
  parts.rightArm.position.set(
    metresToUnits(0.32),
    metresToUnits(0.95 - crouch),
    metresToUnits(armReach * 0.4),
  );
  parts.rightArm.rotation.x = armReach * 0.9;
  parts.helmet.position.y = metresToUnits(1.42 - crouch);
  parts.visor.position.y = metresToUnits(1.4 - crouch);
};

export class PitStopCrewField {
  readonly group = new THREE.Group();
  private entries = new Map<string, CrewEntry>();
  private poseScratch = {
    position: new THREE.Vector3(),
    tangent: new THREE.Vector3(),
  };
  private glbTemplate: THREE.Group | null = null;

  constructor() {
    this.group.name = "pit-stop-crew-field";
    for (const meta of FIELD_META) {
      const entry = createPitStopCrew(meta.id);
      this.entries.set(meta.id, entry);
      this.group.add(entry.root);
    }
    void this.tryLoadGlb();
  }

  update(
    camera: THREE.Camera,
    cars: CarState[],
    phase: RacePhase,
    carEntries: Map<string, CarEntryLike>,
  ): void {
    const camPos = camera.position;

    for (const meta of FIELD_META) {
      const car = cars.find((c) => c.id === meta.id);
      const entry = this.entries.get(meta.id);
      if (!car || !entry) continue;

      const show =
        car.isBoxing &&
        (car.pitPhase === "stopped" || car.pitHoldTraffic) &&
        car.pitStopElapsed > 0;

      entry.root.visible = show;
      if (!show) continue;

      const entryMeta = carEntries.get(meta.id);
      const visual = entryMeta?.visual;
      const smoothed = visual ? { ...car, ...visual } : car;
      const pose = sampleCarPose(
        smoothed,
        phase,
        meta.id,
        gridSlotForCar(car),
        this.poseScratch,
      );

      const dist = camPos.distanceTo(pose.position);
      const animating = dist < CREW_ANIM_RANGE;

      entry.root.position.copy(pose.position);
      entry.root.position.y -= metresToUnits(0.02);
      entry.root.rotation.set(0, Math.atan2(pose.tangent.x, pose.tangent.z), 0);

      const gunActive = animating && !car.pitServiceDone && car.pitStopElapsed < 1.5;
      const pulse = gunActive ? 0.55 + 0.45 * Math.sin(performance.now() * 0.04) : 0;

      for (const crew of entry.crewGroups) {
        if (!entry.usesGlb) {
          updateCrewGunning(crew, gunActive);
        }
      }

      for (const mesh of entry.gunMeshes) {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = pulse;
        mat.opacity = gunActive ? 0.95 : 0;
        mat.transparent = true;
      }

      const jackLift =
        car.pitStopElapsed > 0.08 && !car.pitServiceDone ? 1 : car.pitHoldTraffic ? 0.35 : 0;
      const jy = metresToUnits(0.12 + jackLift * 0.22);
      entry.jackFront.position.y = jy;
      entry.jackRear.position.y = jy;

      const go = car.pitServiceDone && !car.pitHoldTraffic;
      entry.lollipopMat.emissive.set(go ? "#22c55e" : "#ef4444");
      entry.lollipopMat.emissiveIntensity = go ? 0.85 : 0.55;
    }
  }

  dispose(): void {
    for (const entry of this.entries.values()) {
      entry.root.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
          const mat = obj.material;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat?.dispose();
        }
      });
    }
    this.entries.clear();
    this.group.clear();
    this.glbTemplate?.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose();
        const mat = obj.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose();
      }
    });
    this.glbTemplate = null;
  }

  private applyGlbTemplate(): void {
    if (!this.glbTemplate) return;

    for (const entry of this.entries.values()) {
      if (entry.usesGlb) continue;

      entry.crewGroups.length = 0;
      for (const cornerGroup of entry.cornerGroups) {
        cornerGroup.clear();
        const clone = this.glbTemplate.clone(true);
        clone.name = "pit-crew-glb";
        cornerGroup.add(clone);
        entry.crewGroups.push(clone);
      }
      entry.usesGlb = true;
    }
  }

  private async tryLoadGlb(): Promise<void> {
    try {
      const res = await fetch(CREW_GLB, { method: "HEAD" });
      if (!res.ok) return;
      const gltf = await new GLTFLoader().loadAsync(CREW_GLB);
      this.glbTemplate = gltf.scene;
      this.glbTemplate.scale.setScalar(metresToUnits(1.8));
      this.applyGlbTemplate();
    } catch {
      /* procedural fallback */
    }
  }
}
