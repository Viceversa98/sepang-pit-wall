<script lang="ts">
  import { sampleCarPose } from "@/lib/carPose";
  import { getLiveRaceCars } from "@/lib/raceLiveCars";
  import { buildTrackMapLayout, worldXZToMap } from "@/lib/trackMap2d";
  import { gridSlotForCar, useRaceStore } from "@/stores/raceStore";

  type Props = {
    compact?: boolean;
  };

  let { compact = false }: Props = $props();
  let race = $state(useRaceStore.getState());
  let liveCars = $state(getLiveRaceCars());
  const layout = buildTrackMapLayout();

  $effect(() => {
    return useRaceStore.subscribe((s) => {
      race = s;
    });
  });

  $effect(() => {
    liveCars = getLiveRaceCars();
    const id = window.setInterval(() => {
      liveCars = getLiveRaceCars();
    }, 100);
    return () => window.clearInterval(id);
  });

  const toD = (pts: { x: number; y: number }[]) =>
    pts
      .map(
        (p, i) =>
          `${i === 0 ? "M" : "L"} ${(p.x * 100).toFixed(2)} ${(p.y * 100).toFixed(2)}`,
      )
      .join(" ");

  const pathD = $derived(toD(layout.path));
  const pitD = $derived(toD(layout.pitPath));
  const drsDs = $derived(layout.drsPaths.map((p) => toD(p)));

  const vb = $derived(layout.viewBox);
  const viewBox = $derived(
    `${(vb.minX * 100).toFixed(1)} ${(vb.minY * 100).toFixed(1)} ${(vb.width * 100).toFixed(1)} ${(vb.height * 100).toFixed(1)}`,
  );

  const carDots = $derived(
    liveCars.map((car) => {
      const gridIndex = gridSlotForCar(car);
      const pose = sampleCarPose(car, race.phase, car.id, gridIndex);
      const pos = worldXZToMap(pose.position.x, pose.position.z);
      return {
        id: car.id,
        x: pos.x * 100,
        y: pos.y * 100,
        color: car.color,
        isPlayer: car.isPlayer,
        retired: car.status === "retired",
      };
    }),
  );

  const sf = $derived(layout.startFinish);
</script>

<div
  class="track-map {compact ? 'track-map--compact' : ''}"
  aria-label="Sepang circuit map"
>
  {#if !compact}
    <p class="track-map__title">Sepang International Circuit</p>
  {/if}
  <svg
    viewBox={viewBox}
    class="track-map__svg"
    role="img"
    aria-label="Sepang International Circuit map with turn names and live cars"
  >
    {#if !compact}
      <g
        class="track-map__north"
        transform="translate({(vb.minX + 0.08) * 100}, {(vb.minY + 0.1) * 100})"
      >
        <line x1="0" y1="4" x2="0" y2="-5" stroke="currentColor" stroke-width="0.7" />
        <polygon points="0,-6.2 -1.6,-2.2 1.6,-2.2" fill="currentColor" />
        <text
          x="0"
          y="7.2"
          text-anchor="middle"
          fill="currentColor"
          font-size="3.2"
          font-family="ui-monospace, monospace">N</text
        >
      </g>
    {/if}

    <path
      class="track-map__pit"
      d={pitD}
      fill="none"
      stroke-width="1.15"
      stroke-linecap="round"
      stroke-linejoin="round"
    />

    <path
      class="track-map__asphalt"
      d={pathD}
      fill="none"
      stroke-width="5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <path
      class="track-map__line"
      d={pathD}
      fill="none"
      stroke-width="2.4"
      stroke-linecap="round"
      stroke-linejoin="round"
    />

    {#each drsDs as d}
      <path
        class="track-map__drs"
        d={d}
        fill="none"
        stroke-width="2.1"
        stroke-linecap="round"
      />
    {/each}

    {#if !compact}
      {#each layout.straights as s (s.name)}
        <text
          class="track-map__straight"
          x={s.x * 100}
          y={s.y * 100}
          text-anchor="middle"
          dominant-baseline="middle"
          font-size="2.55"
          font-family="ui-monospace, monospace">{s.name}</text
        >
      {/each}
    {/if}

    {#each layout.turns as turn (turn.n)}
      <text
        class="track-map__turn-n"
        x={turn.lx * 100}
        y={turn.ly * 100}
        text-anchor="middle"
        dominant-baseline="middle"
        font-size={compact ? "2.8" : "3.1"}
        font-weight="700"
        font-family="ui-monospace, monospace">{turn.label}</text
      >
      {#if !compact && turn.name}
        <text
          class="track-map__turn-name"
          x={turn.lx * 100}
          y={turn.ly * 100 + 3.4}
          text-anchor="middle"
          dominant-baseline="hanging"
          font-size="2.1"
          font-family="ui-monospace, monospace">{turn.name}</text
        >
      {/if}
    {/each}

    <g transform="translate({sf.x * 100}, {sf.y * 100})">
      <rect class="track-map__sf-a" x="-2.2" y="-2.2" width="2.2" height="2.2" />
      <rect class="track-map__sf-b" x="0" y="-2.2" width="2.2" height="2.2" />
      <rect class="track-map__sf-b" x="-2.2" y="0" width="2.2" height="2.2" />
      <rect class="track-map__sf-a" x="0" y="0" width="2.2" height="2.2" />
      {#if !compact}
        <text
          class="track-map__sf-label"
          x="0"
          y="6.2"
          text-anchor="middle"
          font-size="2.2"
          font-family="ui-monospace, monospace">Start/finish</text
        >
      {/if}
    </g>

    {#each carDots as dot (dot.id)}
      <circle
        cx={dot.x}
        cy={dot.y}
        r={dot.isPlayer ? 2.1 : 1.35}
        fill={dot.color}
        class={dot.isPlayer
          ? "track-map__car track-map__car--player"
          : dot.retired
            ? "track-map__car track-map__car--retired"
            : "track-map__car"}
        opacity={dot.retired ? 0.55 : 1}
      />
    {/each}
  </svg>
  {#if !compact}
    <p class="track-map__legend">Pit · DRS · S/F</p>
  {/if}
</div>

<style>
  /* Dual-theme: readable on dark HUD and light panels — no pure white track. */
  .track-map {
    --map-bg: color-mix(in srgb, #0f172a 88%, transparent);
    --map-border: color-mix(in srgb, #64748b 35%, transparent);
    --map-title: #94a3b8;
    --map-muted: #64748b;
    --map-label: #cbd5e1;
    --map-asphalt: #334155;
    --map-line: #38bdf8;
    --map-pit: #94a3b8;
    --map-drs: #2dd4bf;
    --map-sf-dark: #0f172a;
    --map-sf-light: #e2e8f0;
    --map-car-stroke: #0f172a;

    border-radius: 0.125rem;
    border: 1px solid var(--map-border);
    background: var(--map-bg);
    padding: 0.375rem;
    color: var(--map-muted);
  }

  .track-map--compact {
    padding: 0.125rem;
  }

  @media (prefers-color-scheme: light) {
    .track-map {
      --map-bg: color-mix(in srgb, #f1f5f9 92%, transparent);
      --map-border: color-mix(in srgb, #64748b 28%, transparent);
      --map-title: #475569;
      --map-muted: #64748b;
      --map-label: #1e293b;
      --map-asphalt: #cbd5e1;
      --map-line: #0369a1;
      --map-pit: #64748b;
      --map-drs: #0f766e;
      --map-sf-dark: #0f172a;
      --map-sf-light: #f8fafc;
      --map-car-stroke: #f8fafc;
    }
  }

  .track-map__title {
    margin: 0 0 0.25rem;
    font-family: ui-monospace, monospace;
    font-size: 8px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--map-title);
  }

  .track-map__svg {
    display: block;
    width: 100%;
    height: auto;
    max-width: 240px;
    margin-inline: auto;
  }

  .track-map--compact .track-map__svg {
    max-width: none;
  }

  .track-map__pit {
    stroke: var(--map-pit);
    opacity: 0.65;
  }

  .track-map__asphalt {
    stroke: var(--map-asphalt);
  }

  .track-map__line {
    stroke: var(--map-line);
  }

  .track-map__drs {
    stroke: var(--map-drs);
    opacity: 0.7;
  }

  .track-map__straight {
    fill: var(--map-muted);
  }

  .track-map__turn-n {
    fill: var(--map-label);
  }

  .track-map__turn-name {
    fill: var(--map-muted);
  }

  .track-map__sf-a {
    fill: var(--map-sf-dark);
  }

  .track-map__sf-b {
    fill: var(--map-sf-light);
  }

  .track-map__sf-label {
    fill: var(--map-label);
  }

  .track-map__car {
    stroke: var(--map-car-stroke);
    stroke-width: 0.3;
  }

  .track-map__car--player {
    stroke: var(--map-label);
    stroke-width: 0.55;
  }

  .track-map__car--retired {
    stroke: #ca8a04;
    stroke-width: 0.85;
  }

  .track-map__legend {
    margin: 0.25rem 0 0;
    font-family: ui-monospace, monospace;
    font-size: 7px;
    color: var(--map-muted);
  }
</style>
