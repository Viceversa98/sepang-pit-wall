<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { RaceScene } from "@/scene/RaceScene";

  let hostEl: HTMLDivElement | undefined = $state();
  let raceScene: RaceScene | null = null;
  let frameId = 0;
  let lastTime = 0;

  onMount(() => {
    if (!hostEl) return;

    raceScene = new RaceScene();
    raceScene.init(hostEl);
    lastTime = performance.now();

    const loop = (now: number): void => {
      if (!raceScene) return;
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      raceScene.update(dt);
      frameId = requestAnimationFrame(loop);
    };
    frameId = requestAnimationFrame(loop);

    const canvas = hostEl.querySelector("canvas");
    const onLost = (event: Event): void => {
      event.preventDefault();
      cancelAnimationFrame(frameId);
      raceScene?.dispose();
      raceScene = new RaceScene();
      raceScene.init(hostEl!);
      lastTime = performance.now();
      frameId = requestAnimationFrame(loop);
    };
    canvas?.addEventListener("webglcontextlost", onLost, false);

    const onResize = (): void => raceScene?.resize();
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(frameId);
      canvas?.removeEventListener("webglcontextlost", onLost);
      window.removeEventListener("resize", onResize);
    };
  });

  onDestroy(() => {
    cancelAnimationFrame(frameId);
    raceScene?.dispose();
    raceScene = null;
  });
</script>

<div
  bind:this={hostEl}
  class="h-full min-h-[280px] w-full overflow-hidden bg-[var(--background)]"
></div>
