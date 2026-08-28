import * as THREE from "three";
import { getHeightmapData, sampleTerrainHeight } from "@/lib/terrainHeight";

export type TerrainBuildResult = {
  mesh: THREE.Mesh;
  dispose: () => void;
};

const SEGMENTS = 128;
/** Full satellite visibility inside this radius (world units ≈ 400 m). */
const ORTHO_CORE_U = 100;
/** Blend ortho → grass between core and this radius (≈ 520 m). */
const ORTHO_FADE_U = 130;

const GRASS_COLOR = new THREE.Color("#1a4d2e");
const GRASS_FAR = new THREE.Color("#143d24");

export { sampleTerrainHeight };

export const buildTerrain = (): TerrainBuildResult => {
  const hm = getHeightmapData();
  const { minX, maxX, minZ, maxZ } = hm.boundsWorld;

  const geo = new THREE.PlaneGeometry(maxX - minX, maxZ - minZ, SEGMENTS, SEGMENTS);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position as THREE.BufferAttribute;
  const orthoUv = new Float32Array(pos.count * 2);
  const worldXZ = new Float32Array(pos.count * 2);

  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i);
    const lz = pos.getZ(i);
    const wx = lx + (minX + maxX) / 2;
    const wz = lz + (minZ + maxZ) / 2;
    const wy = sampleTerrainHeight(wx, wz);
    pos.setXYZ(i, wx, wy, wz);
    orthoUv[i * 2] = (wx - minX) / (maxX - minX);
    orthoUv[i * 2 + 1] = 1 - (wz - minZ) / (maxZ - minZ);
    worldXZ[i * 2] = wx;
    worldXZ[i * 2 + 1] = wz;
  }

  geo.setAttribute("orthoUv", new THREE.BufferAttribute(orthoUv, 2));
  geo.setAttribute("worldXZ", new THREE.BufferAttribute(worldXZ, 2));
  geo.computeVertexNormals();

  const orthoTex = new THREE.TextureLoader().load("/textures/sepang-ortho.webp");
  orthoTex.colorSpace = THREE.SRGBColorSpace;
  orthoTex.anisotropy = 4;

  const material = new THREE.ShaderMaterial({
    uniforms: {
      orthoMap: { value: orthoTex },
      grassColor: { value: GRASS_COLOR },
      grassFar: { value: GRASS_FAR },
      orthoCore: { value: ORTHO_CORE_U },
      orthoFade: { value: ORTHO_FADE_U },
    },
    vertexShader: /* glsl */ `
      attribute vec2 orthoUv;
      attribute vec2 worldXZ;
      varying vec2 vOrthoUv;
      varying vec2 vWorldXZ;
      varying vec3 vNormalW;
      varying float vDist;
      void main() {
        vOrthoUv = orthoUv;
        vWorldXZ = worldXZ;
        vNormalW = normalize(normalMatrix * normal);
        vDist = length(worldXZ);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D orthoMap;
      uniform vec3 grassColor;
      uniform vec3 grassFar;
      uniform float orthoCore;
      uniform float orthoFade;
      varying vec2 vOrthoUv;
      varying vec2 vWorldXZ;
      varying vec3 vNormalW;
      varying float vDist;
      void main() {
        vec3 ortho = texture2D(orthoMap, vOrthoUv).rgb;
        float n = fract(sin(dot(vWorldXZ, vec2(12.9898, 78.233))) * 43758.5453);
        vec3 grass = mix(grassColor, grassFar, n * 0.35);
        float blend = 1.0 - smoothstep(orthoCore, orthoFade, vDist);
        vec3 col = mix(grass, ortho, blend);
        float shade = 0.88 + 0.12 * vNormalW.y;
        gl_FragColor = vec4(col * shade, 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, material);
  mesh.name = "sepang-terrain";
  mesh.receiveShadow = true;

  return {
    mesh,
    dispose: () => {
      geo.dispose();
      material.dispose();
      orthoTex.dispose();
    },
  };
};
