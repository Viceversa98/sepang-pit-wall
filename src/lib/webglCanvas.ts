/** Ignore resize until the host has a real painted box (mobile flex/grid settle). */
export const MIN_HOST_CANVAS_PX = 10;

/** Full-screen race canvas — pixel size owned by renderer.setSize(..., true). */
export const attachOverlayWebGlCanvas = (canvas: HTMLCanvasElement, host: HTMLElement): void => {
  host.appendChild(canvas);
  canvas.style.position = "absolute";
  canvas.style.top = "0";
  canvas.style.left = "0";
  canvas.style.display = "block";
  canvas.style.outline = "none";
  canvas.style.touchAction = "none";
};

/** In-flow canvas for bounded panels (landing showroom) — must not use absolute positioning. */
export const attachContainedWebGlCanvas = (canvas: HTMLCanvasElement, host: HTMLElement): void => {
  host.appendChild(canvas);
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.outline = "none";
  canvas.style.touchAction = "none";
};

/** @deprecated use attachOverlayWebGlCanvas or attachContainedWebGlCanvas */
export const attachWebGlCanvas = attachOverlayWebGlCanvas;
