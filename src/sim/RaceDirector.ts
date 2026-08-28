import { sampleCarPose } from "@/lib/carPose";
import { quatFromTangent } from "@/lib/vehicleOrientation";
import { buildTrackCollider } from "@/scene/buildTrackCollider";
import { SEPANG_WAYPOINTS } from "@/shared/sepangWaypoints";
import {
  createSharedSimState,
  HeaderIndex,
  vehicleBaseIndex,
  VehicleField,
  vehicleFlagsDecode,
  vehicleFlagsEncode,
  writeVehicleKinematicPose,
  type SharedSimViews,
  type VehiclePoseInit,
} from "@/shared/sharedState";
import { setRaceSimContext } from "@/sim/raceSimContext";
import {
  FIELD_META,
  stepRaceSimulation,
  useRaceStore,
  type CarState,
  type RacePhase,
} from "@/stores/raceStore";

const FIXED_TIMESTEP = 1 / 60;

export type WorkerHandles = {
  physicsWorker: Worker;
  aiWorker: Worker;
};

/** Track-parametric poses from sampleCarPose; Rapier bodies follow via SAB (not free dynamics). */
const isPhysicsKinematic = (_phase: RacePhase, _car: CarState): boolean => true;

const poseToInit = (
  car: CarState,
  phase: RacePhase,
  gridIndex: number,
): VehiclePoseInit => {
  const pose = sampleCarPose(car, phase, car.id, gridIndex);
  const quat = quatFromTangent(pose.tangent);
  return {
    position: [pose.position.x, pose.position.y, pose.position.z],
    quaternion: [quat.x, quat.y, quat.z, quat.w],
    kinematic: isPhysicsKinematic(phase, car),
  };
};

export class RaceDirector {
  readonly shared: SharedSimViews;
  private workers: WorkerHandles | null = null;
  private simAccum = 0;
  private lastPhase: RacePhase = "landing";

  constructor() {
    this.shared = createSharedSimState();
    Atomics.store(this.shared.header, HeaderIndex.vehicleCount, FIELD_META.length);
  }

  /** Lazily spawn Rapier workers when leaving landing (defers ~2.8 MB WASM until race desk). */
  ensureWorkers(): WorkerHandles | null {
    const state = useRaceStore.getState();
    if (state.phase === "landing") return null;
    return this.spawnWorkers();
  }

  spawnWorkers(): WorkerHandles {
    if (this.workers) return this.workers;

    const { buffer } = this.shared;
    const collider = buildTrackCollider();
    const state = useRaceStore.getState();
    const initialPoses = FIELD_META.map((meta, index) => {
      const car = state.cars.find((c) => c.id === meta.id);
      if (!car) {
        return {
          position: [0, 1.2, 0] as [number, number, number],
          quaternion: [0, 0, 0, 1] as [number, number, number, number],
          kinematic: true,
        };
      }
      return poseToInit(car, state.phase, index);
    });

    const physicsWorker = new Worker(new URL("@/workers/physicsWorker.ts", import.meta.url), {
      type: "module",
    });
    const aiWorker = new Worker(new URL("@/workers/aiWorker.ts", import.meta.url), {
      type: "module",
    });

    physicsWorker.postMessage({
      type: "init",
      payload: {
        buffer,
        fixedTimestep: FIXED_TIMESTEP,
        vehicleCount: FIELD_META.length,
        collider,
        initialPoses,
      },
    });

    aiWorker.postMessage({
      type: "init",
      payload: {
        buffer,
        tickRateHz: 30,
        waypoints: SEPANG_WAYPOINTS,
      },
    });

    this.workers = { physicsWorker, aiWorker };
    setRaceSimContext(this.shared, this.workers);
    return this.workers;
  }

  initVehicleFlags(): void {
    const { floats } = this.shared;
    FIELD_META.forEach((meta, index) => {
      const base = vehicleBaseIndex(index);
      floats[base + VehicleField.flags] = vehicleFlagsEncode({
        onGround: true,
        aiEnabled: false,
        playerControlled: meta.isPlayer,
        kinematic: true,
      });
    });
  }

  resetPhysicsPoses(): void {
    if (!this.workers) return;
    const state = useRaceStore.getState();
    const poses = FIELD_META.map((meta, index) => {
      const car = state.cars.find((c) => c.id === meta.id);
      if (!car) {
        return {
          position: [0, 1.2, 0] as [number, number, number],
          quaternion: [0, 0, 0, 1] as [number, number, number, number],
          kinematic: true,
        };
      }
      return poseToInit(car, state.phase, index);
    });
    this.workers.physicsWorker.postMessage({ type: "resetPoses", payload: { poses } });
  }

  /** Main-thread sim tick + SAB driver input sync for render/workers. */
  tick(dt: number): void {
    const state = useRaceStore.getState();
    if (state.phase !== "landing") {
      this.ensureWorkers();
    }
    if (state.phase === "racing" && this.lastPhase !== "racing") {
      this.resetPhysicsPoses();
    }
    this.lastPhase = state.phase;

    stepRaceSimulation(dt);

    this.simAccum += dt;
    while (this.simAccum >= FIXED_TIMESTEP) {
      this.syncDriverInputs();
      this.simAccum -= FIXED_TIMESTEP;
    }
  }

  private syncDriverInputs(): void {
    const state = useRaceStore.getState();
    const { floats } = this.shared;

    FIELD_META.forEach((meta, index) => {
      const car = state.cars.find((c) => c.id === meta.id);
      if (!car) return;

      const base = vehicleBaseIndex(index);
      const flags = vehicleFlagsDecode(floats[base + VehicleField.flags]);
      floats[base + VehicleField.flags] = vehicleFlagsEncode({
        ...flags,
        aiEnabled: false,
        playerControlled: car.isPlayer,
        kinematic: true,
      });

      const pose = sampleCarPose(car, state.phase, car.id, index);
      const quat = quatFromTangent(pose.tangent);
      writeVehicleKinematicPose(
        floats,
        index,
        [pose.position.x, pose.position.y, pose.position.z],
        [quat.x, quat.y, quat.z, quat.w],
      );
      floats[base + VehicleField.speed] = Math.max(0, car.speedMps);
    });
  }

  shutdown(): void {
    if (!this.workers) return;
    this.workers.physicsWorker.postMessage({ type: "shutdown" });
    this.workers.aiWorker.postMessage({ type: "shutdown" });
    this.workers.physicsWorker.terminate();
    this.workers.aiWorker.terminate();
    this.workers = null;
  }
}
