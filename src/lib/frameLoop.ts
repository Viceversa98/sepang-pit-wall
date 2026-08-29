/**
 * Single main-thread frame loop. The sim tick (RaceDirector) and all
 * renderers run in ONE requestAnimationFrame callback with the same dt.
 * Two separate self-re-registering rAF loops gave no ordering guarantee, so
 * renders regularly sampled stale sim state — measured as ~33% of frames
 * showing zero car movement (the "caterpillar").
 */
type FrameCallback = (dt: number) => void;

const renderers = new Set<FrameCallback>();

/** Register a renderer to run after the sim tick each frame. Returns unsubscribe. */
export const addFrameRenderer = (cb: FrameCallback): (() => void) => {
  renderers.add(cb);
  return () => renderers.delete(cb);
};

export const runFrameRenderers = (dt: number): void => {
  for (const cb of renderers) cb(dt);
};
