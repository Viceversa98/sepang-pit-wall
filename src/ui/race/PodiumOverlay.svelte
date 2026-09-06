<script lang="ts">
  import { unlockRaceAudioFromGesture } from "@/lib/raceAudio";
  import { pointsForPosition, formatPointsTable } from "@/lib/academy/points";
  import { speedUnitLabel } from "@/lib/speedUnits";
  import { useRaceStore, type StandingsRow } from "@/stores/raceStore";
  import { pwButtonClass } from "@/ui/pwButton";

  const ORDINAL = (n: number): string => {
    const v = n % 100;
    if (v >= 11 && v <= 13) return `${n}th`;
    switch (n % 10) {
      case 1:
        return `${n}st`;
      case 2:
        return `${n}nd`;
      case 3:
        return `${n}rd`;
      default:
        return `${n}th`;
    }
  };

  const STEP_H = ["h-28", "h-20", "h-16"] as const;
  const STEP_ORDER = [1, 0, 2] as const;

  let race = $state(useRaceStore.getState());

  $effect(() => {
    return useRaceStore.subscribe((s) => {
      race = s;
    });
  });

  const player = $derived(race.standings.find((row) => row.isPlayer));
  const playerPosition = $derived(player?.position ?? null);
  const top3 = $derived([race.standings[0], race.standings[1], race.standings[2]]);
  const unfinished = $derived(
    race.standings.filter(
      (row) => !row.finished && row.carStatus !== "retired",
    ),
  );
  const fieldStillOut = $derived(unfinished.length > 0 && race.phase !== "finished");

  const headline = $derived(
    playerPosition === 1
      ? "Winner — lights out, you owned Sepang"
      : playerPosition
        ? `Chequered flag — you finish ${ORDINAL(playerPosition)}`
        : "Chequered flag",
  );

  const stepMeta = (place: 1 | 2 | 3) => {
    const medal =
      place === 1 ? "text-amber-300" : place === 2 ? "text-slate-200" : "text-amber-700";
    const gradient =
      place === 1
        ? "from-amber-400/35 to-amber-900/40"
        : place === 2
          ? "from-slate-300/25 to-slate-800/50"
          : "from-amber-800/30 to-stone-900/50";
    return { medal, gradient, height: STEP_H[place - 1] };
  };

  const handleBeginRace = () => {
    unlockRaceAudioFromGesture();
    useRaceStore.getState().beginRace();
  };
  const handleReset = () => useRaceStore.getState().resetToLanding();

  const unfinishedLabel = (row: StandingsRow): string => {
    if (row.carStatus === "retired") return "OUT";
    return `L${row.currentLap}/${race.totalLaps} · ${row.speedDisplay} ${speedUnitLabel()} · ${row.gapLabel}`;
  };
</script>

<!-- Docked board — keeps overview visible while unfinished cars still race. -->
<div
  class="podium-overlay pointer-events-none absolute inset-0 z-40 flex items-end justify-end p-3 sm:p-4"
  role="dialog"
  aria-modal="false"
  aria-label="Race results podium"
>
  <div
    class="podium-card pointer-events-auto max-h-[min(92dvh,640px)] w-full max-w-md overflow-y-auto border border-amber-500/30 bg-[var(--pw-panel)]/95 px-4 py-5 shadow-[0_0_60px_rgba(245,158,11,0.12)] backdrop-blur-md sm:px-6 sm:py-6"
  >
    <p class="font-mono text-[10px] tracking-[0.32em] text-amber-400 uppercase">
      {fieldStillOut ? "You classified · field still out" : "Race complete"}
    </p>
    <h2 class="mt-2 font-display text-xl text-white sm:text-2xl">{headline}</h2>
    {#if playerPosition}
      <p class="mt-2 font-mono text-sm text-slate-400">
        Classification ·
        <span class="text-rose-300 tabular-nums">P{playerPosition}</span>
        {" · "}
        <span class="text-amber-200 tabular-nums">{pointsForPosition(playerPosition)} pts</span>
      </p>
    {/if}
    <p class="mt-2 font-mono text-[10px] leading-relaxed text-slate-500">
      {formatPointsTable()}
    </p>

    <div class="mt-6 flex items-end justify-center gap-2 sm:gap-3" aria-label="Podium top three">
      {#each STEP_ORDER as idx}
        {@const place = (idx + 1) as 1 | 2 | 3}
        {@const row = top3[idx] as StandingsRow | undefined}
        {@const delayMs = 180 + idx * 140}
        {@const meta = stepMeta(place)}
        {@const isPlayer = !!row?.isPlayer}
        <div class="flex w-20 flex-col items-center sm:w-24" style:animation-delay="{delayMs}ms">
          <div
            class="podium-driver mb-2 text-center {isPlayer ? 'scale-105' : ''}"
            style:animation-delay="{delayMs}ms"
          >
            <p class="font-display text-xl leading-none tabular-nums {meta.medal}">P{place}</p>
            <p
              class="mt-1 max-w-[5.5rem] truncate font-mono text-[9px] tracking-[0.12em] uppercase {isPlayer
                ? 'text-rose-300'
                : 'text-slate-300'}"
            >
              {row?.name ?? "—"}
            </p>
            {#if row && !row.finished && row.carStatus !== "retired"}
              <p class="mt-0.5 font-mono text-[8px] tracking-[0.14em] text-cyan-300/90 uppercase">
                Still out
              </p>
            {:else if isPlayer}
              <p class="mt-0.5 font-mono text-[8px] tracking-[0.2em] text-rose-400/90 uppercase">
                You
              </p>
            {/if}
          </div>
          <div
            class="podium-step w-full rounded-t-sm border border-white/15 bg-gradient-to-b {meta.height} {meta.gradient} {isPlayer
              ? 'ring-2 ring-rose-400/50'
              : ''}"
            style:animation-delay="{delayMs}ms"
            aria-hidden="true"
          ></div>
        </div>
      {/each}
    </div>

    {#if unfinished.length > 0}
      <div class="mt-5 border-t border-white/10 pt-4" aria-live="polite">
        <p class="font-mono text-[9px] tracking-[0.28em] text-cyan-300/90 uppercase">
          Still racing · live
        </p>
        <ul class="mt-2 max-h-36 space-y-1.5 overflow-y-auto pr-1">
          {#each unfinished as row (row.id)}
            <li
              class="flex items-baseline justify-between gap-2 border border-white/10 bg-black/25 px-2 py-1.5 font-mono text-[10px]"
            >
              <span class="min-w-0 truncate {row.isPlayer ? 'text-rose-300' : 'text-slate-200'}">
                <span class="text-slate-500 tabular-nums">P{row.position}</span>
                {" "}
                {row.name}
              </span>
              <span class="shrink-0 text-slate-400 tabular-nums">{unfinishedLabel(row)}</span>
            </li>
          {/each}
        </ul>
      </div>
    {:else if race.phase === "finished"}
      <p class="mt-4 font-mono text-[10px] text-slate-500">Full field classified.</p>
    {/if}

    <div class="mt-6 flex flex-wrap items-center justify-center gap-2">
      <button
        type="button"
        class={pwButtonClass("primary", "md")}
        aria-label="Restart race with start lights"
        onclick={handleBeginRace}
      >
        Race again
      </button>
      <button
        type="button"
        class={pwButtonClass("secondary", "md")}
        aria-label="Return to setup screen"
        onclick={handleReset}
      >
        Back to start
      </button>
    </div>
  </div>
</div>
