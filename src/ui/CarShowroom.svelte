<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { scheduleHostResizeBursts } from "@/lib/viewportLayout";
  import { ShowroomScene } from "@/scene/ShowroomScene";

  let hostEl: HTMLDivElement | undefined = $state();
  let showroom: ShowroomScene | null = null;

  onMount(() => {
    if (!hostEl) return;
    showroom = new ShowroomScene();
    showroom.init(hostEl);

    const onResize = (): void => showroom?.resize();
    const stopBurstResize = scheduleHostResizeBursts(onResize);

    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(hostEl);

    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);

    return () => {
      stopBurstResize();
      resizeObserver.disconnect();
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
    };
  });

  onDestroy(() => {
    showroom?.dispose();
    showroom = null;
  });
</script>

<div bind:this={hostEl} class="relative h-full w-full min-h-[220px] overflow-hidden"></div>
