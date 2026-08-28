<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { ShowroomScene } from "@/scene/ShowroomScene";

  let hostEl: HTMLDivElement | undefined = $state();
  let showroom: ShowroomScene | null = null;

  onMount(() => {
    if (!hostEl) return;
    showroom = new ShowroomScene();
    showroom.init(hostEl);

    const onResize = (): void => showroom?.resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  });

  onDestroy(() => {
    showroom?.dispose();
    showroom = null;
  });
</script>

<div bind:this={hostEl} class="h-full w-full min-h-[220px]"></div>
