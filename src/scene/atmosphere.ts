import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";

export type AtmosphereHandle = {
  sky: Sky;
  sun: THREE.Vector3;
  updateRain: (rainIntensity: number) => void;
  dispose: () => void;
};

/** Sepang afternoon sun — high tropical elevation, NW azimuth. */
const BASE_SUN = new THREE.Vector3(0.55, 0.82, 0.18).normalize();

export const createAtmosphere = (
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  rainIntensity: number,
): AtmosphereHandle => {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const sky = new Sky();
  sky.scale.setScalar(450000);
  scene.add(sky);

  const sun = BASE_SUN.clone();
  const uniforms = sky.material.uniforms;
  uniforms.turbidity.value = 4;
  uniforms.rayleigh.value = 1.2;
  uniforms.mieCoefficient.value = 0.004;
  uniforms.mieDirectionalG.value = 0.82;
  uniforms.sunPosition.value.copy(sun);

  scene.fog = new THREE.FogExp2("#8aa4c4", 0.0018);

  const applyRain = (rain: number) => {
    const damp = 1 - rain * 0.55;
    uniforms.turbidity.value = 4 + rain * 8;
    uniforms.rayleigh.value = 1.2 - rain * 0.5;
    uniforms.mieCoefficient.value = 0.004 + rain * 0.012;
    sun.copy(BASE_SUN).multiplyScalar(damp);
    uniforms.sunPosition.value.copy(sun);

    const fog = scene.fog as THREE.FogExp2;
    const r = Math.round(138 - rain * 40);
    const g = Math.round(164 - rain * 50);
    const b = Math.round(196 - rain * 30);
    fog.color.setRGB(r / 255, g / 255, b / 255);
    fog.density = 0.0018 + rain * 0.0045;
  };

  applyRain(rainIntensity);

  return {
    sky,
    sun,
    updateRain: applyRain,
    dispose: () => {
      scene.remove(sky);
      sky.geometry.dispose();
      (sky.material as THREE.Material).dispose();
      scene.fog = null;
    },
  };
};

export const sunDirectionalPosition = (sun: THREE.Vector3, distance = 120): THREE.Vector3 =>
  sun.clone().multiplyScalar(distance);

export const sunLightColor = (rainIntensity: number): THREE.Color => {
  const warm = new THREE.Color("#fff4e6");
  const cool = new THREE.Color("#c8d8f0");
  return warm.lerp(cool, rainIntensity * 0.65);
};

export const fillLightColor = (rainIntensity: number): THREE.Color => {
  const sky = new THREE.Color("#7dd3fc");
  const grey = new THREE.Color("#94a3b8");
  return sky.lerp(grey, rainIntensity * 0.5);
};
