import {
  disposeRaceAudio,
  setRaceAudioMuted,
  syncRaceAudio,
  unlockRaceAudio,
} from "@/lib/raceAudio";
import type { PitPhase, RacePhase } from "@/stores/raceStore";
import { useRaceStore } from "@/stores/raceStore";

export type RaceAudioSlice = {
  audioMuted: boolean;
  phase: RacePhase;
  racing: boolean;
  playerBoxing: boolean;
  pitPhase: PitPhase | null;
  pitStopElapsed: number;
  pitServiceDone: boolean;
  pitHoldTraffic: boolean;
  unsafeReleasePenaltyMs: number;
  speedMps: number;
  startLightCount: number;
  startLightsGreen: boolean;
  startLightsOut: boolean;
};

export const selectRaceAudioSlice = (
  s: ReturnType<typeof useRaceStore.getState>,
): RaceAudioSlice => {
  const player = s.cars.find((c) => c.isPlayer);
  return {
    audioMuted: s.audioMuted,
    phase: s.phase,
    racing: s.phase === "racing",
    playerBoxing: !!player?.isBoxing,
    pitPhase: player?.pitPhase ?? null,
    pitStopElapsed: player?.pitStopElapsed ?? 0,
    pitServiceDone: !!player?.pitServiceDone,
    pitHoldTraffic: !!player?.pitHoldTraffic,
    unsafeReleasePenaltyMs: player?.unsafeReleasePenaltyMs ?? 0,
    speedMps: s.speedMps,
    startLightCount: s.startLightCount,
    startLightsGreen: s.startLightsGreen,
    startLightsOut: s.startLightsOut,
  };
};

export const raceAudioSliceEqual = (a: RaceAudioSlice, b: RaceAudioSlice): boolean =>
  a.audioMuted === b.audioMuted &&
  a.phase === b.phase &&
  a.racing === b.racing &&
  a.playerBoxing === b.playerBoxing &&
  a.pitPhase === b.pitPhase &&
  a.pitStopElapsed === b.pitStopElapsed &&
  a.pitServiceDone === b.pitServiceDone &&
  a.pitHoldTraffic === b.pitHoldTraffic &&
  a.unsafeReleasePenaltyMs === b.unsafeReleasePenaltyMs &&
  a.speedMps === b.speedMps &&
  a.startLightCount === b.startLightCount &&
  a.startLightsGreen === b.startLightsGreen &&
  a.startLightsOut === b.startLightsOut;

/**
 * Bridges race/pit store state → Web Audio cues.
 * Call once from GameShell; unlocks on first pointer/key.
 */
export const mountRaceAudioBridge = (): (() => void) => {
  let prevPitPhase: string | null = null;
  let prevUnsafe = 0;
  let prevStartLightCount = 0;
  let prevStartLightsGreen = false;
  let prevStartLightsOut = false;

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
    const startRedDelta =
      slice.phase === "starting" ? slice.startLightCount - prevStartLightCount : 0;
    const startGreenEdge = slice.startLightsGreen && !prevStartLightsGreen;
    const lightsOutEdge = slice.startLightsOut && !prevStartLightsOut;

    prevPitPhase = phase;
    prevUnsafe = unsafe;
    if (slice.phase !== "starting") {
      prevStartLightCount = 0;
      prevStartLightsGreen = false;
    } else {
      prevStartLightCount = slice.startLightCount;
      prevStartLightsGreen = slice.startLightsGreen;
    }
    prevStartLightsOut = slice.startLightsOut;

    syncRaceAudio({
      phase: slice.phase,
      playerBoxing: slice.playerBoxing,
      pitPhase: phase,
      pitStopElapsed: slice.pitStopElapsed,
      pitServiceDone: slice.pitServiceDone,
      pitHoldTraffic: slice.pitHoldTraffic,
      racing: slice.racing,
      speedMps: slice.speedMps,
      startLightCount: slice.startLightCount,
      startLightsGreen: slice.startLightsGreen,
      startLightsOut: slice.startLightsOut,
      unsafeDelta,
      justReleased,
      startRedDelta,
      startGreenEdge,
      lightsOutEdge,
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
