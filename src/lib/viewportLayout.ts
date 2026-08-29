export type RaceLayoutMode = "desktop" | "mobilePortrait" | "mobileLandscape";

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
