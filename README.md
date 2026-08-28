# Sepang Pit Wall

Multithreaded F1 strategy desk and circuit spectator for Sepang International Circuit.

## Quick start

```bash
npm install
npm run dev
```

Open `http://localhost:5173` — requires COOP/COEP headers (configured in `vite.config.ts` for `SharedArrayBuffer`).

## Stack

| Layer | Tech |
|-------|------|
| Build | Vite 6 |
| UI | Svelte 5 + Tailwind v4 |
| 3D | Three.js (vanilla) |
| Physics | Rapier WASM (Web Worker) |
| AI | PID + waypoints (Web Worker) |
| Sync | SharedArrayBuffer |

## Project layout

```
src/
  main.ts              Entry — GameShell + RaceDirector + workers
  sim/RaceDirector.ts  Race rules tick + SAB pose sync
  workers/             physicsWorker.ts, aiWorker.ts
  shared/              sharedState.ts, sepangWaypoints.ts
  scene/               RaceScene, buildTrack, F1CarMesh
  stores/              raceStore.ts, academyStore.ts (Svelte stores)
  ui/                  Svelte overlays (strategy desk, HUD, academy)
  lib/                 Track curve, physics, pit logic, academy curriculum
```

Track surface and AI waypoints are **code-generated** from OSM centerline data (`src/lib/trackCurve.ts`).

## Scripts

- `npm run dev` — Vite dev server
- `npm run build` — typecheck + production bundle
- `npm run preview` — preview production build
