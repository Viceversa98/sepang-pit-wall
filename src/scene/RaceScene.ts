import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { sampleCarPose } from "@/lib/carPose";
import { getGridSlot } from "@/lib/trackCurve";
import { quatFromTangent } from "@/lib/vehicleOrientation";
import { stepCarVisual, type CarVisualPose } from "@/lib/carVisual";
import { getLiveRaceCars } from "@/lib/raceLiveCars";
import { buildTrack, type TrackBuildResult } from "@/scene/buildTrack";
import { createF1CarMesh, setF1CarBodyColor, updateF1CarBrakeLights, updateF1CarHazardLights, updateF1CarWheels } from "@/scene/F1CarMesh";
import { isBrokenDownOnTrack } from "@/lib/raceTraffic";
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
import { createClouds, sampleRainInField, type CloudsHandle } from "@/scene/clouds";
import { PitStopCrewField } from "@/scene/PitStopCrew";
import { metresToUnits } from "@/lib/trackCurve";
import {
  clampPanDelta,
  isFiniteVec3,
  RACE_CAMERA_FAR,
  RACE_CAMERA_NEAR,
  RACE_CAMERA_NEAR_MOBILE,
  safeLookAt,
} from "@/lib/cameraSafety";
import {
  FIELD_META,
  gridIndexForCar,
  gridSlotForCar,
  PLAYER_ID,
  useRaceStore,
  type CameraMode,
  type CarState,
  type RacePhase,
} from "@/stores/raceStore";
import { detectRaceSceneQuality, type RaceSceneQuality } from "@/lib/qualityTier";
import { AdaptiveDpr } from "@/lib/adaptiveDpr";
import { getHostElementSize } from "@/lib/viewportLayout";
import { attachOverlayWebGlCanvas } from "@/lib/webglCanvas";

const DEFAULT_RAIN_COUNT = 3200;
const OVERVIEW_HEIGHT = 100;
const OVERVIEW_BACK = 85;

type CarEntry = {
  group: THREE.Group;
  visual: CarVisualPose;
  visualReady: boolean;
  gridIndex: number;
  isPlayer: boolean;
  playerRing?: THREE.Mesh;
  bodyColor: string;
};

export class RaceScene {
  readonly scene = new THREE.Scene();

  private renderer!: THREE.WebGLRenderer;
  private camera!: THREE.PerspectiveCamera;
  private hostElement!: HTMLElement;
  private cars = new Map<string, CarEntry>();
  private rainPoints!: THREE.Points;
  private rainPositions!: Float32Array;
  private rainSpawnScratch = new THREE.Vector3();
  private clouds!: CloudsHandle;
  private elapsed = 0;
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
  private quality: RaceSceneQuality = detectRaceSceneQuality();
  private rainCount = DEFAULT_RAIN_COUNT;
  private adaptiveDpr: AdaptiveDpr | null = null;
  private runtimeDprCap = 1.5;
  private pendingResize = false;
  private lastCanvasWidth = 0;
  private lastCanvasHeight = 0;

  init(hostElement: HTMLElement): void {
    this.hostElement = hostElement;
    this.quality = detectRaceSceneQuality();
    this.rainCount = this.quality.rainCount;
    this.runtimeDprCap = this.quality.dprCap;
    this.adaptiveDpr = new AdaptiveDpr(this.quality.dprCap);
    const state = useRaceStore.getState();

    this.renderer = new THREE.WebGLRenderer({
      antialias: this.quality.antialias,
      powerPreference: "high-performance",
    });
    this.renderer.shadowMap.enabled = this.quality.shadows;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.runtimeDprCap));

    const cameraNear =
      this.quality.tier === "mobile" ? RACE_CAMERA_NEAR_MOBILE : RACE_CAMERA_NEAR;
    this.camera = new THREE.PerspectiveCamera(42, 1, cameraNear, RACE_CAMERA_FAR);
    this.camera.position.set(0, 160, 140);

    this.atmosphere = createAtmosphere(this.scene, this.renderer, state.rainIntensity);
    this.clouds = createClouds();
    this.clouds.updateRain(state.rainIntensity);
    this.scene.add(this.clouds.group);
    this.setupLights(state.rainIntensity);
    this.terrain = buildTerrain();
    this.scene.add(this.terrain.mesh);

    const playerPitBox =
      state.cars.find((c) => c.isPlayer)?.pitBoxIndex ?? state.selectedPitBoxIndex ?? 0;
    const playerColor =
      state.cars.find((c) => c.isPlayer)?.color ?? state.selectedPlayerColor;

    this.track = buildTrack(state.rainIntensity, playerPitBox, playerColor);
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

      let playerRing: THREE.Mesh | undefined;
      if (meta.isPlayer) {
        playerRing = new THREE.Mesh(
          new THREE.RingGeometry(metresToUnits(1.15), metresToUnits(1.45), 28),
          new THREE.MeshBasicMaterial({
            color: playerColor,
            transparent: true,
            opacity: 0.5,
            toneMapped: false,
          }),
        );
        playerRing.rotation.x = -Math.PI / 2;
        playerRing.position.y = metresToUnits(0.02);
        group.add(playerRing);
      }

      const meshColor = meta.isPlayer ? playerColor : meta.color;
      const mesh = createF1CarMesh(meshColor, meta.isPlayer);
      group.add(mesh);

      this.scene.add(group);
      this.cars.set(meta.id, {
        group,
        visual: { lapProgress: 0, laneOffsetM: 0, pitProgress: 0 },
        visualReady: false,
        gridIndex: gridIndexForCar(meta.id),
        isPlayer: meta.isPlayer,
        playerRing,
        bodyColor: meshColor,
      });
    }

    this.rainPositions = this.createRainPositions();
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute("position", new THREE.BufferAttribute(this.rainPositions, 3));
    this.rainPoints = new THREE.Points(
      rainGeo,
      new THREE.PointsMaterial({
        color: "#bfdbfe",
        size: 0.1,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        sizeAttenuation: true,
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

    attachOverlayWebGlCanvas(this.renderer.domElement, hostElement);
    this.resize();
  }

  update(dt: number): void {
    if (this.disposed) return;
    if (this.pendingResize) this.resize();
    if (this.disposed) return;

    const state = useRaceStore.getState();
    // Racing: read per-frame sim state (60+ Hz) — the Svelte store only syncs at 20 Hz.
    const cars = state.phase === "racing" ? getLiveRaceCars() : state.cars;

    this.elapsed += dt;

    if (state.rainIntensity !== this.lastRainIntensity) {
      this.track.setRainIntensity(state.rainIntensity);
      this.updateLighting(state.rainIntensity);
      this.atmosphere.updateRain(state.rainIntensity);
      this.clouds.updateRain(state.rainIntensity);
      this.lastRainIntensity = state.rainIntensity;
    }

    this.clouds.update(this.elapsed);

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
        updateFollowCamera(
          this.camera,
          player,
          state.phase,
          gridSlotForCar(player),
          state.cameraMode,
          dt,
          this.followState,
          entry.group,
        );
      }
    } else if (state.cameraMode === "overview") {
      this.updateOverviewCamera(state, cars);
      this.orbitControls?.update();
    }

    this.renderer.render(this.scene, this.camera);

    const dprChange = this.adaptiveDpr?.tick(dt);
    if (dprChange !== null && dprChange !== undefined) {
      this.runtimeDprCap = dprChange;
      this.resize();
    }
  }

  resize(): void {
    if (!this.hostElement || !this.renderer || !this.camera) return;
    const size = getHostElementSize(this.hostElement, { allowViewportFallback: false });
    if (!size) {
      this.pendingResize = true;
      return;
    }

    this.pendingResize = false;
    const { width, height } = size;
    if (width === this.lastCanvasWidth && height === this.lastCanvasHeight) return;

    this.lastCanvasWidth = width;
    this.lastCanvasHeight = height;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.runtimeDprCap));
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, true);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.orbitControls?.dispose();
    this.track.dispose();
    this.terrain.dispose();
    this.atmosphere.dispose();
    this.clouds.dispose();
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
    this.directionalLight.castShadow = this.quality.shadows;
    if (this.quality.shadows && this.quality.shadowMapSize > 0) {
      this.directionalLight.shadow.mapSize.set(
        this.quality.shadowMapSize,
        this.quality.shadowMapSize,
      );
    }
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
    const arr = new Float32Array(this.rainCount * 3);
    for (let i = 0; i < this.rainCount; i++) {
      sampleRainInField(this.rainSpawnScratch, true);
      arr[i * 3] = this.rainSpawnScratch.x;
      arr[i * 3 + 1] = this.rainSpawnScratch.y;
      arr[i * 3 + 2] = this.rainSpawnScratch.z;
    }
    return arr;
  }

  private respawnRainDrop(arr: Float32Array, index: number): void {
    sampleRainInField(this.rainSpawnScratch, false);
    arr[index * 3] = this.rainSpawnScratch.x;
    arr[index * 3 + 1] = this.rainSpawnScratch.y;
    arr[index * 3 + 2] = this.rainSpawnScratch.z;
  }

  private updateRain(intensity: number, delta: number): void {
    if (intensity <= 0.12) {
      this.rainPoints.visible = false;
      return;
    }
    this.rainPoints.visible = true;
    const mat = this.rainPoints.material as THREE.PointsMaterial;
    mat.opacity = 0.45 + intensity * 0.4;
    mat.size = 0.08 + intensity * 0.06;

    const attrs = this.rainPoints.geometry.attributes.position as THREE.BufferAttribute;
    const arr = attrs.array as Float32Array;
    const speed = 10 + intensity * 28;
    for (let i = 0; i < this.rainCount; i++) {
      arr[i * 3 + 1] -= speed * delta;
      if (arr[i * 3 + 1] < 0) this.respawnRainDrop(arr, i);
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
        gridSlotForCar(car),
        this.poseScratch,
      );

      entry.group.position.copy(pose.position);
      if (phase === "ready" || phase === "starting") {
        entry.group.rotation.set(0, getGridSlot(car.gridSlot).rotationY, 0);
      } else {
        entry.group.quaternion.copy(quatFromTangent(pose.tangent, this.orientScratch));
      }

      if (car.status === "sliding" || car.status === "spun") {
        const wobble =
          Math.sin(performance.now() * 0.028) * (car.status === "spun" ? 0.55 : 0.22);
        entry.group.rotateY(wobble);
      }

      const brokenDown = isBrokenDownOnTrack(car);

      const mesh = entry.group.children.find((c) => c.name === "f1Car");
      if (mesh) {
        if (meta.isPlayer && car.color !== entry.bodyColor) {
          setF1CarBodyColor(mesh, car.color);
          entry.bodyColor = car.color;
          if (entry.playerRing) {
            (entry.playerRing.material as THREE.MeshBasicMaterial).color.set(car.color);
          }
        }
        mesh.rotation.z = brokenDown ? 0.12 : 0;
        if (brokenDown) {
          updateF1CarHazardLights(mesh, performance.now());
          updateF1CarWheels(mesh, 0, 0, dt);
        } else {
          updateF1CarBrakeLights(mesh, car.brakeIntensity);
          updateF1CarWheels(mesh, car.speedMps, 0, dt);
        }
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
      if (!isFiniteVec3(worldPos)) return;

      if (this.overviewSnapKey !== "locked") {
        this.overviewSnapKey = "locked";
        this.camera.position.set(
          worldPos.x,
          worldPos.y + OVERVIEW_HEIGHT,
          worldPos.z + OVERVIEW_BACK,
        );
        this.camera.up.set(0, 1, 0);
        this.orbitControls.target.set(worldPos.x, worldPos.y + 2, worldPos.z);
        safeLookAt(this.camera, this.orbitControls.target);
        this.overviewPrevTarget.copy(this.orbitControls.target);
        this.orbitControls.update();
      } else {
        this.overviewNextTarget.copy(worldPos);
        this.overviewNextTarget.y += 2;
        this.overviewDelta.copy(this.overviewNextTarget).sub(this.overviewPrevTarget);
        clampPanDelta(this.overviewDelta);
        if (!isFiniteVec3(this.overviewDelta)) return;

        this.orbitControls.target.copy(this.overviewNextTarget);
        this.camera.position.add(this.overviewDelta);
        if (!isFiniteVec3(this.camera.position)) {
          this.overviewSnapKey = "";
          return;
        }
        this.overviewPrevTarget.copy(this.overviewNextTarget);
      }
    } else if (!state.overviewFollow) {
      this.overviewSnapKey = "";
    }
  }
}
