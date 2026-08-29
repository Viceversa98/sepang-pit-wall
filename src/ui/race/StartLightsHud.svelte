<script lang="ts">
  import { useRaceStore } from "@/stores/raceStore";
  import type { RaceLayoutMode } from "@/lib/viewportLayout";
  import { isMobileRaceLayout } from "@/lib/viewportLayout";

  type Props = {
    layoutMode?: RaceLayoutMode;
  };

  let { layoutMode = "desktop" }: Props = $props();

  const LAMP_COUNT = 5;

  let race = $state(useRaceStore.getState());

  $effect(() => {
    return useRaceStore.subscribe((s) => {
      race = s;
    });
  });

  const visible = $derived(
    (race.phase === "ready" || race.phase === "starting" || race.startLightsOut) &&
      race.cameraMode !== "follow",
  );

  const label = $derived(
    race.phase === "ready"
      ? "GRID READY"
      : race.startLightsOut
        ? "LIGHTS OUT"
        : race.startLightsGreen
          ? "GO"
          : race.startLightCount === 0
            ? "GRID SET"
            : `LIGHTS ${race.startLightCount}/${LAMP_COUNT}`,
  );

  const labelClass = $derived(
    race.phase === "ready"
      ? "text-amber-200"
      : race.startLightsOut
        ? "text-amber-300"
        : race.startLightsGreen
          ? "text-emerald-300"
          : "text-red-200",
  );
  const mobile = $derived(isMobileRaceLayout(layoutMode));

  const topOffset = $derived(
    mobile && layoutMode === "mobilePortrait" ? "top-[28%]" : mobile ? "top-[14%]" : "top-[18%]",
  );
</script>

{#if visible}
  <div
    class="pointer-events-none absolute inset-x-0 z-20 flex flex-col items-center gap-2 {topOffset} md:gap-4"
    role="status"
    aria-live="polite"
    aria-label={label}
  >
    <div
      class="flex items-center gap-2 rounded-md border border-white/15 bg-black/70 px-4 py-3 shadow-lg backdrop-blur-md md:gap-4 md:px-8 md:py-5"
    >
      {#each Array.from({ length: LAMP_COUNT }, (_, i) => i) as i (i)}
        {@const redOn =
          race.phase === "starting" && !race.startLightsGreen && i < race.startLightCount}
        {@const greenOn = race.phase === "starting" && race.startLightsGreen}
        {@const lit = redOn || greenOn}
        {@const color = greenOn ? "bg-emerald-400" : lit ? "bg-red-500" : "bg-slate-800"}
        {@const glow = greenOn
          ? "shadow-[0_0_28px_rgba(52,211,153,0.95)]"
          : lit
            ? "shadow-[0_0_28px_rgba(239,68,68,0.95)]"
            : "shadow-inner"}
        <div class="h-9 w-9 rounded-full border border-white/20 md:h-14 md:w-14 {color} {glow}"></div>
      {/each}
    </div>
    <p class="font-display text-lg tracking-[0.28em] md:text-3xl md:tracking-[0.35em] {labelClass} {mobile ? 'hidden md:block' : ''}">
      {label}
    </p>
  </div>
{/if}
