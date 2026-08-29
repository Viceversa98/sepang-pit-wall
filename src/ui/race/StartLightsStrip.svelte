<script lang="ts">
  import { useRaceStore } from "@/stores/raceStore";

  const LAMP_COUNT = 5;

  let race = $state(useRaceStore.getState());

  $effect(() => {
    return useRaceStore.subscribe((s) => {
      race = s;
    });
  });

  const visible = $derived(
    race.phase === "ready" ||
      race.phase === "starting" ||
      race.startLightsOut,
  );

  const label = $derived(
    race.phase === "ready"
      ? "Grid ready"
      : race.startLightsOut
        ? "Lights out"
        : race.startLightsGreen
          ? "Go"
          : race.startLightCount === 0
            ? "Grid set"
            : `Lights ${race.startLightCount}/${LAMP_COUNT}`,
  );
</script>

{#if visible}
  <div
    class="flex items-center justify-center gap-1.5 rounded-sm border border-white/15 bg-black/60 px-2 py-1"
    role="status"
    aria-live="polite"
    aria-label={label}
  >
    {#each Array.from({ length: LAMP_COUNT }, (_, i) => i) as i (i)}
      {@const redOn =
        race.phase === "starting" && !race.startLightsGreen && i < race.startLightCount}
      {@const greenOn = race.phase === "starting" && race.startLightsGreen}
      {@const lit = redOn || greenOn}
      {@const color = greenOn ? "bg-emerald-400" : lit ? "bg-red-500" : "bg-slate-800"}
      {@const glow = greenOn
        ? "shadow-[0_0_12px_rgba(52,211,153,0.9)]"
        : lit
          ? "shadow-[0_0_12px_rgba(239,68,68,0.9)]"
          : "shadow-inner"}
      <div
        class="size-4 rounded-full border border-white/20 {color} {glow}"
        aria-hidden="true"
      ></div>
    {/each}
    <span class="sr-only">{label}</span>
  </div>
{/if}
