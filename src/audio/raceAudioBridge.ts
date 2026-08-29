import {
  disposeRaceAudio,
  isRaceAudioUnlocked,
  onRaceAudioBuffersReady,
  setRaceAudioMuted,
  syncEngineSpeed,
  syncRaceAudio,
  syncRaceLoopAudio,
  tickLivePitCues,
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
    if (!isRaceAudioUnlocked()) return;
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

  const unlockOpts: AddEventListenerOptions = { capture: true, passive: true };
  window.addEventListener("pointerdown", tryUnlockAndSync, unlockOpts);
  window.addEventListener("touchstart", tryUnlockAndSync, unlockOpts);
  window.addEventListener("keydown", tryUnlockAndSync, unlockOpts);
  window.addEventListener("click", tryUnlockAndSync, unlockOpts);

  const onVisibility = () => {
    if (document.visibilityState === "visible") tryUnlockAndSync();
  };
  document.addEventListener("visibilitychange", onVisibility);

  const pollLiveAudio = () => {
    const s = useRaceStore.getState();
    if (isRaceAudioUnlocked() && !s.audioMuted) {
      const livePlayer =
        s.phase === "racing" ? getLiveRaceCars().find((c) => c.isPlayer) : undefined;
      const storePlayer = s.cars.find((c) => c.isPlayer);
      const player = livePlayer ?? storePlayer;

      if (player) {
        syncRaceLoopAudio({
          phase: s.phase,
          racing: s.phase === "racing",
          playerBoxing: !!player.isBoxing,
          pitPhase: player.pitPhase ?? null,
          speedMps: player.speedMps ?? s.speedMps,
        });

        if (s.phase === "racing") {
          syncEngineSpeed(player.speedMps);
          if (player.isBoxing) {
            tickLivePitCues(
              player.pitPhase ?? null,
              player.pitStopElapsed,
              !!player.pitServiceDone,
            );
          }
        }
      }
    }
    audioRaf = requestAnimationFrame(pollLiveAudio);
  };
  audioRaf = requestAnimationFrame(pollLiveAudio);

  const stopBuffersReady = onRaceAudioBuffersReady(() => {
    handleSlice(lastSlice);
  });

  const unsub = useRaceStore.subscribe((s) => {
    const slice = selectRaceAudioSlice(s);
    if (!raceAudioSliceEqual(lastSlice, slice)) {
      lastSlice = slice;
      handleSlice(slice);
    }
  });

  return () => {
    cancelAnimationFrame(audioRaf);
    stopBuffersReady();
    window.removeEventListener("pointerdown", tryUnlockAndSync, unlockOpts);
    window.removeEventListener("touchstart", tryUnlockAndSync, unlockOpts);
    window.removeEventListener("keydown", tryUnlockAndSync, unlockOpts);
    window.removeEventListener("click", tryUnlockAndSync, unlockOpts);
    document.removeEventListener("visibilitychange", onVisibility);
    unsub();
    disposeRaceAudio();
  };
};
