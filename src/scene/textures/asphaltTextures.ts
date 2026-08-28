import * as THREE from "three";

const makeCanvas = (size: number): HTMLCanvasElement | OffscreenCanvas => {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(size, size);
  }
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  return c;
};

/** Procedural asphalt albedo + normal for track ribbons. */
export const createAsphaltTextures = (): {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
} => {
  const size = 256;
  const canvas = makeCanvas(size);
  const ctx = (canvas as HTMLCanvasElement).getContext?.("2d") as CanvasRenderingContext2D;
  if (!ctx) {
    const fallback = new THREE.CanvasTexture(document.createElement("canvas"));
    return { map: fallback, normalMap: fallback };
  }

  ctx.fillStyle = "#3d4654";
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 1200; i++) {
    const g = 48 + Math.floor(Math.random() * 28);
    ctx.fillStyle = `rgb(${g},${g + 2},${g + 6})`;
    const w = 1 + Math.random() * 3;
    const h = 1 + Math.random() * 3;
    ctx.fillRect(Math.random() * size, Math.random() * size, w, h);
  }

  for (let i = 0; i < 80; i++) {
    ctx.strokeStyle = `rgba(255,255,255,${0.02 + Math.random() * 0.04})`;
    ctx.lineWidth = 0.5 + Math.random();
    ctx.beginPath();
    ctx.moveTo(Math.random() * size, Math.random() * size);
    ctx.lineTo(Math.random() * size, Math.random() * size);
    ctx.stroke();
  }

  const map = new THREE.CanvasTexture(canvas as HTMLCanvasElement);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;

  const nCanvas = makeCanvas(size);
  const nctx = (nCanvas as HTMLCanvasElement).getContext?.("2d") as CanvasRenderingContext2D;
  nctx.fillStyle = "#8080ff";
  nctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 600; i++) {
    const v = 120 + Math.floor(Math.random() * 30);
    nctx.fillStyle = `rgb(${v},${v},255)`;
    nctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }

  const normalMap = new THREE.CanvasTexture(nCanvas as HTMLCanvasElement);
  normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;

  return { map, normalMap };
};

/** Red/white kerb stripe lookup in V (metres along curb). */
export const kerbStripeColor = (metresAlong: number): { color: string; emissive: string } => {
  const period = 1.2;
  const phase = ((metresAlong % period) + period) % period;
  const isWhite = phase < period * 0.5;
  return isWhite
    ? { color: "#f8fafc", emissive: "#e2e8f0" }
    : { color: "#ef4444", emissive: "#000000" };
};
