import {
  disposeRaceAudio,
  setRaceAudioMuted,
  syncEngineSpeed,
  syncRaceAudio,
  unlockRaceAudio,
} from "@/lib/raceAudio";
import { getLiveRaceCars } from "@/lib/raceLiveCars";
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
  const livePlayer =
    s.phase === "racing" ? getLiveRaceCars().find((c) => c.isPlayer) : undefined;
  const storePlayer = s.cars.find((c) => c.isPlayer);
  const player = livePlayer ?? storePlayer;
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
    speedMps: player?.speedMps ?? s.speedMps,
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
 * Call once from GameShell; unlocks on user gesture then re-syncs audio.
 */
export const mountRaceAudioBridge = (): (() => void) => {
  let prevPitPhase: string | null = null;
  let prevUnsafe = 0;
  let prevStartLightCount = 0;
  let prevStartLightsGreen = false;
  let prevStartLightsOut = false;
  let lastSlice = selectRaceAudioSlice(useRaceStore.getState());
  let audioRaf = 0;

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

    void syncRaceAudio({
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

  const tryUnlockAndSync = () => {
    void unlockRaceAudio().then((ok) => {
      if (ok) handleSlice(lastSlice);
    });
  };

  window.addEventListener("pointerdown", tryUnlockAndSync);
  window.addEventListener("keydown", tryUnlockAndSync);

  const onVisibility = () => {
    if (document.visibilityState === "visible") tryUnlockAndSync();
  };
  document.addEventListener("visibilitychange", onVisibility);

  const pollEngineSpeed = () => {
    const s = useRaceStore.getState();
    if (s.phase === "racing" && !s.audioMuted) {
      const player = getLiveRaceCars().find((c) => c.isPlayer);
      if (player) syncEngineSpeed(player.speedMps);
    }
    audioRaf = requestAnimationFrame(pollEngineSpeed);
  };
  audioRaf = requestAnimationFrame(pollEngineSpeed);

  handleSlice(lastSlice);

  const unsub = useRaceStore.subscribe((s) => {
    const slice = selectRaceAudioSlice(s);
    if (!raceAudioSliceEqual(lastSlice, slice)) {
      lastSlice = slice;
      handleSlice(slice);
    }
  });

  return () => {
    cancelAnimationFrame(audioRaf);
    window.removeEventListener("pointerdown", tryUnlockAndSync);
    window.removeEventListener("keydown", tryUnlockAndSync);
    document.removeEventListener("visibilitychange", onVisibility);
    unsub();
    disposeRaceAudio();
  };
};
