import {
  disposeRaceAudio,
  setRaceAudioMuted,
  syncRaceAudio,
  unlockRaceAudio,
} from "@/lib/raceAudio";
import type { PitPhase } from "@/stores/raceStore";
import { useRaceStore } from "@/stores/raceStore";

export type RaceAudioSlice = {
  audioMuted: boolean;
  racing: boolean;
  playerBoxing: boolean;
  pitPhase: PitPhase | null;
  pitStopElapsed: number;
  pitServiceDone: boolean;
  pitHoldTraffic: boolean;
  unsafeReleasePenaltyMs: number;
};

export const selectRaceAudioSlice = (
  s: ReturnType<typeof useRaceStore.getState>,
): RaceAudioSlice => {
  const player = s.cars.find((c) => c.isPlayer);
  return {
    audioMuted: s.audioMuted,
    racing: s.phase === "racing",
    playerBoxing: !!player?.isBoxing,
    pitPhase: player?.pitPhase ?? null,
    pitStopElapsed: player?.pitStopElapsed ?? 0,
    pitServiceDone: !!player?.pitServiceDone,
    pitHoldTraffic: !!player?.pitHoldTraffic,
    unsafeReleasePenaltyMs: player?.unsafeReleasePenaltyMs ?? 0,
  };
};

export const raceAudioSliceEqual = (a: RaceAudioSlice, b: RaceAudioSlice): boolean =>
  a.audioMuted === b.audioMuted &&
  a.racing === b.racing &&
  a.playerBoxing === b.playerBoxing &&
  a.pitPhase === b.pitPhase &&
  a.pitStopElapsed === b.pitStopElapsed &&
  a.pitServiceDone === b.pitServiceDone &&
  a.pitHoldTraffic === b.pitHoldTraffic &&
  a.unsafeReleasePenaltyMs === b.unsafeReleasePenaltyMs;

/**
 * Bridges race/pit store state → Web Audio cues.
 * Call once from GameShell; unlocks on first pointer/key.
 */
export const mountRaceAudioBridge = (): (() => void) => {
  let prevPitPhase: string | null = null;
  let prevUnsafe = 0;

  const unlock = () => {
    void unlockRaceAudio();
  };
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });

  const handleSlice = (slice: RaceAudioSlice) => {
    setRaceAudioMuted(slice.audioMuted);
    const phase = slice.pitPhase;
    const unsafe = slice.unsafeReleasePenaltyMs;
    const justReleased = prevPitPhase === "stopped" && phase === "out";
    const unsafeDelta = unsafe > prevUnsafe;
    prevPitPhase = phase;
    prevUnsafe = unsafe;

    syncRaceAudio({
      playerBoxing: slice.playerBoxing,
      pitPhase: phase,
      pitStopElapsed: slice.pitStopElapsed,
      pitServiceDone: slice.pitServiceDone,
      pitHoldTraffic: slice.pitHoldTraffic,
      racing: slice.racing,
      unsafeDelta,
      justReleased,
    });
  };

  let lastSlice = selectRaceAudioSlice(useRaceStore.getState());
  handleSlice(lastSlice);

  const unsub = useRaceStore.subscribe((s) => {
    const slice = selectRaceAudioSlice(s);
    if (!raceAudioSliceEqual(lastSlice, slice)) {
      lastSlice = slice;
      handleSlice(slice);
    }
  });

  return () => {
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
    unsub();
    disposeRaceAudio();
  };
};
