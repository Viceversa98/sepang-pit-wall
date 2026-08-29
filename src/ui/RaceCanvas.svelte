<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { addFrameRenderer } from "@/lib/frameLoop";
  import { subscribeRaceLayoutMode } from "@/lib/viewportLayout";
  import { RaceScene } from "@/scene/RaceScene";
  import { useRaceStore } from "@/stores/raceStore";

  let hostEl: HTMLDivElement | undefined = $state();
  let raceScene: RaceScene | null = null;
  let removeRenderer: (() => void) | null = null;
  let cameraMode = $state(useRaceStore.getState().cameraMode);

  $effect(() => {
    return useRaceStore.subscribe((s) => {
      cameraMode = s.cameraMode;
    });
  });

  $effect(() => {
    const canvas = hostEl?.querySelector("canvas");
    if (!canvas) return;
    canvas.style.touchAction = cameraMode === "overview" ? "none" : "manipulation";
  });

  onMount(() => {
    if (!hostEl) return;

    raceScene = new RaceScene();
    raceScene.init(hostEl);

    removeRenderer = addFrameRenderer((dt) => raceScene?.update(dt));

    const canvas = hostEl.querySelector("canvas");
    const onLost = (event: Event): void => {
      event.preventDefault();
      raceScene?.dispose();
      raceScene = new RaceScene();
      raceScene.init(hostEl!);
      scheduleResize();
    };
    canvas?.addEventListener("webglcontextlost", onLost, false);

    const scheduleResize = (): void => {
      raceScene?.resize();
      requestAnimationFrame(() => raceScene?.resize());
    };

    scheduleResize();

    const resizeObserver = new ResizeObserver(() => scheduleResize());
    resizeObserver.observe(hostEl);

    const stopLayout = subscribeRaceLayoutMode(() => scheduleResize());

    window.addEventListener("resize", scheduleResize);
    window.visualViewport?.addEventListener("resize", scheduleResize);
    window.visualViewport?.addEventListener("scroll", scheduleResize);

    return () => {
      canvas?.removeEventListener("webglcontextlost", onLost);
      resizeObserver.disconnect();
      stopLayout();
      window.removeEventListener("resize", scheduleResize);
      window.visualViewport?.removeEventListener("resize", scheduleResize);
      window.visualViewport?.removeEventListener("scroll", scheduleResize);
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
  class="absolute inset-0 z-0 min-h-[200px] w-full overflow-hidden bg-[var(--background)] [&>canvas]:block [&>canvas]:h-full [&>canvas]:w-full"
></div>
