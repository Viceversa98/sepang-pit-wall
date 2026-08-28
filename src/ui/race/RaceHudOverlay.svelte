<script lang="ts">
  import { PIT_LANE_LIMIT_KMH } from "@/lib/pitStop";
  import { defaultHud, syncPolledHud } from "@/stores/polledRaceTelemetry";
  import { useRaceStore, type CameraMode, type PitPhase } from "@/stores/raceStore";

  const pitPhaseLabel = (
    phase: PitPhase | null,
    hold: boolean,
    pending: boolean,
    boxing: boolean,
  ): string | null => {
    if (!boxing && !pending) return null;
    if (!boxing && pending) return "Box next lap — pit entry";
    if (phase === "in") return "In pit lane";
    if (phase === "stopped" && hold) return "Hold — traffic";
    if (phase === "stopped") return "Servicing — tire change";
    if (phase === "out") return "Pit exit";
    return "In the pits";
  };

  let race = $state(useRaceStore.getState());
  let hud = $state(defaultHud());

  $effect(() => {
    return useRaceStore.subscribe((s) => {
      race = s;
    });
  });

  $effect(() => {
    hud = syncPolledHud();
    const id = window.setInterval(() => {
      hud = syncPolledHud();
    }, 120);
    return () => window.clearInterval(id);
  });

  const pitCopy = $derived(
    pitPhaseLabel(hud.pitPhase, hud.pitHoldTraffic, hud.pendingBox, hud.isBoxing),
  );

  const showPitLimit = $derived(
    hud.isBoxing &&
      (hud.pitPhase === "in" || hud.pitPhase === "out" || hud.pitPhase === "stopped"),
  );

  const handleCameraMode = (mode: CameraMode) => {
    useRaceStore.getState().setCameraMode(mode);
  };
</script>

{#if race.phase !== "landing"}
  <div class="pointer-events-none absolute inset-0 z-10 p-3 md:p-4">
    <div class="flex flex-col items-start gap-2">
      <div class="rounded-sm border border-amber-500/35 bg-black/55 px-3 py-2 backdrop-blur-sm">
        <p class="font-mono text-[9px] tracking-[0.28em] text-amber-400/90 uppercase">You</p>
        <p class="font-display text-3xl leading-none text-white tabular-nums">P{hud.pos}</p>
        <p class="mt-1 font-mono text-[10px] text-slate-400">
          LAP {hud.lap}/{race.totalLaps}
        </p>
      </div>

      <div
        class="pointer-events-auto flex rounded-sm border border-white/20 bg-black/60 p-0.5 backdrop-blur-sm"
        role="group"
        aria-label="Camera mode"
      >
        <button
          type="button"
          class="rounded-sm px-2.5 py-1.5 font-mono text-[10px] tracking-[0.14em] uppercase transition-colors {race.cameraMode ===
          'overview'
            ? 'bg-amber-500/25 text-amber-100'
            : 'text-slate-400 hover:text-slate-200'}"
          aria-pressed={race.cameraMode === "overview"}
          aria-label={race.cameraMode === "overview" && !race.overviewFollow
            ? "Re-follow YOU in overview"
            : "Overview camera"}
          onclick={() => handleCameraMode("overview")}
        >
          {race.cameraMode === "overview" && !race.overviewFollow ? "Re-follow" : "Overview"}
        </button>
        <button
          type="button"
          class="rounded-sm px-2.5 py-1.5 font-mono text-[10px] tracking-[0.14em] uppercase transition-colors {race.cameraMode ===
          'follow'
            ? 'bg-rose-500/30 text-rose-100'
            : 'text-slate-400 hover:text-slate-200'}"
          aria-pressed={race.cameraMode === "follow"}
          aria-label="Follow YOU"
          onclick={() => handleCameraMode("follow")}
        >
          Follow YOU
        </button>
      </div>

      {#if race.raceControl !== "green"}
        <div
          class="rounded-sm border border-amber-400/40 bg-black/65 px-2.5 py-1.5 backdrop-blur-sm"
          role="status"
          aria-live="polite"
        >
          <p class="font-mono text-[11px] tracking-[0.16em] text-amber-200 uppercase">
            Flag · {race.raceControl}
          </p>
        </div>
      {/if}

      {#if race.drsActive}
        <div
          class="rounded-sm border border-emerald-400/40 bg-black/65 px-2.5 py-1.5 backdrop-blur-sm"
          role="status"
        >
          <p class="font-mono text-[11px] tracking-[0.16em] text-emerald-200 uppercase">DRS open</p>
        </div>
      {/if}

      {#if race.blueFlagActive}
        <div
          class="rounded-sm border border-sky-400/45 bg-black/65 px-2.5 py-1.5 backdrop-blur-sm"
          role="status"
        >
          <p class="font-mono text-[11px] tracking-[0.16em] text-sky-200 uppercase">Blue flag</p>
        </div>
      {/if}

      {#if race.playerPenalties.length > 0}
        <div
          class="rounded-sm border border-rose-400/40 bg-black/65 px-2.5 py-1.5 backdrop-blur-sm"
          role="status"
        >
          <p class="font-mono text-[10px] text-rose-200">
            Penalty · {race.playerPenalties.join(", ")}
          </p>
        </div>
      {/if}

      {#if hud.incidentLabel}
        <div
          class="rounded-sm border border-rose-500/50 bg-rose-950/70 px-2.5 py-1.5 backdrop-blur-sm"
          role="alert"
          aria-live="assertive"
        >
          <p class="font-mono text-[11px] tracking-[0.2em] text-rose-200 uppercase">
            {hud.incidentLabel}
          </p>
          <p class="font-mono text-[10px] text-rose-200/70">Grip {hud.gripPct}%</p>
        </div>
      {/if}

      {#if showPitLimit || pitCopy}
        <div
          class="rounded-sm border border-cyan-400/35 bg-black/65 px-2.5 py-1.5 backdrop-blur-sm"
          role="status"
          aria-live="polite"
        >
          {#if showPitLimit}
            <p class="font-mono text-[11px] tracking-[0.16em] text-cyan-200 tabular-nums uppercase">
              Pit lane {PIT_LANE_LIMIT_KMH}
            </p>
          {/if}
          {#if pitCopy}
            <p class="font-mono text-[10px] text-slate-300">{pitCopy}</p>
          {/if}
          {#if race.unsafeReleasePenaltyMs > 0}
            <p class="font-mono text-[10px] text-rose-300">
              Unsafe release +{(race.unsafeReleasePenaltyMs / 1000).toFixed(0)}s
            </p>
          {/if}
        </div>
      {/if}
    </div>
  </div>
{/if}
