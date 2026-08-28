import "@/lib/threeConsoleFilter";
import "@/styles/globals.css";
import { mount } from "svelte";
import { RaceDirector } from "@/sim/RaceDirector";
import GameShell from "@/ui/GameShell.svelte";

const assertSharedArrayBuffer = (): void => {
  if (typeof SharedArrayBuffer === "undefined") {
    throw new Error(
      "SharedArrayBuffer unavailable. Serve with COOP/COEP headers (see vite.config.ts).",
    );
  }
};

const bootstrap = (): void => {
  assertSharedArrayBuffer();

  const appRoot = document.querySelector<HTMLDivElement>("#app");
  if (!appRoot) throw new Error("Missing #app root element.");

  const director = new RaceDirector();
  director.initVehicleFlags();
  director.spawnWorkers();

  let frameId = 0;
  let lastTime = performance.now();

  const simLoop = (now: number): void => {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    director.tick(dt);
    frameId = requestAnimationFrame(simLoop);
  };
  frameId = requestAnimationFrame(simLoop);

  mount(GameShell, { target: appRoot });

  window.addEventListener("beforeunload", () => {
    cancelAnimationFrame(frameId);
    director.shutdown();
  });
};

bootstrap();
