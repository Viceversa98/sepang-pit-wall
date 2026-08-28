<script lang="ts">
  import { mountMissionBridgeRuntime } from "@/academy/missionBridgeRuntime";
  import { mountRaceAudioBridge } from "@/audio/raceAudioBridge";
  import { getMission } from "@/lib/academy/curriculum";
  import { useAcademyStore } from "@/stores/academyStore";
  import { useRaceStore } from "@/stores/raceStore";
  import AcademyHub from "@/ui/academy/AcademyHub.svelte";
  import CoachOverlay from "@/ui/academy/CoachOverlay.svelte";
  import MissionDebrief from "@/ui/academy/MissionDebrief.svelte";
  import Logo from "@/ui/brand/Logo.svelte";
  import LandingSetup from "@/ui/LandingSetup.svelte";
  import StrategyControls from "@/ui/StrategyControls.svelte";
  import TelemetryDashboard from "@/ui/TelemetryDashboard.svelte";
  import PodiumOverlay from "@/ui/race/PodiumOverlay.svelte";
  import RaceHudOverlay from "@/ui/race/RaceHudOverlay.svelte";
  import StartLightsHud from "@/ui/race/StartLightsHud.svelte";
  import RaceCanvas from "@/ui/RaceCanvas.svelte";
  import { pwButtonClass } from "@/ui/pwButton";

  let race = $state(useRaceStore.getState());
  let academy = $state(useAcademyStore.getState());

  $effect(() => {
    return useRaceStore.subscribe((s) => {
      race = s;
    });
  });

  $effect(() => {
    return useAcademyStore.subscribe((s) => {
      academy = s;
    });
  });

  $effect(() => {
    void useRaceStore.getState().loadWeather();
    const stopAudio = mountRaceAudioBridge();
    const stopMission = mountMissionBridgeRuntime();
    return () => {
      stopAudio();
      stopMission();
      useRaceStore.getState().stop();
    };
  });

  const missionTitle = $derived(
    academy.activeMissionId ? getMission(academy.activeMissionId)?.title : null,
  );

  const controlBadge = $derived(
    race.raceControl !== "green" && race.phase === "racing"
      ? race.raceControl === "sc"
        ? "SAFETY CAR"
        : race.raceControl === "vsc"
          ? "VSC"
          : race.raceControl === "doubleYellow"
            ? "DOUBLE YELLOW"
            : race.raceControl.toUpperCase()
      : null,
  );

  const phaseBadge = $derived(
    controlBadge ??
      (race.phase === "ready"
        ? "GRID READY"
        : race.phase === "starting"
          ? race.startLightsGreen
            ? "GO"
            : race.startLightCount === 0
              ? "GRID SET"
              : `LIGHTS ${race.startLightCount}/5`
          : race.phase === "finished"
            ? "FLAG"
            : race.startLightsOut
              ? "LIGHTS OUT"
              : "GREEN"),
  );

  const phaseBadgeClass = $derived(
    race.phase === "ready"
      ? "border-amber-400/40 text-amber-200"
      : race.phase === "starting"
        ? "border-red-500/45 text-red-300"
        : race.phase === "finished"
          ? "border-amber-400/40 text-amber-200"
          : "border-emerald-500/35 text-emerald-300",
  );

  const handleBeginRace = () => useRaceStore.getState().beginRace();
</script>

{#if race.phase === "landing"}
  {#if academy.screen === "hub"}
    <AcademyHub />
  {:else if academy.screen === "debrief"}
    <MissionDebrief />
  {:else}
    <LandingSetup />
  {/if}
{:else}
  <div class="flex h-dvh flex-1 flex-col overflow-hidden bg-[var(--background)] text-white">
    <header
      class="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--pw-line)] bg-[var(--pw-panel)] px-4 py-2.5"
    >
      <div class="flex items-center gap-3">
        <Logo variant="mark" class="size-9 shrink-0 rounded-sm" />
        <div>
          <p class="font-mono text-[10px] tracking-[0.3em] text-amber-400 uppercase">
            Sepang Pit Wall
          </p>
          <p class="text-xs text-slate-400">
            {race.playMode === "mission" && missionTitle
              ? `Academy · ${missionTitle}`
              : "Strategy desk · circuit spectator"}
          </p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        {#if race.phase === "ready"}
          <button
            type="button"
            class={pwButtonClass("primary", "sm")}
            aria-label="Start race lights sequence"
            onclick={handleBeginRace}
          >
            Start
          </button>
        {/if}
        <p
          class="rounded-sm border px-2.5 py-1 font-mono text-[11px] tracking-[0.18em] uppercase {phaseBadgeClass}"
          aria-live="polite"
        >
          {phaseBadge}
        </p>
      </div>
    </header>

    {#if race.phase === "ready"}
      <div
        class="shrink-0 border-b border-cyan-500/25 bg-cyan-950/30 px-4 py-2 font-mono text-[11px] text-cyan-100/90"
      >
        Cars on the grid — press <span class="text-amber-300">Start</span> for the FIA lights
        sequence.
      </div>
    {/if}

    <div
      class="grid min-h-0 flex-1 overflow-hidden grid-cols-1 grid-rows-[minmax(0,42dvh)_minmax(0,1fr)] md:grid-cols-[minmax(220px,22%)_minmax(0,1fr)] md:grid-rows-1"
    >
      <StrategyControls />
      <section class="relative min-h-0 overflow-hidden" aria-label="3D race canvas">
        <RaceHudOverlay />
        <StartLightsHud />
        <RaceCanvas />
        <TelemetryDashboard />
        <CoachOverlay />
        {#if race.phase === "finished" && race.playMode !== "mission"}
          <PodiumOverlay />
        {/if}
      </section>
    </div>
  </div>
{/if}
