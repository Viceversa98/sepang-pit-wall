/** Ignore resize until the host has a real painted box (mobile flex/grid settle). */
export const MIN_HOST_CANVAS_PX = 10;

/** Decouple WebGL canvas from flex/grid — parent sets size, canvas fills without pushing layout. */
export const attachOverlayWebGlCanvas = (canvas: HTMLCanvasElement, host: HTMLElement): void => {
  host.appendChild(canvas);
  canvas.style.position = "absolute";
  canvas.style.inset = "0";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
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
