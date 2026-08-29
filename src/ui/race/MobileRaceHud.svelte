<script lang="ts">
  import { PIT_LANE_LIMIT_KMH } from "@/lib/pitStop";
  import type { RaceLayoutMode } from "@/lib/viewportLayout";
  import {
    defaultHud,
    defaultTiming,
    syncPolledHud,
    syncPolledTiming,
    buildTimingTower,
  } from "@/stores/polledRaceTelemetry";
  import { useRaceStore, type CameraMode } from "@/stores/raceStore";
  import TrackMinimap from "@/ui/TrackMinimap.svelte";
  import { pwButtonClass } from "@/ui/pwButton";

  type Props = {
    layoutMode: RaceLayoutMode;
  };

  let { layoutMode }: Props = $props();

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
  let hud = $state(defaultHud());
  let timingSheetOpen = $state(false);

  $effect(() => {
    return useRaceStore.subscribe((s) => {
      race = s;
    });
  });

  $effect(() => {
    const sync = () => {
      timing = syncPolledTiming();
      hud = syncPolledHud();
    };
    sync();
    const id = window.setInterval(sync, 100);
    return () => window.clearInterval(id);
  });

  const isPortrait = $derived(layoutMode === "mobilePortrait");
  const towerRows = $derived(isPortrait ? 6 : 3);
  const tower = $derived(buildTimingTower(timing.standings, towerRows));
  const playerOutsideTop = $derived.by(() => {
    const player = timing.standings.find((r) => r.isPlayer);
    if (!player || timing.standings.length <= towerRows) return false;
    return !timing.standings.slice(0, towerRows).some((r) => r.id === player.id);
  });

  const wearHot = $derived(timing.tireWear < 35);
  const compoundLetter = $derived(
    timing.currentCompound === "intermediate"
      ? "I"
      : timing.currentCompound === "wet"
        ? "W"
        : timing.currentCompound[0],
  );

  const statusChips = $derived.by(() => {
    const chips: string[] = [];
    if (race.raceControl !== "green") chips.push(`Flag · ${race.raceControl}`);
    if (race.drsActive) chips.push("DRS");
    if (race.blueFlagActive) chips.push("Blue flag");
    if (race.playerPenalties.length > 0) chips.push(`Penalty · ${race.playerPenalties.join(", ")}`);
    if (hud.incidentLabel) chips.push(hud.incidentLabel);
    if (timing.isBoxing) chips.push("In pits");
    return chips;
  });

  const playerColor = $derived(
    race.cars.find((c) => c.isPlayer)?.color ?? race.selectedPlayerColor,
  );

  const handleCameraMode = (mode: CameraMode) => {
    useRaceStore.getState().setCameraMode(mode);
  };

  const handleToggleMute = () => {
    const s = useRaceStore.getState();
    s.setAudioMuted(!s.audioMuted);
  };

  const handleOpenTiming = () => {
    timingSheetOpen = true;
  };

  const handleCloseTiming = () => {
    timingSheetOpen = false;
  };
</script>

{#if race.phase !== "landing"}
  <div class="pointer-events-none absolute inset-0 z-10">
    {#if isPortrait}
      <!-- Top telemetry strip -->
      <div
        class="pointer-events-auto absolute inset-x-0 top-0 flex flex-col gap-1 border-b border-white/15 bg-black/75 px-2 py-1.5 backdrop-blur-md"
      >
        <div class="flex items-center gap-2">
          <div class="shrink-0 rounded-sm border border-amber-500/35 bg-black/50 px-2 py-1">
            <p class="font-mono text-[8px] tracking-[0.2em] text-amber-400/90 uppercase">You</p>
            <p class="font-display text-lg leading-none text-white tabular-nums">P{hud.pos}</p>
          </div>
          <div class="min-w-0 flex-1">
            <p class="font-mono text-base leading-none tabular-nums text-amber-200">
              {formatLapTime(timing.currentLapTimeMs)}
            </p>
            <p class="font-mono text-[10px] text-white/55">
              L{Math.min(timing.currentLap, race.totalLaps)}/{race.totalLaps}
              · {timing.speedKmh} km/h
              · <span class="uppercase {compoundTint[timing.currentCompound] ?? ''}"
                >{compoundLetter}</span
              >
            </p>
          </div>
          <button
            type="button"
            class="flex size-11 shrink-0 items-center justify-center rounded-sm border border-white/20 bg-white/5 font-mono text-[10px] text-slate-300"
            aria-label={race.audioMuted ? "Unmute race audio" : "Mute race audio"}
            aria-pressed={race.audioMuted}
            onclick={handleToggleMute}
          >
            {race.audioMuted ? "Mute" : "Audio"}
          </button>
          <button
            type="button"
            class={pwButtonClass("secondary", "touch", { className: "shrink-0 px-3" })}
            aria-label="Open timing tower"
            aria-expanded={timingSheetOpen}
            onclick={handleOpenTiming}
          >
            Timing
          </button>
        </div>
        {#if statusChips.length > 0}
          <div class="flex gap-1 overflow-x-auto pb-0.5" role="status" aria-live="polite">
            {#each statusChips as chip (chip)}
              <span
                class="shrink-0 rounded-sm border border-white/15 bg-black/50 px-2 py-0.5 font-mono text-[9px] tracking-wide text-slate-200 uppercase"
              >
                {chip}
              </span>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Minimap dot (portrait) -->
      <div
        class="pointer-events-auto absolute bottom-3 left-3 z-10 w-12 overflow-hidden rounded-sm border border-white/20 bg-black/70 shadow-lg"
        aria-label="Track minimap"
      >
        <TrackMinimap compact />
      </div>
    {:else}
      <!-- Landscape: compact timing card top-right -->
      <aside
        class="pointer-events-auto absolute top-2 right-2 z-20 flex w-[min(200px,42%)] flex-col gap-1.5 rounded-sm border border-white/20 bg-black/70 p-2 text-slate-50 backdrop-blur-md"
        aria-label="Timing compact"
      >
        <div class="flex items-baseline justify-between gap-2">
          <p class="font-mono text-[9px] tracking-[0.22em] text-cyan-200/80 uppercase">Timing</p>
          <button
            type="button"
            class="flex size-11 items-center justify-center rounded-sm border border-white/15 font-mono text-[10px] text-white/60"
            aria-label={race.audioMuted ? "Unmute race audio" : "Mute race audio"}
            aria-pressed={race.audioMuted}
            onclick={handleToggleMute}
          >
            {race.audioMuted ? "Off" : "On"}
          </button>
        </div>
        <p class="font-mono text-lg leading-none tabular-nums text-amber-200">
          {formatLapTime(timing.currentLapTimeMs)}
        </p>
        <p class="font-mono text-[10px] text-white/55">
          P{hud.pos} · L{Math.min(timing.currentLap, race.totalLaps)}/{race.totalLaps}
        </p>
        <div class="flex items-center gap-2">
          <div
            class="h-1.5 min-w-0 flex-1 overflow-hidden rounded-sm bg-white/15"
            role="progressbar"
            aria-label="Tire wear"
            aria-valuenow={Math.round(timing.tireWear)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              class="h-full rounded-sm {wearHot ? 'bg-rose-400' : 'bg-emerald-400/80'}"
              style:width="{Math.max(0, Math.min(100, timing.tireWear))}%"
            ></div>
          </div>
          <span class="font-mono text-[9px] tabular-nums text-white/60"
            >{timing.tireWear.toFixed(0)}%</span
          >
        </div>
        <TrackMinimap compact />
        <ul class="space-y-0.5 border-t border-white/10 pt-1 font-mono text-[9px]" role="list">
          {#each tower as row, i (row.id)}
            {#if playerOutsideTop && i === tower.length - 1 && row.isPlayer}
              <li class="text-center text-white/25" aria-hidden="true">···</li>
            {/if}
            <li
              class="flex items-center gap-1 rounded-sm px-1 py-0.5"
              style:background-color={row.isPlayer ? `${row.color}33` : undefined}
            >
              <span class="w-3 tabular-nums text-white/40">{row.position}</span>
              <span class="min-w-0 flex-1 truncate {row.isPlayer ? 'font-semibold' : ''}"
                >{row.name}</span
              >
              <span class="tabular-nums text-white/45">{row.gapLabel}</span>
            </li>
          {/each}
        </ul>
      </aside>

      <!-- Landscape: position + status left -->
      <div class="pointer-events-none absolute top-2 left-2 z-10 flex max-w-[38%] flex-col gap-1.5">
        <div class="rounded-sm border border-amber-500/35 bg-black/55 px-2 py-1 backdrop-blur-sm">
          <p class="font-mono text-[8px] tracking-[0.24em] text-amber-400/90 uppercase">You</p>
          <p class="font-display text-2xl leading-none text-white tabular-nums">P{hud.pos}</p>
        </div>
        {#each statusChips.slice(0, 2) as chip (chip)}
          <div
            class="rounded-sm border border-white/15 bg-black/60 px-2 py-1 backdrop-blur-sm"
            role="status"
          >
            <p class="font-mono text-[9px] tracking-wide text-slate-200 uppercase">{chip}</p>
          </div>
        {/each}
      </div>
    {/if}

    <!-- Camera controls: bottom-right on portrait, left column on landscape -->
    <div
      class="pointer-events-auto absolute z-20 flex gap-1 rounded-sm border border-white/20 bg-black/65 p-0.5 backdrop-blur-sm {isPortrait
        ? 'bottom-3 right-3'
        : 'bottom-3 left-2 flex-col'}"
      role="group"
      aria-label="Camera mode"
    >
      <button
        type="button"
        class="{pwButtonClass('secondary', 'touch', {
          className:
            race.cameraMode === 'overview'
              ? 'min-w-11 bg-amber-500/25 text-amber-100'
              : 'min-w-11 border-transparent bg-transparent',
        })}"
        aria-pressed={race.cameraMode === "overview"}
        aria-label={race.cameraMode === "overview" && !race.overviewFollow
          ? "Re-follow YOU in overview"
          : "Overview camera"}
        onclick={() => handleCameraMode("overview")}
      >
        {race.cameraMode === "overview" && !race.overviewFollow ? "Ref" : "Ovr"}
      </button>
      <button
        type="button"
        class="{pwButtonClass('secondary', 'touch', {
          className:
            race.cameraMode === 'follow'
              ? 'min-w-11 border-transparent'
              : 'min-w-11 border-transparent bg-transparent',
        })}"
        style:background-color={race.cameraMode === "follow" ? `${playerColor}44` : undefined}
        aria-pressed={race.cameraMode === "follow"}
        aria-label="Follow YOU"
        onclick={() => handleCameraMode("follow")}
      >
        YOU
      </button>
    </div>
  </div>

  {#if timingSheetOpen && isPortrait}
    <div
      class="absolute inset-0 z-40 flex items-end justify-center bg-slate-950/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Timing tower"
    >
      <div
        class="pointer-events-auto max-h-[70dvh] w-full overflow-y-auto border-t border-cyan-500/30 bg-[var(--pw-panel)] px-4 py-4 pb-[max(1rem,var(--safe-bottom))]"
      >
        <div class="mb-3 flex items-center justify-between gap-2">
          <p class="font-mono text-[10px] tracking-[0.28em] text-cyan-300 uppercase">Timing tower</p>
          <button
            type="button"
            class={pwButtonClass("secondary", "touch")}
            aria-label="Close timing tower"
            onclick={handleCloseTiming}
          >
            Close
          </button>
        </div>
        <p class="font-mono text-xl tabular-nums text-amber-200">
          {formatLapTime(timing.currentLapTimeMs)}
        </p>
        <p class="mt-1 font-mono text-[11px] text-white/55">
          Last {formatLapTime(timing.lastLapTimeMs)} · grip {timing.gripPct}%
        </p>
        <div class="mt-3">
          <TrackMinimap />
        </div>
        {#if timing.isBoxing}
          <p class="mt-2 font-mono text-[10px] text-cyan-200/90 uppercase">
            Pit {PIT_LANE_LIMIT_KMH}
          </p>
        {/if}
        <ul class="mt-3 space-y-0.5 border-t border-white/10 pt-2 font-mono text-[11px]" role="list">
          {#each tower as row, i (row.id)}
            {#if playerOutsideTop && i === tower.length - 1 && row.isPlayer}
              <li class="py-0.5 text-center text-white/25" aria-hidden="true">···</li>
            {/if}
            <li
              class="flex items-center gap-2 rounded-sm px-2 py-1.5"
              style:background-color={row.isPlayer ? `${row.color}33` : undefined}
            >
              <span class="w-4 tabular-nums text-white/40">{row.position}</span>
              <span
                class="h-2 w-2 shrink-0 rounded-full"
                style:background-color={row.color}
                aria-hidden="true"
              ></span>
              <span class="min-w-0 flex-1 truncate {row.isPlayer ? 'font-semibold' : ''}"
                >{row.name}</span
              >
              <span class="uppercase {compoundTint[row.compound] ?? 'text-white/40'}"
                >{row.compound[0]}</span
              >
              <span class="w-12 text-right tabular-nums text-white/45">{row.gapLabel}</span>
            </li>
          {/each}
        </ul>
      </div>
    </div>
  {/if}
{/if}
