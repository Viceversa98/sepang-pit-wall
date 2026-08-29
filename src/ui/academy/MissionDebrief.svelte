<script lang="ts">
  import { unlockRaceAudioFromGesture } from "@/lib/raceAudio";
  import { getMission, nextMissionId } from "@/lib/academy/curriculum";
  import { useAcademyStore } from "@/stores/academyStore";
  import { useRaceStore } from "@/stores/raceStore";
  import { pwButtonClass } from "@/ui/pwButton";

  let academy = $state(useAcademyStore.getState());

  $effect(() => {
    return useAcademyStore.subscribe((s) => {
      academy = s;
    });
  });

  const mission = $derived(
    academy.lastResult ? getMission(academy.lastResult.missionId) : undefined,
  );

  const copy = $derived(
    academy.lastResult
      ? academy.lastResult.passed
        ? mission?.debriefPass
        : mission?.debriefFail
      : undefined,
  );

  const handleNext = () => {
    const next = nextMissionId(new Set(academy.completedIds));
    if (!next) {
      academy.openHub();
      return;
    }
    const def = getMission(next);
    if (!def) {
      academy.openHub();
      return;
    }
    unlockRaceAudioFromGesture();
    academy.setActiveMission(next);
    useRaceStore.getState().startMissionRace({
      totalLaps: def.setup.totalLaps,
      weatherOverride: def.setup.weatherOverride,
      startCompound: def.setup.startCompound,
      autoBegin: def.setup.autoBegin,
    });
  };

  const handleRetry = () => {
    if (!mission) return;
    unlockRaceAudioFromGesture();
    academy.setActiveMission(mission.id);
    useRaceStore.getState().startMissionRace({
      totalLaps: mission.setup.totalLaps,
      weatherOverride: mission.setup.weatherOverride,
      startCompound: mission.setup.startCompound,
      autoBegin: mission.setup.autoBegin,
    });
  };
</script>

{#if !academy.lastResult}
  <div class="flex min-h-dvh items-center justify-center bg-[var(--background)] text-slate-400">
    <button
      type="button"
      class={pwButtonClass("secondary", "md")}
      aria-label="Open academy hub"
      onclick={() => academy.openHub()}
    >
      Back to Academy
    </button>
  </div>
{:else}
  <div
    class="relative flex min-h-dvh flex-1 items-center justify-center bg-[var(--background)] px-4 text-white"
  >
    <div
      class="pointer-events-none absolute inset-0"
      style:background={academy.lastResult.passed
        ? "radial-gradient(ellipse 60% 40% at 50% 30%, rgba(16,185,129,0.18), transparent 55%)"
        : "radial-gradient(ellipse 60% 40% at 50% 30%, rgba(244,63,94,0.16), transparent 55%)"}
    ></div>
    <div
      class="relative z-10 w-full max-w-lg border border-white/15 bg-[var(--pw-panel)]/95 px-5 py-7 sm:px-8"
      role="dialog"
      aria-modal="true"
      aria-label="Mission debrief"
    >
      <p class="font-mono text-[10px] tracking-[0.28em] text-amber-400 uppercase">
        {academy.lastResult.passed ? "Lesson passed" : "Try again"}
      </p>
      <h2 class="font-display mt-2 text-2xl">{mission?.title ?? "Mission"}</h2>
      <p class="mt-3 text-sm leading-relaxed text-slate-300">{copy}</p>
      <p class="mt-4 font-mono text-[11px] text-slate-500">
        Correct calls {academy.lastResult.correctCount}/{academy.lastResult.totalRequired}
        {academy.lastResult.passed ? ` · ${"★".repeat(academy.lastResult.stars)}` : ""}
      </p>
      <div class="mt-7 flex flex-wrap gap-2">
        {#if academy.lastResult.passed}
          <button
            type="button"
            class={pwButtonClass("primary", "md")}
            aria-label="Next mission"
            onclick={handleNext}
          >
            Next mission
          </button>
        {:else}
          <button
            type="button"
            class={pwButtonClass("primary", "md")}
            aria-label="Retry mission"
            onclick={handleRetry}
          >
            Retry
          </button>
        {/if}
        <button
          type="button"
          class={pwButtonClass("secondary", "md")}
          aria-label="Academy hub"
          onclick={() => academy.openHub()}
        >
          Academy hub
        </button>
        <button
          type="button"
          class={pwButtonClass("secondary", "md")}
          aria-label="Back to landing"
          onclick={() => academy.closeHubToLanding()}
        >
          Landing
        </button>
      </div>
    </div>
  </div>
{/if}
