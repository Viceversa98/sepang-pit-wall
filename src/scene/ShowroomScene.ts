import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { getHostElementSize } from "@/lib/viewportLayout";
import { createF1CarMesh } from "@/scene/F1CarMesh";
import { useRaceStore } from "@/stores/raceStore";

export class ShowroomScene {
  private renderer!: THREE.WebGLRenderer;
  private camera!: THREE.PerspectiveCamera;
  private controls!: OrbitControls;
  private car!: THREE.Group;
  private hostElement!: HTMLElement;
  private frameId = 0;
  private disposed = false;

  init(hostElement: HTMLElement): void {
    this.hostElement = hostElement;
    const color = useRaceStore.getState().selectedPlayerColor;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    this.camera.position.set(3.1, 1.7, 3.9);

    // Match RaceScene's dry-weather light rig so the livery reads the same
    // color here as it does in the game.
    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.38));
    const key = new THREE.DirectionalLight(0xffffff, 1.45);
    key.position.set(4, 8, 6);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.55);
    fill.position.set(-5, 4, -4);
    scene.add(fill);

    this.car = createF1CarMesh(color, true);
    scene.add(this.car);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enablePan = false;
    this.controls.minDistance = 2.4;
    this.controls.maxDistance = 12;
    this.controls.target.set(0, 0.4, 0);

    hostElement.appendChild(this.renderer.domElement);
    this.resize();

    const loop = (): void => {
      if (this.disposed) return;
      this.car.rotation.y += 0.004;
      this.controls.update();
      this.renderer.render(scene, this.camera);
      this.frameId = requestAnimationFrame(loop);
    };
    this.frameId = requestAnimationFrame(loop);

    // Recolor only the body livery — repainting every non-white material
    // turned carbon, wings and tyres into the player color, which is why the
    // showroom car didn't match the in-game one.
    useRaceStore.subscribe((state) => {
      const bodyMat = this.car?.userData.bodyMat as THREE.MeshStandardMaterial | undefined;
      if (!bodyMat) return;
      bodyMat.color.set(state.selectedPlayerColor);
      bodyMat.emissive.set(state.selectedPlayerColor);
    });
  }

  resize(): void {
    if (!this.hostElement || !this.renderer || !this.camera) return;
    const size = getHostElementSize(this.hostElement);
    if (!size) return;

    const { width, height } = size;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, true);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    this.controls?.dispose();
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
  }
}
