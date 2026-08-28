<script lang="ts">
  import { buildTrackMapLayout, progressToMap } from "@/lib/trackMap2d";
  import { FIELD_META, useRaceStore } from "@/stores/raceStore";

  let race = $state(useRaceStore.getState());
  const layout = buildTrackMapLayout();

  $effect(() => {
    return useRaceStore.subscribe((s) => {
      race = s;
    });
  });

  const pathD = $derived(
    layout.path
      .map((p, i) => `${i === 0 ? "M" : "L"} ${(p.x * 100).toFixed(2)} ${(p.y * 100).toFixed(2)}`)
      .join(" "),
  );

  const drsD = $derived(
    layout.drsPath
      .map((p, i) => `${i === 0 ? "M" : "L"} ${(p.x * 100).toFixed(2)} ${(p.y * 100).toFixed(2)}`)
      .join(" "),
  );

  const carDots = $derived(
    race.cars.map((car) => {
      const meta = FIELD_META.find((m) => m.id === car.id);
      const pos = progressToMap(car.lapProgress);
      return {
        id: car.id,
        x: pos.x * 100,
        y: pos.y * 100,
        color: meta?.color ?? "#fff",
        isPlayer: car.isPlayer,
      };
    }),
  );
</script>

<div
  class="rounded-sm border border-white/10 bg-[#0a1628]/90 p-1.5"
  aria-label="Sepang circuit map"
>
  <p class="mb-1 font-mono text-[8px] tracking-[0.18em] text-cyan-200/70 uppercase">Track</p>
  <svg
    viewBox="0 0 100 100"
    class="mx-auto block h-auto w-full max-w-[200px]"
    role="img"
    aria-label="Sepang International Circuit minimap with live car positions"
  >
    <rect width="100" height="100" fill="#0a1628" rx="1" />
    <path
      d={drsD}
      fill="none"
      stroke="#22d3ee"
      stroke-width="2.8"
      stroke-dasharray="3 2"
      stroke-linecap="round"
      opacity="0.75"
    />
    <path
      d={pathD}
      fill="none"
      stroke="#475569"
      stroke-width="3.2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <path
      d={pathD}
      fill="none"
      stroke="#64748b"
      stroke-width="5.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      opacity="0.25"
    />
    {#each layout.turns as turn (turn.label)}
      <text
        x={turn.x * 100}
        y={turn.y * 100}
        text-anchor="middle"
        dominant-baseline="middle"
        fill="#94a3b8"
        font-size="3.2"
        font-family="ui-monospace, monospace"
        opacity="0.85"
      >
        {turn.label}
      </text>
    {/each}
    <circle
      cx={layout.startFinish.x * 100}
      cy={layout.startFinish.y * 100}
      r="1.8"
      fill="#f8fafc"
      stroke="#0a1628"
      stroke-width="0.4"
    />
    <circle
      cx={layout.pitEntry.x * 100}
      cy={layout.pitEntry.y * 100}
      r="1.2"
      fill="#facc15"
      opacity="0.9"
    />
    {#each carDots as dot (dot.id)}
      <circle
        cx={dot.x}
        cy={dot.y}
        r={dot.isPlayer ? 2.2 : 1.5}
        fill={dot.color}
        stroke={dot.isPlayer ? "#fff" : "#0a1628"}
        stroke-width={dot.isPlayer ? 0.6 : 0.35}
      />
    {/each}
  </svg>
  <p class="mt-1 font-mono text-[7px] text-white/35">DRS · pit ● · S/F ○</p>
</div>
