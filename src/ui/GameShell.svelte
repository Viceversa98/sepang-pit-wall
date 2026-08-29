<script lang="ts">
  import { mountMissionBridgeRuntime } from "@/academy/missionBridgeRuntime";
  import { mountRaceAudioBridge } from "@/audio/raceAudioBridge";
  import { unlockRaceAudioFromGesture } from "@/lib/raceAudio";
  import { getMission } from "@/lib/academy/curriculum";
  import {
    getRaceLayoutMode,
    isMobileRaceLayout,
    subscribeRaceLayoutMode,
    type RaceLayoutMode,
  } from "@/lib/viewportLayout";
  import { useAcademyStore } from "@/stores/academyStore";
  import { useRaceStore } from "@/stores/raceStore";
  import AcademyHub from "@/ui/academy/AcademyHub.svelte";
  import CoachOverlay from "@/ui/academy/CoachOverlay.svelte";
  import MissionDebrief from "@/ui/academy/MissionDebrief.svelte";
  import Logo from "@/ui/brand/Logo.svelte";
  import AuthorChatBubble from "@/ui/brand/AuthorChatBubble.svelte";
  import LandingSetup from "@/ui/LandingSetup.svelte";
  import StrategyControls from "@/ui/StrategyControls.svelte";
  import TelemetryDashboard from "@/ui/TelemetryDashboard.svelte";
  import MobileRaceHud from "@/ui/race/MobileRaceHud.svelte";
  import PodiumOverlay from "@/ui/race/PodiumOverlay.svelte";
  import RaceHudOverlay from "@/ui/race/RaceHudOverlay.svelte";
  import { setRaceLayoutContext } from "@/ui/race/raceLayoutContext";
  import StartLightsHud from "@/ui/race/StartLightsHud.svelte";
  import RaceCanvas from "@/ui/RaceCanvas.svelte";
  import { pwButtonClass } from "@/ui/pwButton";

  let race = $state(useRaceStore.getState());
  let academy = $state(useAcademyStore.getState());
  let layoutMode = $state<RaceLayoutMode>(getRaceLayoutMode());

  setRaceLayoutContext(() => layoutMode);

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
    return subscribeRaceLayoutMode((mode) => {
      layoutMode = mode;
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

  const mobileLayout = $derived(isMobileRaceLayout(layoutMode));

  const raceGridClass = $derived(
    layoutMode === "mobilePortrait"
      ? "grid-cols-1 grid-rows-[minmax(0,1fr)_auto]"
      : layoutMode === "mobileLandscape"
        ? "grid-cols-[minmax(200px,28%)_minmax(0,1fr)] grid-rows-1"
        : "grid-cols-1 grid-rows-[minmax(0,42dvh)_minmax(0,1fr)] md:grid-cols-[minmax(220px,22%)_minmax(0,1fr)] md:grid-rows-1",
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

  const handleBeginRace = () => {
    unlockRaceAudioFromGesture();
    useRaceStore.getState().beginRace();
  };
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
      class="pw-safe-top flex shrink-0 items-center justify-between gap-2 border-b border-[var(--pw-line)] bg-[var(--pw-panel)] px-3 py-2 md:gap-3 md:px-4 md:py-2.5"
    >
      <div class="flex min-w-0 items-center gap-2 md:gap-3">
        <Logo variant="mark" class="size-8 shrink-0 rounded-sm md:size-9" />
        <div class="min-w-0">
          <p class="font-mono text-[9px] tracking-[0.28em] text-amber-400 uppercase md:text-[10px] md:tracking-[0.3em]">
            Sepang Pit Wall
          </p>
          <p class="truncate text-[11px] text-slate-400 md:text-xs">
            {race.playMode === "mission" && missionTitle
              ? `Academy · ${missionTitle}`
              : "Strategy desk · circuit spectator"}
          </p>
        </div>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        {#if race.phase === "ready"}
          <button
            type="button"
            class={pwButtonClass("primary", "touch", { className: "px-3 text-xs" })}
            aria-label="Start race lights sequence"
            onclick={handleBeginRace}
          >
            Start
          </button>
        {/if}
        <p
          class="rounded-sm border px-2 py-1 font-mono text-[10px] tracking-[0.14em] uppercase md:px-2.5 md:text-[11px] md:tracking-[0.18em] {phaseBadgeClass}"
          aria-live="polite"
        >
          {phaseBadge}
        </p>
      </div>
    </header>

    {#if race.phase === "ready" && layoutMode !== "mobilePortrait"}
      <div
        class="shrink-0 border-b border-cyan-500/25 bg-cyan-950/30 px-3 py-1.5 font-mono text-[10px] text-cyan-100/90 md:px-4 md:py-2 md:text-[11px]"
        role="status"
      >
        {#if mobileLayout}
          Grid ready — set strategy, then <span class="text-amber-300">Start</span>.
        {:else}
          Cars on the grid — set compound & engine in the strategy panel, then press
          <span class="text-amber-300">Start</span> for the FIA lights sequence.
        {/if}
      </div>
    {/if}

    <div class="grid min-h-0 flex-1 overflow-hidden {raceGridClass}">
      <StrategyControls
        class={layoutMode === "mobilePortrait"
          ? "order-2 row-start-2"
          : layoutMode === "mobileLandscape"
            ? "order-1"
            : ""}
      />
      <section
        class="relative z-0 h-full min-h-[min(38dvh,360px)] w-full touch-none overflow-hidden overscroll-none {layoutMode === 'mobilePortrait'
          ? 'order-1 row-start-1'
          : layoutMode === 'mobileLandscape'
            ? 'order-2'
            : ''}"
        aria-label="3D race canvas"
      >
        {#if mobileLayout}
          <MobileRaceHud {layoutMode} />
        {:else}
          <RaceHudOverlay />
          <TelemetryDashboard />
        {/if}
        <StartLightsHud {layoutMode} />
        <RaceCanvas />
        <CoachOverlay />
        {#if race.phase === "finished" && race.playMode !== "mission"}
          <PodiumOverlay />
        {/if}
        {#if layoutMode !== "mobilePortrait"}
          <AuthorChatBubble
            variant="inline"
            align="right"
            class="bottom-4 right-4 pr-0"
          />
        {/if}
      </section>
    </div>
  </div>
{/if}
