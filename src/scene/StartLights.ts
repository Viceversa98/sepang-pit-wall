import * as THREE from "three";
import { FIA, metresToUnits } from "@/lib/trackCurve";
import { getStartGantryPose } from "@/lib/startGantryPose";
import type { RacePhase } from "@/stores/raceStore";

const HALF = metresToUnits(FIA.trackWidthStartM * 0.55);
const LAMP_X = [-HALF * 0.72, -HALF * 0.36, 0, HALF * 0.36, HALF * 0.72] as const;

type LampEntry = {
  group: THREE.Group;
  sphere: THREE.Mesh;
  light: THREE.PointLight;
  offMaterial: THREE.MeshStandardMaterial;
};

export type StartLightsGroup = THREE.Group & {
  userData: {
    lamps: LampEntry[];
    dispose: () => void;
  };
};

const createLamp = (x: number, beamY: number, lampR: number): LampEntry => {
  const group = new THREE.Group();
  group.position.set(x, beamY - metresToUnits(0.6), metresToUnits(0.65));

  const offMaterial = new THREE.MeshStandardMaterial({
    color: "#1f2937",
    roughness: 0.4,
    metalness: 0.15,
  });

  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(lampR, 20, 20),
    offMaterial,
  );
  group.add(sphere);

  const light = new THREE.PointLight("#ff3030", 0, 40, 2);
  group.add(light);

  return { group, sphere, light, offMaterial };
};

/**
 * FIA-style start gantry above the grid: five reds, green go, then lights out.
 */
export const createStartLights = (): StartLightsGroup => {
  const pose = getStartGantryPose();
  const root = new THREE.Group() as StartLightsGroup;
  root.position.copy(pose.position);
  root.rotation.y = pose.yaw + Math.PI;

  const postH = metresToUnits(9);
  const beamY = metresToUnits(8);
  const lampR = metresToUnits(0.72);
  const postMat = new THREE.MeshStandardMaterial({
    color: "#334155",
    metalness: 0.55,
    roughness: 0.35,
  });
  const beamMat = new THREE.MeshStandardMaterial({
    color: "#1e293b",
    metalness: 0.45,
    roughness: 0.4,
  });
  const housingMat = new THREE.MeshStandardMaterial({
    color: "#0f172a",
    roughness: 0.5,
    metalness: 0.3,
  });

  const postGeo = new THREE.BoxGeometry(
    metresToUnits(0.4),
    postH,
    metresToUnits(0.4),
  );
  const leftPost = new THREE.Mesh(postGeo, postMat);
  leftPost.position.set(-HALF, postH * 0.5, 0);
  leftPost.castShadow = true;
  root.add(leftPost);

  const rightPost = new THREE.Mesh(postGeo, postMat);
  rightPost.position.set(HALF, postH * 0.5, 0);
  rightPost.castShadow = true;
  root.add(rightPost);

  const beam = new THREE.Mesh(
    new THREE.BoxGeometry(HALF * 2.1, metresToUnits(0.5), metresToUnits(1)),
    beamMat,
  );
  beam.position.y = beamY;
  beam.castShadow = true;
  root.add(beam);

  const housing = new THREE.Mesh(
    new THREE.BoxGeometry(HALF * 1.85, metresToUnits(1.35), metresToUnits(0.8)),
    housingMat,
  );
  housing.position.set(0, beamY - metresToUnits(0.6), metresToUnits(0.2));
  root.add(housing);

  const lamps = LAMP_X.map((x) => createLamp(x, beamY, lampR));
  for (const lamp of lamps) root.add(lamp.group);

  root.userData = {
    lamps,
    dispose: () => {
      postGeo.dispose();
      postMat.dispose();
      beamMat.dispose();
      housingMat.dispose();
      for (const lamp of lamps) {
        lamp.sphere.geometry.dispose();
        lamp.offMaterial.dispose();
        if (lamp.sphere.material instanceof THREE.Material && lamp.sphere.material !== lamp.offMaterial) {
          lamp.sphere.material.dispose();
        }
      }
    },
  };

  return root;
};

export const updateStartLights = (
  group: StartLightsGroup,
  phase: RacePhase,
  startLightCount: number,
  startLightsGreen: boolean,
  rainIntensity: number,
): void => {
  // Gantry stays over the grid for the whole race desk session (hidden only on landing).
  const showGantry = phase !== "landing";
  group.visible = showGantry;
  if (!showGantry) return;

  const rainBoost = 1 + rainIntensity * 0.8;

  for (let i = 0; i < group.userData.lamps.length; i++) {
    const lamp = group.userData.lamps[i];
    const redOn = phase === "starting" && !startLightsGreen && i < startLightCount;
    const greenOn = phase === "starting" && startLightsGreen;
    const on = redOn || greenOn;
    const color = greenOn ? "#22ff66" : "#ff2222";

    if (on) {
      const mat = lamp.sphere.material;
      if (!(mat instanceof THREE.MeshBasicMaterial)) {
        if (!Array.isArray(mat)) mat.dispose();
        lamp.sphere.material = new THREE.MeshBasicMaterial({ color, toneMapped: false });
      } else {
        (lamp.sphere.material as THREE.MeshBasicMaterial).color.set(color);
      }
      lamp.light.color.set(greenOn ? "#33ff88" : "#ff3030");
      lamp.light.intensity = 28 * rainBoost;
    } else {
      if (lamp.sphere.material !== lamp.offMaterial) {
        const offMat = lamp.sphere.material;
        if (!Array.isArray(offMat)) offMat.dispose();
        lamp.sphere.material = lamp.offMaterial;
      }
      lamp.light.intensity = 0;
    }
  }
};
