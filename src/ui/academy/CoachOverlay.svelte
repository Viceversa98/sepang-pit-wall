<script lang="ts">
  import { getMission } from "@/lib/academy/curriculum";
  import type { ChoiceEffect, PlayerChoice } from "@/lib/academy/types";
  import { useAcademyStore } from "@/stores/academyStore";
  import { useRaceStore } from "@/stores/raceStore";
  import { pwButtonClass } from "@/ui/pwButton";

  const applyEffect = (effect: ChoiceEffect | undefined) => {
    if (!effect || effect.type === "none") return;
    const race = useRaceStore.getState();
    switch (effect.type) {
      case "setCompound":
        race.setCompound(effect.compound);
        break;
      case "requestBox":
        race.requestBoxNextLap();
        break;
      case "releaseSafe":
        race.releasePlayerForced(false);
        break;
      case "releaseUnsafe":
        race.releasePlayerForced(true);
        break;
      case "setEngine":
        race.setEngineMode(effect.mode);
        break;
      case "setControl":
        race.setRaceControl(effect.flag);
        break;
      case "clearControl":
        race.clearRaceControl();
        break;
      case "addPenalty":
        race.addPlayerPenalty(effect.kind);
        break;
      case "abortStart":
        race.abortStartSequence();
        break;
      case "goRacing":
        if (race.phase === "ready") race.beginRace();
        break;
    }
  };

  let academy = $state(useAcademyStore.getState());
  let race = $state(useRaceStore.getState());

  $effect(() => {
    return useAcademyStore.subscribe((s) => {
      academy = s;
    });
  });

  $effect(() => {
    return useRaceStore.subscribe((s) => {
      race = s;
    });
  });

  const mission = $derived(
    academy.activeMissionId ? getMission(academy.activeMissionId) : undefined,
  );

  const beat = $derived(
    mission && academy.activeBeatId
      ? mission.beats.find((b) => b.id === academy.activeBeatId)
      : undefined,
  );

  const visible = $derived(
    academy.coachOpen &&
      !!academy.activeBeatId &&
      !!academy.activeMissionId &&
      race.playMode === "mission" &&
      !!mission &&
      !!beat,
  );

  const handleChoice = (choice: PlayerChoice) => {
    if (!mission || !beat) return;
    applyEffect(choice.effect);
    academy.answerBeat(choice);

    const nextAnswers = [
      ...academy.answers.filter((a) => a.beatId !== beat.id),
      { beatId: beat.id, choiceId: choice.id, correct: choice.correct },
    ];
    const allDone = mission.requiredCorrectBeatIds.every((id) =>
      nextAnswers.some((a) => a.beatId === id),
    );
    if (allDone) {
      window.setTimeout(() => {
        useAcademyStore.getState().finishMissionSession();
        useRaceStore.getState().resetToLanding();
        useAcademyStore.setState({ screen: "debrief" });
      }, 320);
    }
  };
</script>

{#if visible && mission && beat}
  <div
    class="absolute inset-0 z-50 flex items-end justify-center bg-slate-950/70 p-3 backdrop-blur-sm sm:items-center"
    role="dialog"
    aria-modal="true"
    aria-label={beat.title}
  >
    <div
      class="w-full max-w-lg border border-cyan-500/30 bg-[var(--pw-panel)]/95 px-4 py-5 shadow-[0_0_40px_rgba(34,211,238,0.12)] sm:px-6"
    >
      <p class="font-mono text-[10px] tracking-[0.28em] text-cyan-300 uppercase">
        Coach · {mission.title}
      </p>
      <h2 class="font-display mt-2 text-xl text-white">{beat.title}</h2>
      <p class="mt-2 text-sm leading-relaxed text-slate-300">{beat.body}</p>
      <div class="mt-5 flex flex-col gap-2" role="group" aria-label="Your call">
        {#each beat.choices as choice (choice.id)}
          <button
            type="button"
            class="{pwButtonClass('secondary', 'md', {
              fullWidth: true,
              className: 'justify-start text-left',
            })}"
            aria-label={choice.label}
            onclick={() => handleChoice(choice)}
          >
            {choice.label}
          </button>
        {/each}
      </div>
    </div>
  </div>
{/if}
