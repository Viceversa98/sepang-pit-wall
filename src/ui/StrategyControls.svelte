<script lang="ts">
  import type { WeatherOverride } from "@/lib/weather";
  import { portraitStrategyPanelClass } from "@/lib/mobileRaceLayout";
  import { defaultStrategy, syncPolledStrategy, type PolledStrategyState } from "@/stores/polledRaceTelemetry";
  import {
    useRaceStore,
    type EngineMode,
    type TyreCompound,
  } from "@/stores/raceStore";
  import { pwButtonClass, pwSelectClass } from "@/ui/pwButton";
  import { useRaceLayoutGetter } from "@/ui/race/raceLayoutContext";
  import StrategySegmentGroup from "@/ui/race/StrategySegmentGroup.svelte";
  import { COMPOUND_COPY, ENGINE_COPY } from "@/ui/race/strategyCopy";
  import { COMPOUND_SEGMENTS, ENGINE_SEGMENTS } from "@/ui/race/strategySegments";

  type Props = {
    class?: string;
  };

  let { class: className = "" }: Props = $props();

  const getLayoutMode = useRaceLayoutGetter();
  const layoutMode = $derived(getLayoutMode());
  const mobilePortrait = $derived(layoutMode === "mobilePortrait");

  const selectClass = pwSelectClass("disabled:cursor-not-allowed disabled:opacity-45");
  let strategy = $state(defaultStrategy());
  let race = $state(useRaceStore.getState());

  const portraitPanelMaxClass = $derived(
    portraitStrategyPanelClass(mobilePortrait, race.phase),
  );

  let strategyPollPaused = $state(false);

  const applyStrategySnapshot = (next: PolledStrategyState) => {
    if (
      strategy.engineMode === next.engineMode &&
      strategy.currentCompound === next.currentCompound &&
      strategy.isBoxing === next.isBoxing &&
      strategy.pendingBox === next.pendingBox &&
      strategy.pitPhase === next.pitPhase &&
      strategy.pitHoldTraffic === next.pitHoldTraffic &&
      strategy.pitServiceDone === next.pitServiceDone &&
      strategy.tireWear === next.tireWear &&
      strategy.rainIntensity === next.rainIntensity
    ) {
      return;
    }
    strategy = next;
  };

  $effect(() => {
    return useRaceStore.subscribe((s) => {
      race = s;
    });
  });

  $effect(() => {
    applyStrategySnapshot(syncPolledStrategy());
    const id = window.setInterval(() => {
      if (strategyPollPaused) return;
      applyStrategySnapshot(syncPolledStrategy());
    }, 100);
    return () => window.clearInterval(id);
  });

  const disabled = $derived(race.phase !== "racing");
  const stintSetupDisabled = $derived(
    race.phase === "starting" || race.phase === "finished",
  );
  const preRaceGrid = $derived(race.phase === "ready");
  const wearCritical = $derived(strategy.tireWear < 35);
  const rainRisk = $derived(
    (strategy.rainIntensity > 0.45 &&
      (strategy.currentCompound === "soft" ||
        strategy.currentCompound === "medium" ||
        strategy.currentCompound === "hard")) ||
      (strategy.rainIntensity < 0.15 &&
        (strategy.currentCompound === "intermediate" || strategy.currentCompound === "wet")),
  );
  const urgeBox = $derived(wearCritical || rainRisk);
  const boxQueued = $derived(strategy.pendingBox && !strategy.isBoxing);
  const canRelease = $derived(
    race.phase === "racing" &&
      strategy.isBoxing &&
      strategy.pitPhase === "stopped" &&
      strategy.pitServiceDone &&
      strategy.pitHoldTraffic,
  );

  const handleEngineSelect = (value: string) => {
    useRaceStore.getState().setEngineMode(value as EngineMode);
  };

  const handleCompoundSelect = (value: string) => {
    useRaceStore.getState().setCompound(value as TyreCompound);
  };

  const handleEngineChange = (e: Event) => {
    const value = (e.currentTarget as HTMLSelectElement).value as EngineMode;
    useRaceStore.getState().setEngineMode(value);
  };

  const handleCompoundChange = (e: Event) => {
    const value = (e.currentTarget as HTMLSelectElement).value as TyreCompound;
    useRaceStore.getState().setCompound(value);
  };

  const handleWeatherChange = (e: Event) => {
    const value = (e.currentTarget as HTMLSelectElement).value as WeatherOverride;
    useRaceStore.getState().setWeatherOverride(value);
  };

  const handleBox = () => useRaceStore.getState().requestBoxNextLap();
  const handleRelease = () => useRaceStore.getState().releaseFromBox();

  const handleStrategySelectFocus = () => {
    strategyPollPaused = true;
  };

  const handleStrategySelectBlur = () => {
    strategyPollPaused = false;
    applyStrategySnapshot(syncPolledStrategy());
  };

  const showStintLevers = $derived(
    !mobilePortrait || preRaceGrid || race.phase === "racing",
  );
  const showWeatherControl = $derived(!mobilePortrait || preRaceGrid);
</script>

<aside
  class="pit-panel relative z-20 flex h-full min-h-0 flex-col overflow-hidden border-b border-amber-500/15 bg-[var(--pw-panel)] text-white md:border-b-0 md:border-r {portraitPanelMaxClass} {className}"
  aria-label="Strategy controls"
>
  <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 md:p-4">
  {#if !mobilePortrait || preRaceGrid}
  <div>
    <p class="font-mono text-[10px] tracking-[0.28em] text-amber-400 uppercase">Pit wall · Call</p>
    <h2 class="font-display mt-0.5 text-lg tracking-tight text-slate-50 md:text-xl">
      Strategy desk
    </h2>
    <p class="mt-0.5 text-[11px] leading-snug text-slate-400 md:text-xs">
      Box, compound, engine — keep YOU fast to the flag.
    </p>
  </div>
  {/if}

  {#if preRaceGrid}
    <div
      class="rounded-sm border border-cyan-500/35 bg-cyan-950/35 px-3 py-2 font-mono text-[11px] tracking-wide text-cyan-100"
      role="status"
    >
      Grid setup — pick starting compound and engine before Start.
    </div>
  {/if}

  {#if race.phase === "starting"}
    <div
      class="rounded-sm border border-red-500/40 bg-red-950/40 px-3 py-2 font-mono text-[11px] tracking-wide text-red-200"
      role="status"
    >
      Hands off — lights sequence. Strategy unlocks at lights out.
    </div>
  {/if}

  {#if urgeBox && race.phase === "racing" && !strategy.isBoxing && !strategy.pendingBox}
    <div
      class="rounded-sm border border-rose-400/45 bg-rose-950/50 px-3 py-2 text-xs text-rose-100"
      role="alert"
    >
      {wearCritical
        ? "Tyres cooked — box now or lose pace."
        : strategy.rainIntensity < 0.15
          ? "Track drying — inters/wets are slow. Box to slicks."
          : "Rain vs slicks — grip collapsing. Box to Intermediate or Wet."}
    </div>
  {/if}

  {#if !mobilePortrait}
    <section class="space-y-2" aria-labelledby="box-call-label">
      <p
        id="box-call-label"
        class="font-mono text-[9px] tracking-[0.22em] text-slate-500 uppercase"
      >
        Primary call
      </p>
      <button
        type="button"
        class="{pwButtonClass(strategy.isBoxing || boxQueued ? 'secondary' : 'primary', 'md', {
          fullWidth: true,
          className: urgeBox && !strategy.isBoxing && !boxQueued ? 'ring-2 ring-rose-400/70' : boxQueued ? 'ring-2 ring-cyan-400/60' : '',
        })}"
        {disabled}
        aria-label={strategy.isBoxing
          ? "In the box"
          : boxQueued
            ? "Box queued this lap"
            : urgeBox
              ? "Box now urgent"
              : "Box next lap"}
        onclick={handleBox}
      >
        {strategy.isBoxing
          ? "In the box…"
          : boxQueued
            ? "Box this lap"
            : urgeBox
              ? "Box now (urgent)"
              : "Box next lap"}
      </button>
      {#if canRelease}
        <button
          type="button"
          class="{pwButtonClass('primary', 'md', {
            fullWidth: true,
            className: strategy.pitHoldTraffic ? 'ring-2 ring-amber-400/70' : '',
          })}"
          aria-label="Release from pit box"
          onclick={handleRelease}
        >
          {strategy.pitHoldTraffic ? "Release now (traffic!)" : "Release"}
        </button>
      {/if}
      <p class="text-[10px] text-slate-500">
        {canRelease && strategy.pitHoldTraffic
          ? "Hold for clear lane — early release = +10s unsafe"
          : "Pit after T15 · stop · change · exit"}
      </p>
    </section>
  {/if}

  {#if showStintLevers}
  <section class="space-y-2" aria-labelledby="stint-label">
    <p id="stint-label" class="font-mono text-[9px] tracking-[0.22em] text-slate-500 uppercase">
      Stint levers
    </p>

    <label class="block space-y-1">
      <span class="font-mono text-[10px] text-slate-400">Engine</span>
      {#if mobilePortrait}
        <StrategySegmentGroup
          label=""
          value={strategy.engineMode}
          options={ENGINE_SEGMENTS}
          disabled={stintSetupDisabled}
          onSelect={handleEngineSelect}
        />
      {:else}
      <select
        class="{selectClass} min-h-11 touch-manipulation"
        value={strategy.engineMode}
        disabled={stintSetupDisabled}
        aria-label="Engine mode"
        onfocus={handleStrategySelectFocus}
        onblur={handleStrategySelectBlur}
        onchange={handleEngineChange}
      >
        <option value="push">Push</option>
        <option value="standard">Standard</option>
        <option value="save">Save</option>
      </select>
      {/if}
    </label>
    <p class="text-[11px] text-slate-500">{ENGINE_COPY[strategy.engineMode]}</p>

    <label class="block space-y-1">
      <span class="font-mono text-[10px] text-slate-400">
        {preRaceGrid ? "Starting compound" : "Compound (queues box)"}
      </span>
      {#if mobilePortrait}
        <StrategySegmentGroup
          label=""
          value={strategy.currentCompound}
          options={COMPOUND_SEGMENTS}
          disabled={stintSetupDisabled}
          onSelect={handleCompoundSelect}
        />
      {:else}
      <select
        class="{selectClass} min-h-11 touch-manipulation"
        value={strategy.currentCompound}
        disabled={stintSetupDisabled}
        aria-label="Tyre compound"
        onfocus={handleStrategySelectFocus}
        onblur={handleStrategySelectBlur}
        onchange={handleCompoundChange}
      >
        <option value="soft">Soft</option>
        <option value="medium">Medium</option>
        <option value="hard">Hard</option>
        <option value="intermediate">Intermediate</option>
        <option value="wet">Wet</option>
      </select>
      {/if}
    </label>
    <p class="text-[11px] text-slate-500">{COMPOUND_COPY[strategy.currentCompound]}</p>
  </section>
  {/if}

  {#if showWeatherControl}
  <label class="block space-y-1">
    <span class="font-mono text-[10px] text-slate-400">Weather scenario</span>
    <select
      class="{selectClass} min-h-11 touch-manipulation"
      value={race.weatherOverride}
      aria-label="Weather scenario"
      onfocus={handleStrategySelectFocus}
      onblur={handleStrategySelectBlur}
      onchange={handleWeatherChange}
    >
      <option value="auto">Auto (Sepang API)</option>
      <option value="dry">Dry</option>
      <option value="light">Light rain</option>
      <option value="heavy">Heavy rain</option>
    </select>
  </label>
  {/if}

    {#if !mobilePortrait}
      <div class="mt-auto shrink-0 border-t border-white/10 pt-2 font-mono text-[10px] leading-snug text-slate-500">
        Wear → box → pits → rain.
      </div>
    {:else}
      <p class="mt-auto shrink-0 border-t border-white/10 pt-2 text-center font-mono text-[9px] text-slate-500">
        <a
          href="https://www.alifasraf.asia/"
          target="_blank"
          rel="noopener noreferrer"
          class="text-cyan-400/90 transition hover:text-cyan-300"
        >
          Built by Alif Asraf
        </a>
      </p>
    {/if}
  </div>

  {#if mobilePortrait && race.phase === "racing"}
    <section
      class="shrink-0 space-y-2 border-t border-amber-500/20 bg-[var(--pw-panel)] p-3 pb-[max(0.75rem,var(--safe-bottom))]"
      aria-labelledby="box-call-label-mobile"
    >
      <p
        id="box-call-label-mobile"
        class="font-mono text-[9px] tracking-[0.22em] text-slate-500 uppercase"
      >
        Primary call
      </p>
      <button
        type="button"
        class="{pwButtonClass(strategy.isBoxing || boxQueued ? 'secondary' : 'primary', 'touch', {
          fullWidth: true,
          className: urgeBox && !strategy.isBoxing && !boxQueued ? 'ring-2 ring-rose-400/70' : boxQueued ? 'ring-2 ring-cyan-400/60' : '',
        })}"
        {disabled}
        aria-label={strategy.isBoxing
          ? "In the box"
          : boxQueued
            ? "Box queued this lap"
            : urgeBox
              ? "Box now urgent"
              : "Box next lap"}
        onclick={handleBox}
      >
        {strategy.isBoxing
          ? "In the box…"
          : boxQueued
            ? "Box this lap"
            : urgeBox
              ? "Box now (urgent)"
              : "Box next lap"}
      </button>
      {#if canRelease}
        <button
          type="button"
          class="{pwButtonClass('primary', 'touch', {
            fullWidth: true,
            className: strategy.pitHoldTraffic ? 'ring-2 ring-amber-400/70' : '',
          })}"
          aria-label="Release from pit box"
          onclick={handleRelease}
        >
          {strategy.pitHoldTraffic ? "Release now (traffic!)" : "Release"}
        </button>
      {/if}
    </section>
  {/if}
</aside>
