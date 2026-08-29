<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { addFrameRenderer } from "@/lib/frameLoop";
  import { RaceScene } from "@/scene/RaceScene";

  let hostEl: HTMLDivElement | undefined = $state();
  let raceScene: RaceScene | null = null;
  let removeRenderer: (() => void) | null = null;

  onMount(() => {
    if (!hostEl) return;

    raceScene = new RaceScene();
    raceScene.init(hostEl);

    // Rendered from the shared frame loop, right after the sim tick, so every
    // frame draws this frame's sim state (a second rAF loop rendered stale
    // state on ~1/3 of frames — the caterpillar motion).
    removeRenderer = addFrameRenderer((dt) => raceScene?.update(dt));

    const canvas = hostEl.querySelector("canvas");
    const onLost = (event: Event): void => {
      event.preventDefault();
      raceScene?.dispose();
      raceScene = new RaceScene();
      raceScene.init(hostEl!);
    };
    canvas?.addEventListener("webglcontextlost", onLost, false);

    const onResize = (): void => raceScene?.resize();
    window.addEventListener("resize", onResize);

    return () => {
      canvas?.removeEventListener("webglcontextlost", onLost);
      window.removeEventListener("resize", onResize);
    };
  });

  onDestroy(() => {
    removeRenderer?.();
    removeRenderer = null;
    raceScene?.dispose();
    raceScene = null;
  });
</script>

<div
  bind:this={hostEl}
  class="h-full min-h-[280px] w-full overflow-hidden bg-[var(--background)]"
></div>
