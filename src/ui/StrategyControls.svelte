<script lang="ts">
  import type { WeatherOverride } from "@/lib/weather";
  import { defaultStrategy, syncPolledStrategy } from "@/stores/polledRaceTelemetry";
  import {
    useRaceStore,
    type EngineMode,
    type TyreCompound,
  } from "@/stores/raceStore";
  import { pwButtonClass, pwSelectClass } from "@/ui/pwButton";

  const ENGINE_COPY: Record<EngineMode, string> = {
    push: "Attack — burns tyres",
    standard: "Balanced pace",
    save: "Conserve — slower",
  };

  const COMPOUND_COPY: Record<TyreCompound, string> = {
    soft: "Fast · fragile",
    medium: "Race default",
    hard: "Dry endurance",
    intermediate: "Light–medium rain",
    wet: "Heavy wet only",
  };

  const selectClass = pwSelectClass("disabled:cursor-not-allowed disabled:opacity-45");
  let strategy = $state(defaultStrategy());
  let race = $state(useRaceStore.getState());

  $effect(() => {
    return useRaceStore.subscribe((s) => {
      race = s;
    });
  });

  $effect(() => {
    strategy = syncPolledStrategy();
    const id = window.setInterval(() => {
      strategy = syncPolledStrategy();
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
  const canRelease = $derived(
    race.phase === "racing" &&
      strategy.isBoxing &&
      strategy.pitPhase === "stopped" &&
      strategy.pitServiceDone &&
      strategy.pitHoldTraffic,
  );

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
</script>

<aside
  class="pit-panel flex h-full min-h-0 flex-col gap-3 overflow-y-auto border-b border-amber-500/15 bg-[var(--pw-panel)] p-3 text-white md:border-b-0 md:border-r md:p-4"
  aria-label="Strategy controls"
>
  <div>
    <p class="font-mono text-[10px] tracking-[0.28em] text-amber-400 uppercase">Pit wall · Call</p>
    <h2 class="font-display mt-0.5 text-lg tracking-tight text-slate-50 md:text-xl">
      Strategy desk
    </h2>
    <p class="mt-0.5 text-[11px] leading-snug text-slate-400 md:text-xs">
      Box, compound, engine — keep YOU fast to the flag.
    </p>
  </div>

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

  {#if urgeBox && race.phase === "racing" && !strategy.isBoxing}
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

  <section class="space-y-2" aria-labelledby="box-call-label">
    <p
      id="box-call-label"
      class="font-mono text-[9px] tracking-[0.22em] text-slate-500 uppercase"
    >
      Primary call
    </p>
    <button
      type="button"
      class="{pwButtonClass(strategy.isBoxing ? 'secondary' : 'primary', 'md', {
        fullWidth: true,
        className: urgeBox && !strategy.isBoxing ? 'ring-2 ring-rose-400/70' : '',
      })}"
      {disabled}
      aria-label={strategy.isBoxing ? "In the box" : urgeBox ? "Box now urgent" : "Box next lap"}
      onclick={handleBox}
    >
      {strategy.isBoxing ? "In the box…" : urgeBox ? "Box now (urgent)" : "Box next lap"}
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

  <section class="space-y-2" aria-labelledby="stint-label">
    <p id="stint-label" class="font-mono text-[9px] tracking-[0.22em] text-slate-500 uppercase">
      Stint levers
    </p>

    <label class="block space-y-1">
      <span class="font-mono text-[10px] text-slate-400">Engine</span>
      <select
        class={selectClass}
        value={strategy.engineMode}
        disabled={stintSetupDisabled}
        aria-label="Engine mode"
        onchange={handleEngineChange}
      >
        <option value="push">Push</option>
        <option value="standard">Standard</option>
        <option value="save">Save</option>
      </select>
    </label>
    <p class="text-[11px] text-slate-500">{ENGINE_COPY[strategy.engineMode]}</p>

    <label class="block space-y-1">
      <span class="font-mono text-[10px] text-slate-400">
        {preRaceGrid ? "Starting compound" : "Compound (queues box)"}
      </span>
      <select
        class={selectClass}
        value={strategy.currentCompound}
        disabled={stintSetupDisabled}
        aria-label="Tyre compound"
        onchange={handleCompoundChange}
      >
        <option value="soft">Soft</option>
        <option value="medium">Medium</option>
        <option value="hard">Hard</option>
        <option value="intermediate">Intermediate</option>
        <option value="wet">Wet</option>
      </select>
    </label>
    <p class="text-[11px] text-slate-500">{COMPOUND_COPY[strategy.currentCompound]}</p>
  </section>

  <label class="block space-y-1">
    <span class="font-mono text-[10px] text-slate-400">Weather scenario</span>
    <select
      class={selectClass}
      value={race.weatherOverride}
      aria-label="Weather scenario"
      onchange={handleWeatherChange}
    >
      <option value="auto">Auto (Sepang API)</option>
      <option value="dry">Dry</option>
      <option value="light">Light rain</option>
      <option value="heavy">Heavy rain</option>
    </select>
  </label>

  <div
    class="mt-auto shrink-0 border-t border-white/10 pt-2 font-mono text-[10px] leading-snug text-slate-500"
  >
    Wear → box → pits → rain.
  </div>
</aside>
