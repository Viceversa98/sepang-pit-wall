<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { addFrameRenderer } from "@/lib/frameLoop";
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
    };
    canvas?.addEventListener("webglcontextlost", onLost, false);

    const onResize = (): void => raceScene?.resize();
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);

    return () => {
      canvas?.removeEventListener("webglcontextlost", onLost);
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
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
  class="h-full min-h-[280px] w-full overflow-hidden bg-[var(--background)] [&>canvas]:h-full [&>canvas]:w-full"
></div>
