<script lang="ts">
  import { CHAPTERS, getMission, isChapterUnlocked } from "@/lib/academy/curriculum";
  import { unlockRaceAudioFromGesture } from "@/lib/raceAudio";
  import { useAcademyStore } from "@/stores/academyStore";
  import { useRaceStore } from "@/stores/raceStore";
  import Logo from "@/ui/brand/Logo.svelte";
  import { pwButtonClass } from "@/ui/pwButton";

  let academy = $state(useAcademyStore.getState());

  $effect(() => {
    return useAcademyStore.subscribe((s) => {
      academy = s;
    });
  });

  const completed = $derived(new Set(academy.completedIds));

  const handleStartMission = (missionId: string) => {
    if (!academy.isUnlocked(missionId)) return;
    const mission = getMission(missionId);
    if (!mission) return;
    unlockRaceAudioFromGesture();
    academy.setActiveMission(missionId);
    useRaceStore.getState().startMissionRace({
      totalLaps: mission.setup.totalLaps,
      weatherOverride: mission.setup.weatherOverride,
      startCompound: mission.setup.startCompound,
      autoBegin: mission.setup.autoBegin,
    });
  };

  const handleContinue = () => {
    const id = academy.nextId();
    if (id) handleStartMission(id);
  };

  const handleMissionKeyDown = (missionId: string, e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleStartMission(missionId);
    }
  };
</script>

<div class="relative flex min-h-dvh flex-1 flex-col overflow-hidden bg-[var(--background)] text-white">
  <div
    class="pointer-events-none absolute inset-0"
    style:background="radial-gradient(ellipse 70% 50% at 80% 10%, rgba(34,211,238,0.12), transparent 50%), linear-gradient(165deg, #050b16 0%, #0b1220 55%, #111827 100%)"
  ></div>
  <div class="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-5 py-10 md:px-8">
    <header class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="flex items-center gap-3">
          <Logo variant="mark" class="size-10 shrink-0 rounded-sm" />
          <p class="font-mono text-[10px] tracking-[0.32em] text-amber-400 uppercase">
            Rules Academy
          </p>
        </div>
        <h1 class="font-display mt-2 text-3xl tracking-tight md:text-4xl">
          Learn F1 by calling the race
        </h1>
        <p class="mt-2 max-w-lg text-sm text-slate-400">
          Short missions on the Sepang pit wall. One rule at a time — pause, decide, learn.
        </p>
      </div>
      <button
        type="button"
        class={pwButtonClass("secondary", "touch")}
        aria-label="Back to landing"
        onclick={() => academy.closeHubToLanding()}
      >
        Back
      </button>
    </header>

    <div class="flex flex-wrap gap-2">
      <button
        type="button"
        class={pwButtonClass("primary", "md")}
        disabled={!academy.nextId()}
        aria-label="Continue next unlocked mission"
        onclick={handleContinue}
      >
        {academy.nextId() ? "Continue next mission" : "All missions complete"}
      </button>
      <p class="self-center font-mono text-[11px] text-slate-500">
        {academy.completedIds.length} passed
      </p>
    </div>

    <div class="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pb-8">
      {#each CHAPTERS as chapter (chapter.id)}
        {@const unlocked = isChapterUnlocked(chapter.id, completed)}
        <section
          class="border border-white/10 bg-black/25 px-4 py-3 {unlocked ? '' : 'opacity-45'}"
          aria-label={chapter.title}
        >
          <div class="flex items-baseline justify-between gap-2">
            <h2 class="font-display text-lg text-slate-50">{chapter.title}</h2>
            {#if !unlocked}
              <span class="font-mono text-[10px] tracking-wider text-slate-500 uppercase">
                Locked
              </span>
            {/if}
          </div>
          <p class="mt-1 text-xs text-slate-400">{chapter.blurb}</p>
          <ul class="mt-3 space-y-2">
            {#each chapter.missionIds as mid (mid)}
              {@const mission = getMission(mid)}
              {#if mission}
                {@const open = academy.isUnlocked(mid)}
                {@const done = completed.has(mid)}
                {@const stars = academy.starsByMission[mid] ?? 0}
                <li>
                  <button
                    type="button"
                    tabindex={0}
                    disabled={!open}
                    aria-label="Mission {mission.title}"
                    aria-disabled={!open}
                    onclick={() => handleStartMission(mid)}
                    onkeydown={(e) => handleMissionKeyDown(mid, e)}
                    class="flex min-h-11 w-full items-center justify-between gap-3 rounded-sm border px-3 py-2 text-left transition {open
                      ? 'border-white/15 bg-white/5 hover:border-amber-400/40 hover:bg-amber-500/10'
                      : 'cursor-not-allowed border-white/5 bg-transparent'}"
                  >
                    <span>
                      <span class="block font-mono text-[11px] text-slate-200">{mission.title}</span>
                      <span class="mt-0.5 block text-[11px] text-slate-500">{mission.learnLine}</span>
                    </span>
                    <span class="shrink-0 font-mono text-[10px] text-amber-300/90">
                      {done ? `${"★".repeat(stars)}${"☆".repeat(3 - stars)}` : open ? "Play" : "—"}
                    </span>
                  </button>
                </li>
              {/if}
            {/each}
          </ul>
        </section>
      {/each}
    </div>
  </div>
</div>
