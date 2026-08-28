import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { sampleCarPose } from "@/lib/carPose";
import { getGridSlot } from "@/lib/trackCurve";
import { quatFromTangent } from "@/lib/vehicleOrientation";
import { stepCarVisual, type CarVisualPose } from "@/lib/carVisual";
import { getLiveRaceCars } from "@/lib/raceLiveCars";
import { buildTrack, type TrackBuildResult } from "@/scene/buildTrack";
import { createF1CarMesh, updateF1CarBrakeLights, updateF1CarWheels } from "@/scene/F1CarMesh";
import {
  createFollowCameraState,
  updateFollowCamera,
  type FollowCameraState,
} from "@/scene/FollowCamera";
import { createStartLights, updateStartLights, type StartLightsGroup } from "@/scene/StartLights";
import { createSepangCampus, type SepangCampusHandle } from "@/scene/campus/SepangCampus";
import { buildTrackside, type TracksideHandle } from "@/scene/trackside";
import { buildTerrain, type TerrainBuildResult } from "@/scene/buildTerrain";
import {
  createAtmosphere,
  fillLightColor,
  sunDirectionalPosition,
  sunLightColor,
  type AtmosphereHandle,
} from "@/scene/atmosphere";
import { PitStopCrewField } from "@/scene/PitStopCrew";
import { metresToUnits } from "@/lib/trackCurve";
import {
  FIELD_META,
  PLAYER_ID,
  useRaceStore,
  type CameraMode,
  type CarState,
  type RacePhase,
} from "@/stores/raceStore";

const RAIN_COUNT = 800;
const OVERVIEW_HEIGHT = 100;
const OVERVIEW_BACK = 85;

type CarEntry = {
  group: THREE.Group;
  visual: CarVisualPose;
  visualReady: boolean;
  gridIndex: number;
  isPlayer: boolean;
};

export class RaceScene {
  readonly scene = new THREE.Scene();

  private renderer!: THREE.WebGLRenderer;
  private camera!: THREE.PerspectiveCamera;
  private hostElement!: HTMLElement;
  private cars = new Map<string, CarEntry>();
  private rainPoints!: THREE.Points;
  private rainPositions!: Float32Array;
  private track!: TrackBuildResult;
  private startLights!: StartLightsGroup;
  private orbitControls: OrbitControls | null = null;
  private followState: FollowCameraState = createFollowCameraState();
  private orientScratch = new THREE.Quaternion();
  private poseScratch = {
    position: new THREE.Vector3(),
    tangent: new THREE.Vector3(),
  };
  private overviewPrevTarget = new THREE.Vector3();
  private overviewNextTarget = new THREE.Vector3();
  private overviewDelta = new THREE.Vector3();
  private overviewSnapKey = "";
  private lastRainIntensity = -1;
  private lastCameraMode: CameraMode | null = null;
  private lastRacePhase: RacePhase | null = null;
  private directionalLight!: THREE.DirectionalLight;
  private ambientLight!: THREE.AmbientLight;
  private fillLight!: THREE.DirectionalLight;
  private campus!: SepangCampusHandle;
  private trackside!: TracksideHandle;
  private pitCrew!: PitStopCrewField;
  private terrain!: TerrainBuildResult;
  private atmosphere!: AtmosphereHandle;
  private disposed = false;

  init(hostElement: HTMLElement): void {
    this.hostElement = hostElement;
    const state = useRaceStore.getState();

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.shadowMap.enabled = true;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 900);
    this.camera.position.set(0, 160, 140);

    this.atmosphere = createAtmosphere(this.scene, this.renderer, state.rainIntensity);
    this.setupLights(state.rainIntensity);
    this.terrain = buildTerrain();
    this.scene.add(this.terrain.mesh);

    const playerPitBox =
      state.cars.find((c) => c.isPlayer)?.pitBoxIndex ?? state.selectedPitBoxIndex ?? 0;
    this.track = buildTrack(state.rainIntensity, playerPitBox);
    this.scene.add(this.track.group);
    this.lastRainIntensity = state.rainIntensity;

    this.campus = createSepangCampus();
    this.scene.add(this.campus.group);

    this.trackside = buildTrackside();
    this.scene.add(this.trackside.group);

    this.pitCrew = new PitStopCrewField();
    this.scene.add(this.pitCrew.group);

    this.startLights = createStartLights();
    this.scene.add(this.startLights);

    for (const meta of FIELD_META) {
      const group = new THREE.Group();
      group.name = `car-${meta.id}`;

      if (meta.isPlayer) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(metresToUnits(1.15), metresToUnits(1.45), 28),
          new THREE.MeshBasicMaterial({
            color: "#f43f5e",
            transparent: true,
            opacity: 0.5,
            toneMapped: false,
          }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = metresToUnits(0.02);
        group.add(ring);
      }

      const mesh = createF1CarMesh(meta.color, meta.isPlayer);
      group.add(mesh);

      this.scene.add(group);
      this.cars.set(meta.id, {
        group,
        visual: { lapProgress: 0, laneOffsetM: 0, pitProgress: 0 },
        visualReady: false,
        gridIndex: FIELD_META.findIndex((c) => c.id === meta.id),
        isPlayer: meta.isPlayer,
      });
    }

    this.rainPositions = this.createRainPositions();
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute("position", new THREE.BufferAttribute(this.rainPositions, 3));
    this.rainPoints = new THREE.Points(
      rainGeo,
      new THREE.PointsMaterial({
        color: "#93c5fd",
        size: 0.08,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
      }),
    );
    this.rainPoints.visible = false;
    this.scene.add(this.rainPoints);

    this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbitControls.enablePan = true;
    this.orbitControls.screenSpacePanning = true;
    this.orbitControls.minDistance = 45;
    this.orbitControls.maxDistance = 280;
    this.orbitControls.maxPolarAngle = Math.PI / 2.15;
    this.orbitControls.enabled = state.cameraMode === "overview";
    this.orbitControls.addEventListener("start", () => {
      useRaceStore.getState().unlockOverviewFollow();
    });

    hostElement.appendChild(this.renderer.domElement);
    this.resize();

    const canvas = this.renderer.domElement;
    canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
    });
  }

  update(dt: number): void {
    if (this.disposed) return;

    const state = useRaceStore.getState();
    // Racing: read per-frame sim state (60+ Hz) — the Svelte store only syncs at 20 Hz.
    const cars = state.phase === "racing" ? getLiveRaceCars() : state.cars;

    if (state.rainIntensity !== this.lastRainIntensity) {
      this.track.setRainIntensity(state.rainIntensity);
      this.updateLighting(state.rainIntensity);
      this.atmosphere.updateRain(state.rainIntensity);
      this.lastRainIntensity = state.rainIntensity;
    }

    this.updateCars(cars, state.phase, dt);
    this.campus.update(this.camera);
    this.pitCrew.update(this.camera, cars, state.phase, this.cars);
    this.updateRain(state.rainIntensity, dt);
    updateStartLights(
      this.startLights,
      state.phase,
      state.startLightCount,
      state.startLightsGreen,
      state.rainIntensity,
    );

    if (state.phase !== this.lastRacePhase) {
      if (state.phase === "starting" || state.phase === "racing") {
        this.overviewSnapKey = "";
        this.followState = createFollowCameraState();
      }
      this.lastRacePhase = state.phase;
    }

    if (state.cameraMode !== this.lastCameraMode) {
      if (this.orbitControls) {
        this.orbitControls.enabled = state.cameraMode === "overview";
      }
      if (state.cameraMode === "overview") {
        this.overviewSnapKey = "";
        this.followState = createFollowCameraState();
      }
      this.lastCameraMode = state.cameraMode;
    }

    if (state.cameraMode === "follow") {
      const player = cars.find((c) => c.isPlayer);
      const entry = this.cars.get(PLAYER_ID);
      if (player && entry) {
        const smoothed = { ...player, ...entry.visual };
        updateFollowCamera(
          this.camera,
          smoothed,
          state.phase,
          entry.gridIndex,
          state.cameraMode,
          dt,
          this.followState,
          state.phase === "racing" ? entry.group : undefined,
        );
      }
    } else if (state.cameraMode === "overview") {
      this.updateOverviewCamera(state, cars);
      this.orbitControls?.update();
    }

    this.renderer.render(this.scene, this.camera);
  }

  resize(): void {
    if (!this.hostElement || !this.renderer || !this.camera) return;
    const { clientWidth, clientHeight } = this.hostElement;
    if (clientWidth === 0 || clientHeight === 0) return;
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(clientWidth, clientHeight, false);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.orbitControls?.dispose();
    this.track.dispose();
    this.terrain.dispose();
    this.atmosphere.dispose();
    this.campus.dispose();
    this.trackside.dispose();
    this.pitCrew.dispose();
    this.startLights.userData.dispose();

    for (const entry of this.cars.values()) {
      const mesh = entry.group.children.find((c) => c.name === "f1Car");
      if (mesh && mesh.userData.dispose) mesh.userData.dispose();
      entry.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else if (obj.material) {
            obj.material.dispose();
          }
        }
      });
    }

    this.rainPoints.geometry.dispose();
    (this.rainPoints.material as THREE.Material).dispose();

    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private setupLights(rainIntensity: number): void {
    const ambient = 0.38 - rainIntensity * 0.18;
    const key = 1.45 - rainIntensity * 0.45;
    const fill = 0.55 - rainIntensity * 0.2;

    this.ambientLight = new THREE.AmbientLight(0xffffff, Math.max(0.18, ambient));
    this.scene.add(this.ambientLight);

    this.directionalLight = new THREE.DirectionalLight(sunLightColor(rainIntensity), key);
    this.directionalLight.position.copy(sunDirectionalPosition(this.atmosphere.sun));
    this.directionalLight.castShadow = true;
    this.directionalLight.shadow.mapSize.set(2048, 2048);
    this.directionalLight.shadow.camera.far = 400;
    this.directionalLight.shadow.camera.left = -180;
    this.directionalLight.shadow.camera.right = 180;
    this.directionalLight.shadow.camera.top = 180;
    this.directionalLight.shadow.camera.bottom = -180;
    this.scene.add(this.directionalLight);

    this.fillLight = new THREE.DirectionalLight(fillLightColor(rainIntensity), fill);
    this.fillLight.position.set(-40, 30, -50);
    this.scene.add(this.fillLight);

    const hemi = new THREE.HemisphereLight(0x1e3a5f, 0x0a1628, 0.45);
    this.scene.add(hemi);
  }

  private updateLighting(rainIntensity: number): void {
    const ambient = 0.38 - rainIntensity * 0.18;
    const key = 1.45 - rainIntensity * 0.45;
    const fill = 0.55 - rainIntensity * 0.2;
    this.ambientLight.intensity = Math.max(0.18, ambient);
    this.directionalLight.intensity = key;
    this.directionalLight.color.copy(sunLightColor(rainIntensity));
    this.directionalLight.position.copy(sunDirectionalPosition(this.atmosphere.sun));
    this.fillLight.intensity = fill;
    this.fillLight.color.copy(fillLightColor(rainIntensity));
  }

  private createRainPositions(): Float32Array {
    const arr = new Float32Array(RAIN_COUNT * 3);
    let seed = 0x9e3779b9;
    const nextRand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff;
    };
    for (let i = 0; i < RAIN_COUNT; i++) {
      arr[i * 3] = (nextRand() - 0.5) * 280;
      arr[i * 3 + 1] = nextRand() * 60;
      arr[i * 3 + 2] = (nextRand() - 0.5) * 280;
    }
    return arr;
  }

  private updateRain(intensity: number, delta: number): void {
    if (intensity <= 0.12) {
      this.rainPoints.visible = false;
      return;
    }
    this.rainPoints.visible = true;
    const attrs = this.rainPoints.geometry.attributes.position as THREE.BufferAttribute;
    const arr = attrs.array as Float32Array;
    const speed = 8 + intensity * 25;
    for (let i = 0; i < RAIN_COUNT; i++) {
      arr[i * 3 + 1] -= speed * delta;
      if (arr[i * 3 + 1] < 0) arr[i * 3 + 1] = 50 + Math.random() * 10;
    }
    attrs.needsUpdate = true;
  }

  private updateCars(cars: CarState[], phase: RacePhase, dt: number): void {
    for (const meta of FIELD_META) {
      const car = cars.find((c) => c.id === meta.id);
      const entry = this.cars.get(meta.id);
      if (!car || !entry) continue;

      // Racing feeds per-frame live sim state, so render the raw pose directly;
      // predict-and-correct smoothing is only needed for 20 Hz store snapshots.
      const smoothed: CarVisualPose =
        phase === "racing"
          ? {
              lapProgress: car.lapProgress,
              laneOffsetM: car.laneOffsetM,
              pitProgress: car.pitProgress,
            }
          : stepCarVisual(entry.visual, car, dt, entry.visualReady);
      entry.visual = smoothed;
      entry.visualReady = true;

      const pose = sampleCarPose(
        { ...car, ...smoothed },
        phase,
        meta.id,
        entry.gridIndex,
        this.poseScratch,
      );

      entry.group.position.copy(pose.position);
      if (phase === "ready" || phase === "starting") {
        // Match painted grid box yaw (+Z nose toward yellow front stripe).
        entry.group.rotation.set(0, getGridSlot(entry.gridIndex).rotationY, 0);
      } else {
        entry.group.quaternion.copy(quatFromTangent(pose.tangent, this.orientScratch));
      }

      if (car.status === "sliding" || car.status === "spun") {
        const wobble =
          Math.sin(performance.now() * 0.028) * (car.status === "spun" ? 0.55 : 0.22);
        entry.group.rotateY(wobble);
      }

      const mesh = entry.group.children.find((c) => c.name === "f1Car");
      if (mesh) {
        updateF1CarBrakeLights(mesh, car.brakeIntensity);
        updateF1CarWheels(mesh, car.speedMps, 0, dt);
      }
    }
  }

  /** World position used for cameras — matches updateCars mesh pose. */
  private playerWorldPosition(
    _player: CarState,
    entry: CarEntry,
    _phase: RacePhase,
  ): THREE.Vector3 {
    return this.overviewNextTarget.copy(entry.group.position);
  }

  private updateOverviewCamera(
    state: ReturnType<typeof useRaceStore.getState>,
    cars: CarState[],
  ): void {
    const player = cars.find((c) => c.isPlayer);
    const entry = this.cars.get(PLAYER_ID);
    if (!player || !entry) return;

    if (state.overviewFollow && this.orbitControls) {
      const worldPos = this.playerWorldPosition(player, entry, state.phase);

      if (this.overviewSnapKey !== "locked") {
        this.overviewSnapKey = "locked";
        this.camera.position.set(
          worldPos.x,
          worldPos.y + OVERVIEW_HEIGHT,
          worldPos.z + OVERVIEW_BACK,
        );
        this.camera.up.set(0, 1, 0);
        this.camera.lookAt(worldPos.x, worldPos.y + 2, worldPos.z);
        this.orbitControls.target.set(worldPos.x, worldPos.y + 2, worldPos.z);
        this.overviewPrevTarget.copy(this.orbitControls.target);
        this.orbitControls.update();
      } else {
        this.overviewNextTarget.copy(worldPos);
        this.overviewNextTarget.y += 2;
        this.overviewDelta.copy(this.overviewNextTarget).sub(this.overviewPrevTarget);
        this.orbitControls.target.copy(this.overviewNextTarget);
        this.camera.position.add(this.overviewDelta);
        this.overviewPrevTarget.copy(this.overviewNextTarget);
      }
    } else if (!state.overviewFollow) {
      this.overviewSnapKey = "";
    }
  }
}
