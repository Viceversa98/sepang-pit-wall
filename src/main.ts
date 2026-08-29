import "@/lib/threeConsoleFilter";
import "@/styles/globals.css";
import { mount } from "svelte";
import { runFrameRenderers } from "@/lib/frameLoop";
import { RaceDirector } from "@/sim/RaceDirector";
import GameShell from "@/ui/GameShell.svelte";

const assertSharedArrayBuffer = (): void => {
  if (typeof SharedArrayBuffer !== "undefined") return;

  const isolated = typeof crossOriginIsolated === "boolean" && crossOriginIsolated;
  const hint = isolated
    ? "Your browser blocked SharedArrayBuffer despite cross-origin isolation."
    : [
        "This app must be served with COOP/COEP headers (not opened as a raw file).",
        "Local: npm run dev  or  npm run preview",
        "Deploy: use a host that sets Cross-Origin-Opener-Policy + Cross-Origin-Embedder-Policy (see vercel.json / public/_headers).",
      ].join(" ");

  throw new Error(`SharedArrayBuffer unavailable. ${hint}`);
};

const bootstrap = (): void => {
  assertSharedArrayBuffer();

  const appRoot = document.querySelector<HTMLDivElement>("#app");
  if (!appRoot) throw new Error("Missing #app root element.");

  const director = new RaceDirector();
  director.initVehicleFlags();

  let frameId = 0;
  let lastTime = performance.now();

  // One loop: sim first, then renderers — same frame, same dt. Keeping the
  // renderer in its own rAF loop caused stale-state renders (caterpillar).
  const simLoop = (now: number): void => {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    director.tick(dt);
    runFrameRenderers(dt);
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
