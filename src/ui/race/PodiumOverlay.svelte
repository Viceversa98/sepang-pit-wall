<script lang="ts">
  import { unlockRaceAudioFromGesture } from "@/lib/raceAudio";
  import { pointsForPosition, formatPointsTable } from "@/lib/academy/points";
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

  const STEP_H = ["h-40", "h-28", "h-24"] as const;
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
</script>

<div
  class="podium-overlay absolute inset-0 z-40 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md"
  role="dialog"
  aria-modal="true"
  aria-label="Race results podium"
>
  <div
    class="podium-card w-full max-w-lg border border-amber-500/30 bg-[var(--pw-panel)]/95 px-5 py-6 shadow-[0_0_60px_rgba(245,158,11,0.12)] sm:px-8 sm:py-8"
  >
    <p class="font-mono text-[10px] tracking-[0.32em] text-amber-400 uppercase">Race complete</p>
    <h2 class="mt-2 font-display text-2xl text-white sm:text-3xl">{headline}</h2>
    {#if playerPosition}
      <p class="mt-2 font-mono text-sm text-slate-400">
        Final classification ·
        <span class="text-rose-300 tabular-nums">P{playerPosition}</span>
        {" · "}
        <span class="text-amber-200 tabular-nums">{pointsForPosition(playerPosition)} pts</span>
      </p>
    {/if}
    <p class="mt-2 font-mono text-[10px] leading-relaxed text-slate-500">
      {formatPointsTable()}
    </p>

    <div class="mt-8 flex items-end justify-center gap-3 sm:gap-4" aria-label="Podium top three">
      {#each STEP_ORDER as idx}
        {@const place = (idx + 1) as 1 | 2 | 3}
        {@const row = top3[idx] as StandingsRow | undefined}
        {@const delayMs = 180 + idx * 140}
        {@const meta = stepMeta(place)}
        {@const isPlayer = !!row?.isPlayer}
        <div class="flex w-24 flex-col items-center sm:w-28" style:animation-delay="{delayMs}ms">
          <div
            class="podium-driver mb-2 text-center {isPlayer ? 'scale-105' : ''}"
            style:animation-delay="{delayMs}ms"
          >
            <p class="font-display text-2xl leading-none tabular-nums {meta.medal}">P{place}</p>
            <p
              class="mt-1 max-w-[6.5rem] truncate font-mono text-[10px] tracking-[0.12em] uppercase {isPlayer
                ? 'text-rose-300'
                : 'text-slate-300'}"
            >
              {row?.name ?? "—"}
            </p>
            {#if isPlayer}
              <p class="mt-0.5 font-mono text-[9px] tracking-[0.2em] text-rose-400/90 uppercase">
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

    <div class="mt-8 flex flex-wrap items-center justify-center gap-2">
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
