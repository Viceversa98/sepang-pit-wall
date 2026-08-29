import { MIN_HOST_CANVAS_PX } from "@/lib/webglCanvas";

export type RaceLayoutMode = "desktop" | "mobilePortrait" | "mobileLandscape";

export type HostElementSize = {
  width: number;
  height: number;
};

export type HostElementSizeOptions = {
  /** When false, never fall back to visualViewport (avoids full-screen buffers in panels). */
  allowViewportFallback?: boolean;
};

/**
 * Reliable host dimensions for WebGL resize.
 * Prefer layout box (clientWidth/Height) — stable during visualViewport scroll / URL bar shifts.
 */
export const getHostElementSize = (
  host: HTMLElement,
  opts: HostElementSizeOptions = {},
): HostElementSize | null => {
  const allowViewportFallback = opts.allowViewportFallback !== false;

  let width = host.clientWidth;
  let height = host.clientHeight;

  // Absolute inset-0 hosts can read 0 before paint; parent section owns the layout box.
  if (width < MIN_HOST_CANVAS_PX || height < MIN_HOST_CANVAS_PX) {
    const parent = host.parentElement;
    if (parent) {
      width = parent.clientWidth;
      height = parent.clientHeight;
    }
  }

  if (width < MIN_HOST_CANVAS_PX || height < MIN_HOST_CANVAS_PX) {
    const rect = host.getBoundingClientRect();
    width = Math.round(rect.width);
    height = Math.round(rect.height);
  }

  const viewport = window.visualViewport;
  if (
    allowViewportFallback &&
    (width < MIN_HOST_CANVAS_PX || height < MIN_HOST_CANVAS_PX) &&
    viewport
  ) {
    width = Math.round(viewport.width);
    height = Math.round(viewport.height);
  }

  if (width < MIN_HOST_CANVAS_PX || height < MIN_HOST_CANVAS_PX) return null;
  return { width, height };
};

/** Coalesce rapid resize events (visualViewport noise, flex settle) into one rAF. */
export const coalesceHostResize = (callback: () => void): (() => void) => {
  let rafId = 0;
  return () => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      callback();
    });
  };
};

/** Re-run resize after mount — mobile URL bars and flex grids often settle late. */
export const scheduleHostResizeBursts = (callback: () => void): (() => void) => {
  callback();
  requestAnimationFrame(callback);

  const timers = [100, 300, 600, 1000, 2000].map((ms) => window.setTimeout(callback, ms));
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

/** Subscribe to layout mode changes (resize, orientation). */
export const subscribeRaceLayoutMode = (
  callback: (mode: RaceLayoutMode) => void,
): (() => void) => {
  const update = (): void => callback(getRaceLayoutMode());
  update();

  window.addEventListener("resize", update);
  window.addEventListener("orientationchange", update);

  const narrowQuery = window.matchMedia("(max-width: 767px)");
  narrowQuery.addEventListener("change", update);

  return () => {
    window.removeEventListener("resize", update);
    window.removeEventListener("orientationchange", update);
    narrowQuery.removeEventListener("change", update);
  };
};
