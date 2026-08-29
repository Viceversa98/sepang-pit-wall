import { MIN_HOST_CANVAS_PX } from "@/lib/webglCanvas";

export type RaceLayoutMode = "desktop" | "mobilePortrait" | "mobileLandscape";

export type HostElementSize = {
  width: number;
  height: number;
};

/** Reliable host dimensions for WebGL resize (handles mobile dynamic viewport + flex settle). */
export const getHostElementSize = (host: HTMLElement): HostElementSize | null => {
  const rect = host.getBoundingClientRect();
  let width = Math.round(rect.width);
  let height = Math.round(rect.height);

  if (width < MIN_HOST_CANVAS_PX || height < MIN_HOST_CANVAS_PX) {
    width = host.clientWidth;
    height = host.clientHeight;
  }

  const viewport = window.visualViewport;
  if ((width < MIN_HOST_CANVAS_PX || height < MIN_HOST_CANVAS_PX) && viewport) {
    width = Math.round(viewport.width);
    height = Math.round(viewport.height);
  }

  if (width < MIN_HOST_CANVAS_PX || height < MIN_HOST_CANVAS_PX) return null;
  return { width, height };
};

/** Re-run resize after mount — mobile URL bars and flex grids often settle late. */
export const scheduleHostResizeBursts = (callback: () => void): (() => void) => {
  callback();
  requestAnimationFrame(callback);

  const timers = [100, 300, 600, 1000].map((ms) => window.setTimeout(callback, ms));
  return () => {
    for (const id of timers) window.clearTimeout(id);
  };
};

export const getRaceLayoutMode = (): RaceLayoutMode => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (w >= 768) return "desktop";
  return w > h ? "mobileLandscape" : "mobilePortrait";
};

export const isMobileRaceLayout = (mode: RaceLayoutMode): boolean =>
  mode === "mobilePortrait" || mode === "mobileLandscape";

/** Subscribe to layout mode changes (resize, orientation, visualViewport). */
export const subscribeRaceLayoutMode = (
  callback: (mode: RaceLayoutMode) => void,
): (() => void) => {
  const update = (): void => callback(getRaceLayoutMode());
  update();

  window.addEventListener("resize", update);
  window.addEventListener("orientationchange", update);

  const viewport = window.visualViewport;
  viewport?.addEventListener("resize", update);

  const narrowQuery = window.matchMedia("(max-width: 767px)");
  narrowQuery.addEventListener("change", update);

  return () => {
    window.removeEventListener("resize", update);
    window.removeEventListener("orientationchange", update);
    viewport?.removeEventListener("resize", update);
    narrowQuery.removeEventListener("change", update);
  };
};
