import { getMission } from "@/lib/academy/curriculum";
import { registerMissionSnapshotListener } from "@/lib/academy/missionBridge";
import { applyMissionAction, collectDueInjects } from "@/lib/academy/scenarioRunner";
import { useAcademyStore } from "@/stores/academyStore";
import { useRaceStore } from "@/stores/raceStore";

/**
 * Wires race snapshots → mission injects → coach / race-control actions.
 * Call once from GameShell.
 */
export const mountMissionBridgeRuntime = (): (() => void) => {
  let coachOpen = useAcademyStore.getState().coachOpen;
  let activeMissionId = useAcademyStore.getState().activeMissionId;
  let playMode = useRaceStore.getState().playMode;
  let phase = useRaceStore.getState().phase;

  const syncCoachPause = (open: boolean) => {
    useRaceStore.getState().setMissionPaused(open);
  };

  syncCoachPause(coachOpen);

  const applySnapshotBridge = () => {
    if (!activeMissionId || playMode !== "mission") {
      registerMissionSnapshotListener(null);
      return;
    }

    registerMissionSnapshotListener((snap, prev) => {
      const missionId = activeMissionId;
      if (!missionId) return;
      const mission = getMission(missionId);
      if (!mission) return;
      const fired = new Set(useAcademyStore.getState().firedInjectIds);
      const due = collectDueInjects(mission, fired, snap, prev);
      const race = useRaceStore.getState();
      const academy = useAcademyStore.getState();

      for (const inject of due) {
        academy.markInjectFired(inject.id);
        applyMissionAction(inject.action, {
          openCoach: (beatId) => {
            academy.openCoach(beatId);
          },
          setControl: (flag) => race.setRaceControl(flag),
          clearControl: () => race.clearRaceControl(),
          forceRain: (override) => race.setWeatherOverride(override),
          forceWear: (wear) => race.forcePlayerWear(wear),
          spawnPitTraffic: () => race.spawnPitTraffic(),
          enableDrsZone: () => race.setDrsEnabled(true),
          blueFlagPlayer: () => race.setBlueFlagActive(true),
          addPenalty: (kind) => race.addPlayerPenalty(kind),
          finishRace: () => {
            /* classification ends via normal race distance */
          },
        });
      }
    });
  };

  applySnapshotBridge();

  const unsubAcademy = useAcademyStore.subscribe((s) => {
    if (s.coachOpen !== coachOpen) {
      coachOpen = s.coachOpen;
      syncCoachPause(coachOpen);
    }
    if (s.activeMissionId !== activeMissionId) {
      activeMissionId = s.activeMissionId;
      applySnapshotBridge();
    }
  });

  const unsubRace = useRaceStore.subscribe((s) => {
    const prevPlayMode = playMode;
    const prevPhase = phase;
    playMode = s.playMode;
    phase = s.phase;

    if (playMode !== prevPlayMode) {
      applySnapshotBridge();
    }

    if (playMode === "mission" && phase === "finished" && activeMissionId && phase !== prevPhase) {
      useAcademyStore.getState().finishMissionSession();
    }
  });

  return () => {
    unsubAcademy();
    unsubRace();
    registerMissionSnapshotListener(null);
  };
};
