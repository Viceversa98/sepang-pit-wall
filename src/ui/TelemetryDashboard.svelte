<script lang="ts">
  import { PIT_LANE_LIMIT_KMH } from "@/lib/pitStop";
  import { unlockRaceAudio, unlockRaceAudioFromGesture } from "@/lib/raceAudio";
  import { defaultTiming, syncPolledTiming, buildTimingTower } from "@/stores/polledRaceTelemetry";
  import { useRaceStore } from "@/stores/raceStore";
  import TrackMinimap from "@/ui/TrackMinimap.svelte";

  const formatLapTime = (ms: number) => {
    if (ms <= 0) return "—:—:—";
    const totalSec = ms / 1000;
    const minutes = Math.floor(totalSec / 60);
    const seconds = Math.floor(totalSec % 60);
    const tenths = Math.floor((ms % 1000) / 10);
    return `${minutes}:${String(seconds).padStart(2, "0")}.${String(tenths).padStart(2, "0")}`;
  };

  const compoundTint: Record<string, string> = {
    soft: "text-rose-300",
    medium: "text-amber-300",
    hard: "text-slate-100",
    intermediate: "text-emerald-300",
    wet: "text-sky-300",
  };

  let race = $state(useRaceStore.getState());
  let timing = $state(defaultTiming());

  $effect(() => {
    return useRaceStore.subscribe((s) => {
      race = s;
    });
  });

  $effect(() => {
    timing = syncPolledTiming();
    const id = window.setInterval(() => {
      timing = syncPolledTiming();
    }, 100);
    return () => window.clearInterval(id);
  });

  const wearHot = $derived(timing.tireWear < 35);
  const weatherLabel = $derived(race.weather?.label ?? "…");
  const tower = $derived(buildTimingTower(timing.standings, 6));
  const playerOutsideTop = $derived.by(() => {
    const player = timing.standings.find((r) => r.isPlayer);
    if (!player || timing.standings.length <= 6) return false;
    return !timing.standings.slice(0, 6).some((r) => r.id === player.id);
  });

  const compoundLetter = $derived(
    timing.currentCompound === "intermediate"
      ? "I"
      : timing.currentCompound === "wet"
        ? "W"
        : timing.currentCompound[0],
  );

  const handleToggleMute = () => {
    unlockRaceAudioFromGesture();
    void unlockRaceAudio().then((ok) => {
      if (!ok) return;
      const s = useRaceStore.getState();
      s.setAudioMuted(!s.audioMuted);
    });
  };
</script>

<aside
  class="pointer-events-auto absolute top-3 right-3 z-20 flex w-[min(220px,46%)] flex-col gap-2 rounded-sm border border-white/20 bg-black/70 p-2.5 text-slate-50 shadow-[0_8px_28px_rgba(0,0,0,0.45)] backdrop-blur-md"
  aria-label="Timing and tower"
>
  <div class="flex items-baseline justify-between gap-2">
    <p class="font-mono text-[9px] tracking-[0.22em] text-cyan-200/80 uppercase">Timing</p>
    <div class="flex items-center gap-1.5">
      <button
        type="button"
        class="flex size-11 items-center justify-center rounded-sm border border-white/15 font-mono text-[10px] tracking-wide text-white/60 uppercase hover:text-cyan-200"
        aria-label={race.audioMuted ? "Unmute race audio" : "Mute race audio"}
        aria-pressed={race.audioMuted}
        onclick={handleToggleMute}
      >
        {race.audioMuted ? "Off" : "On"}
      </button>
      <p class="font-mono text-[10px] tabular-nums text-white/55">
        L{Math.min(timing.currentLap, race.totalLaps)}/{race.totalLaps}
      </p>
    </div>
  </div>

  <div>
    <p class="font-mono text-xl leading-none tabular-nums text-amber-200">
      {formatLapTime(timing.currentLapTimeMs)}
    </p>
    <p class="mt-1 font-mono text-[10px] text-white/55">
      Last {formatLapTime(timing.lastLapTimeMs)}
      <span class="ml-1.5 uppercase {compoundTint[timing.currentCompound] ?? ''}">
        {compoundLetter}
      </span>
    </p>
  </div>

  <p class="font-mono text-[10px] tabular-nums text-white/55">
    {timing.speedKmh} km/h
    <span class="text-white/35"> · grip {timing.gripPct}%</span>
    {#if timing.damage > 0}
      <span class="text-rose-300"> · dmg {timing.damage}</span>
    {/if}
  </p>

  <div class="flex items-center gap-2">
    <div
      class="h-1.5 min-w-0 flex-1 overflow-hidden rounded-sm bg-white/15"
      role="progressbar"
      aria-label="Tire wear remaining"
      aria-valuenow={Math.round(timing.tireWear)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        class="h-full rounded-sm transition-[width] {wearHot ? 'bg-rose-400' : 'bg-emerald-400/80'}"
        style:width="{Math.max(0, Math.min(100, timing.tireWear))}%"
      ></div>
    </div>
    <span
      class="shrink-0 font-mono text-[10px] tabular-nums {wearHot ? 'text-rose-300' : 'text-white/60'}"
    >
      {timing.tireWear.toFixed(0)}%
    </span>
  </div>

  <p class="truncate font-mono text-[10px] text-white/50">
    {weatherLabel}
    <span class="text-white/35"> · rain {(timing.rainIntensity * 100).toFixed(0)}%</span>
  </p>

  <TrackMinimap />

  {#if timing.isBoxing || timing.pendingBox}
    <p class="font-mono text-[10px] tracking-wide text-cyan-200/90 uppercase">
      {#if timing.isBoxing}
        Pit {PIT_LANE_LIMIT_KMH}
        <span class="ml-1.5 normal-case tracking-normal text-white/55">
          {timing.pitPhase === "in"
            ? "lane in"
            : timing.pitPhase === "out"
              ? "lane out"
              : timing.pitHoldTraffic
                ? "hold"
                : "service"}
        </span>
      {:else}
        Box this lap
      {/if}
    </p>
  {/if}
  {#if timing.unsafeReleasePenaltyMs > 0}
    <p class="font-mono text-[10px] text-rose-300">
      Penalty +{(timing.unsafeReleasePenaltyMs / 1000).toFixed(0)}s
    </p>
  {/if}

  <ul class="space-y-0.5 border-t border-white/10 pt-1.5 font-mono text-[10px]" role="list">
    {#each tower as row, i (row.id)}
      {#if playerOutsideTop && i === tower.length - 1 && row.isPlayer}
        <li class="px-1 py-0.5 text-center text-white/25" aria-hidden="true">···</li>
      {/if}
      <li
        class="flex items-center gap-1 rounded-sm px-1 py-0.5"
        style:background-color={row.isPlayer ? `${row.color}33` : undefined}
      >
        <span class="w-3.5 tabular-nums text-white/40">{row.position}</span>
        <span
          class="h-1.5 w-1.5 shrink-0 rounded-full"
          style:background-color={row.color}
          aria-hidden="true"
        ></span>
        <span
          class="min-w-0 flex-1 truncate {row.isPlayer ? 'font-semibold' : 'text-white/85'}"
          style:color={row.isPlayer ? row.color : undefined}
        >
          {row.name}
        </span>
        <span class="uppercase {compoundTint[row.compound] ?? 'text-white/40'}">
          {row.compound[0]}
        </span>
        <span class="w-10 text-right tabular-nums {row.carStatus === 'retired' ? 'text-amber-300' : 'text-white/45'}">{row.gapLabel}</span>
      </li>
    {/each}
  </ul>
</aside>
