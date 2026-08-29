<script lang="ts">
  import {
    PIT_STALL_COUNT,
    PLAYER_LIVERIES,
    RACE_LAP_OPTIONS,
    useRaceStore,
    type EngineMode,
    type TyreCompound,
  } from "@/stores/raceStore";
  import { unlockRaceAudioFromGesture } from "@/lib/raceAudio";
  import { useAcademyStore } from "@/stores/academyStore";
  import CarShowroom from "@/ui/CarShowroom.svelte";
  import AuthorChatBubble from "@/ui/brand/AuthorChatBubble.svelte";
  import Logo from "@/ui/brand/Logo.svelte";
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

  const selectClass = pwSelectClass();

  let race = $state(useRaceStore.getState());

  $effect(() => {
    return useRaceStore.subscribe((s) => {
      race = s;
    });
  });

  $effect(() => {
    useAcademyStore.getState().hydrate();
  });

  const handleLiveryKeyDown = (hex: string, e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      useRaceStore.getState().setPlayerLivery(hex);
    }
  };

  const handlePitKeyDown = (index: number, e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      useRaceStore.getState().setPlayerPitBox(index);
    }
  };

  const handleOpenHub = () => useAcademyStore.getState().openHub();
  const handleEnterRace = () => {
    unlockRaceAudioFromGesture();
    useRaceStore.getState().enterRaceDesk();
  };

  const handleEngineChange = (e: Event) => {
    const value = (e.currentTarget as HTMLSelectElement).value as EngineMode;
    useRaceStore.getState().setEngineMode(value);
  };

  const handleCompoundChange = (e: Event) => {
    const value = (e.currentTarget as HTMLSelectElement).value as TyreCompound;
    useRaceStore.getState().setCompound(value);
  };

  const handleLapSelect = (laps: number) => {
    useRaceStore.getState().setTotalLaps(laps);
  };

  const handleLapKeyDown = (laps: number, e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleLapSelect(laps);
    }
  };
</script>

<div
  class="relative flex h-dvh flex-col overflow-hidden bg-[var(--background)] text-white"
>
  <div
    class="pointer-events-none absolute inset-0"
    style:background="radial-gradient(ellipse 80% 55% at 18% 88%, rgba(245,158,11,0.22), transparent 55%), radial-gradient(ellipse 60% 40% at 92% 12%, rgba(34,211,238,0.12), transparent 50%), linear-gradient(165deg, #050b16 0%, #0b1220 55%, #111827 100%)"
  ></div>
  <div
    class="pointer-events-none absolute inset-0 opacity-[0.07]"
    style:background-image="linear-gradient(rgba(248,250,252,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(248,250,252,0.5) 1px, transparent 1px)"
    style:background-size="48px 48px"
    style:mask-image="linear-gradient(180deg, transparent, black 30%, black 70%, transparent)"
  ></div>

  <div class="relative z-10 min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
    <div
      class="grid min-h-0 grid-cols-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(280px,0.95fr)]"
    >
      <div
        class="h-[34dvh] max-h-[300px] w-full shrink-0 overflow-hidden lg:h-full lg:max-h-none lg:min-h-[220px]"
        aria-hidden="true"
      >
        <CarShowroom />
      </div>

      <main class="flex flex-col gap-6 px-6 py-8 pb-4 md:px-12 lg:justify-center lg:py-16">
      <div>
        <Logo variant="horizontal" priority class="h-14 w-auto max-w-[min(100%,20rem)] md:h-20" />
        <p class="font-mono mt-4 text-xs tracking-[0.35em] text-amber-400 uppercase">
          Sepang International Circuit
        </p>
        <h1 class="sr-only">Sepang Pit Wall</h1>
        <p class="mt-3 max-w-md text-sm text-slate-300 md:text-base">
          Learn every F1 sporting rule in short pit-wall missions — or jump into a free race.
        </p>
      </div>

      <section aria-label="Choose car livery">
        <p class="font-mono text-[10px] tracking-[0.28em] text-slate-400 uppercase">Your car</p>
        <div class="mt-3 flex flex-wrap gap-2">
          {#each PLAYER_LIVERIES as livery (livery.id)}
            {@const selected = race.selectedPlayerColor === livery.color}
            <button
              type="button"
              tabindex="0"
              aria-label="Livery {livery.name}"
              aria-pressed={selected}
              onclick={() => useRaceStore.getState().setPlayerLivery(livery.color)}
              onkeydown={(e) => handleLiveryKeyDown(livery.color, e)}
              class="flex h-11 min-w-[2.75rem] items-center justify-center rounded-sm border px-3 font-mono text-[11px] tracking-wide transition {selected
                ? 'border-amber-400/70 bg-amber-500/15 text-amber-100'
                : 'border-white/15 bg-white/5 text-slate-300 hover:border-white/35'}"
            >
              <span
                class="mr-2 inline-block size-3 rounded-full ring-1 ring-white/30"
                style:background-color={livery.color}
              ></span>
              {livery.name}
            </button>
          {/each}
        </div>
      </section>

      <section aria-label="Choose pit stall">
        <p class="font-mono text-[10px] tracking-[0.28em] text-slate-400 uppercase">
          Pit garage · stall {race.selectedPitBoxIndex + 1} · grid P{race.selectedPitBoxIndex + 1}
        </p>
        <div class="mt-3 grid grid-cols-3 gap-2 min-[360px]:grid-cols-5 sm:grid-cols-10">
          {#each Array.from({ length: PIT_STALL_COUNT }, (_, i) => i) as i (i)}
            {@const selected = race.selectedPitBoxIndex === i}
            <button
              type="button"
              tabindex="0"
              aria-label="Pit stall {i + 1}"
              aria-pressed={selected}
              onclick={() => useRaceStore.getState().setPlayerPitBox(i)}
              onkeydown={(e) => handlePitKeyDown(i, e)}
              class="flex h-11 items-center justify-center rounded-sm border font-mono text-xs transition {selected
                ? 'border-cyan-400/70 bg-cyan-500/15 text-cyan-100'
                : 'border-white/15 bg-white/5 text-slate-400 hover:border-white/35'}"
            >
              {i + 1}
            </button>
          {/each}
        </div>
      </section>

      <section aria-label="Starting stint" class="grid gap-4 sm:grid-cols-2">
        <label class="block space-y-1.5">
          <span class="font-mono text-[10px] tracking-[0.28em] text-slate-400 uppercase">
            Engine
          </span>
          <select
            class={selectClass}
            value={race.engineMode}
            aria-label="Engine mode"
            onchange={handleEngineChange}
          >
            <option value="push">Push</option>
            <option value="standard">Standard</option>
            <option value="save">Save</option>
          </select>
          <p class="text-[11px] text-slate-500">{ENGINE_COPY[race.engineMode]}</p>
        </label>
        <label class="block space-y-1.5">
          <span class="font-mono text-[10px] tracking-[0.28em] text-slate-400 uppercase">
            Compound
          </span>
          <select
            class={selectClass}
            value={race.currentCompound}
            aria-label="Tyre compound"
            onchange={handleCompoundChange}
          >
            <option value="soft">Soft</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
            <option value="intermediate">Intermediate</option>
            <option value="wet">Wet</option>
          </select>
          <p class="text-[11px] text-slate-500">{COMPOUND_COPY[race.currentCompound]}</p>
        </label>
      </section>

      <section aria-label="Race distance">
        <p class="font-mono text-[10px] tracking-[0.28em] text-slate-400 uppercase">
          Race distance · {race.totalLaps} laps
        </p>
        <div class="mt-3 flex flex-wrap gap-2">
          {#each RACE_LAP_OPTIONS as laps (laps)}
            {@const selected = race.totalLaps === laps}
            <button
              type="button"
              tabindex="0"
              aria-label="{laps} lap race"
              aria-pressed={selected}
              onclick={() => handleLapSelect(laps)}
              onkeydown={(e) => handleLapKeyDown(laps, e)}
              class="flex h-11 min-w-[2.75rem] items-center justify-center rounded-sm border px-3 font-mono text-xs transition {selected
                ? 'border-emerald-400/70 bg-emerald-500/15 text-emerald-100'
                : 'border-white/15 bg-white/5 text-slate-400 hover:border-white/35'}"
            >
              {laps}
            </button>
          {/each}
        </div>
      </section>
      </main>
    </div>
  </div>

  <footer
    class="relative z-50 flex shrink-0 flex-col gap-3 border-t border-white/10 bg-[#0b1220]/95 px-6 py-4 pb-[max(1rem,var(--safe-bottom))] backdrop-blur-md sm:flex-row sm:flex-wrap sm:items-center md:px-12"
    aria-label="Start race"
  >
    <div class="flex flex-wrap gap-3">
      <button
        type="button"
        class={pwButtonClass("primary", "touch")}
        aria-label="Start race on Sepang grid"
        onclick={handleEnterRace}
      >
        Start race
      </button>
      <button
        type="button"
        class={pwButtonClass("secondary", "touch")}
        aria-label="Open F1 Rules Academy"
        onclick={handleOpenHub}
      >
        Rules Academy
      </button>
    </div>
    <p class="font-mono text-xs text-slate-400">
      {race.totalLaps} laps · P{race.selectedPitBoxIndex + 1} · stall {race.selectedPitBoxIndex + 1}
    </p>
  </footer>

  <AuthorChatBubble />
</div>
