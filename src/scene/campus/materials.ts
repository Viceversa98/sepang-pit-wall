import * as THREE from "three";

/** Palette tuned from Sepang orthophoto — concrete, tropical canopy, humid grass. */
export const CAMPUS_COLOR = {
  concrete: "#9ca3af",
  concreteDark: "#6b7280",
  concreteWarm: "#a8a29e",
  glass: "#60a5fa",
  canopy: "#dc2626",
  roof: "#374151",
  roofDark: "#1f2937",
  accent: "#f59e0b",
  grass: "#1a4d2e",
  grassDry: "#3d5c34",
  asphalt: "#374151",
} as const;

export const createConcrete = (color: string = CAMPUS_COLOR.concrete): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({
    color,
    roughness: 0.78,
    metalness: 0.06,
  });

export const createGlass = (): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({
    color: CAMPUS_COLOR.glass,
    roughness: 0.08,
    metalness: 0.42,
    transparent: true,
    opacity: 0.52,
  });

export const createRoof = (): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({
    color: CAMPUS_COLOR.roof,
    roughness: 0.68,
    metalness: 0.18,
  });
