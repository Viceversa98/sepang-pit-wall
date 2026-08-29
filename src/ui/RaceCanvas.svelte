<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { addFrameRenderer } from "@/lib/frameLoop";
  import {
    scheduleHostResizeBursts,
    subscribeRaceLayoutMode,
  } from "@/lib/viewportLayout";
  import { RaceScene } from "@/scene/RaceScene";
  import { useRaceStore } from "@/stores/raceStore";

  let hostEl: HTMLDivElement | undefined = $state();
  let raceScene: RaceScene | null = null;
  let removeRenderer: (() => void) | null = null;
  let cameraMode = $state(useRaceStore.getState().cameraMode);
  let showBraveWebGlHint = $state(false);

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

    const stopBurstResize = scheduleHostResizeBursts(scheduleResize);

    const resizeObserver = new ResizeObserver(() => scheduleResize());
    resizeObserver.observe(hostEl);

    const stopLayout = subscribeRaceLayoutMode(() => scheduleResize());

    window.addEventListener("resize", scheduleResize);
    window.visualViewport?.addEventListener("resize", scheduleResize);
    window.visualViewport?.addEventListener("scroll", scheduleResize);

    void (async () => {
      const nav = navigator as Navigator & {
        brave?: { isBrave?: () => Promise<boolean> };
      };
      if (typeof nav.brave?.isBrave !== "function") return;
      try {
        if (await nav.brave.isBrave()) showBraveWebGlHint = true;
      } catch {
        /* ignore */
      }
    })();

    return () => {
      canvas?.removeEventListener("webglcontextlost", onLost);
      stopBurstResize();
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

  const handleDismissBraveHint = (): void => {
    showBraveWebGlHint = false;
  };
</script>

<div
  bind:this={hostEl}
  class="absolute inset-0 z-0 min-h-[200px] w-full overflow-hidden bg-[var(--background)] [&>canvas]:block"
></div>

{#if showBraveWebGlHint}
  <div
    class="pointer-events-auto absolute inset-x-2 bottom-2 z-10 rounded-sm border border-amber-400/35 bg-amber-950/90 px-3 py-2 font-mono text-[10px] leading-snug text-amber-100/95 shadow-lg md:inset-x-auto md:right-3 md:bottom-3 md:max-w-xs md:text-[11px]"
    role="status"
  >
    <p>
      Brave Shields can scramble WebGL and squash the track. Tap the lion icon in the URL bar and
      turn Shields off for this site, then refresh.
    </p>
    <button
      type="button"
      class="mt-2 text-[10px] tracking-wide text-amber-300 uppercase underline underline-offset-2"
      aria-label="Dismiss Brave WebGL hint"
      onclick={handleDismissBraveHint}
    >
      Dismiss
    </button>
  </div>
{/if}
