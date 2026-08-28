import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
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
    this.camera.position.set(4, 2.2, 5);

    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.45));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(4, 8, 6);
    scene.add(key);

    this.car = createF1CarMesh(color, true);
    scene.add(this.car);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enablePan = false;
    this.controls.minDistance = 3;
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

    useRaceStore.subscribe((state) => {
      const mesh = this.car;
      if (!mesh) return;
      mesh.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        const mat = child.material;
        if (!(mat instanceof THREE.MeshStandardMaterial)) return;
        if (mat.color.getHexString() === "ffffff") return;
        mat.color.set(state.selectedPlayerColor);
      });
    });
  }

  resize(): void {
    if (!this.hostElement) return;
    const w = this.hostElement.clientWidth;
    const h = this.hostElement.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    this.controls?.dispose();
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
  }
}
