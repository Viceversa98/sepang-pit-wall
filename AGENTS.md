# Sepang Pit Wall

Vite + Svelte + Three.js + Rapier multithreaded F1 race simulation.

## Stack

- **Build:** Vite (COOP/COEP for `SharedArrayBuffer`)
- **UI:** Svelte 5 + Tailwind CSS v4
- **3D:** Vanilla Three.js (`src/scene/`)
- **Physics / AI:** Web Workers + Rapier WASM (`src/workers/`)
- **State:** Svelte stores (cold) + SharedArrayBuffer (hot transforms)

## Commands

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
npm run preview
```

## Architecture

- `src/main.ts` — bootstrap, mount `GameShell`, spawn workers via `RaceDirector`
- `src/sim/RaceDirector.ts` — `stepRaceSimulation` + SAB pose sync
- `src/workers/physicsWorker.ts` — Rapier step, track trimesh
- `src/workers/aiWorker.ts` — PID waypoint AI
- `src/shared/sharedState.ts` — zero-copy vehicle buffer layout
- `src/stores/raceStore.ts` — race rules, pit stops, academy hooks
- `src/ui/` — Svelte overlays (strategy desk, HUD, academy)

Track geometry is **code-generated** from `src/lib/trackCurve.ts` (Sepang OSM centerline).
