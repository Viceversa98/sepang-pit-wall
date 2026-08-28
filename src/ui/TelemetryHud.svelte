<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import {
    HeaderIndex,
    vehicleBaseIndex,
    VehicleField,
    type SharedSimViews,
  } from "@/shared/sharedState";

  interface Props {
    shared: SharedSimViews;
    vehicleIndex?: number;
  }

  let { shared, vehicleIndex = 0 }: Props = $props();

  let speedKph = $state(0);
  let physicsTick = $state(0);
  let aiTick = $state(0);
  let waypointIndex = $state(0);

  let frameId = 0;

  const poll = (): void => {
    const base = vehicleBaseIndex(vehicleIndex);
    const speed = shared.floats[base + VehicleField.speed];
    speedKph = speed * 3.6;
    physicsTick = Atomics.load(shared.header, HeaderIndex.physicsTick);
    aiTick = Atomics.load(shared.header, HeaderIndex.aiTick);
    waypointIndex = shared.floats[base + VehicleField.waypointIndex] | 0;
    frameId = requestAnimationFrame(poll);
  };

  onMount(() => {
    frameId = requestAnimationFrame(poll);
  });

  onDestroy(() => {
    cancelAnimationFrame(frameId);
  });
</script>

<div class="hud">
  <div class="panel">
    <div class="label">SPEED</div>
    <div class="value">{speedKph.toFixed(0)} <span class="unit">KPH</span></div>
  </div>
  <div class="panel">
    <div class="label">PHYS / AI</div>
    <div class="value">{physicsTick} / {aiTick}</div>
  </div>
  <div class="panel">
    <div class="label">WP</div>
    <div class="value">{waypointIndex}</div>
  </div>
</div>

<style>
  .hud {
    position: absolute;
    top: 1rem;
    left: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    color: #d7ffe8;
    text-shadow: 0 0 8px rgba(0, 255, 140, 0.35);
    pointer-events: none;
  }

  .panel {
    padding: 0.45rem 0.65rem;
    border: 1px solid rgba(0, 255, 140, 0.35);
    background: rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(4px);
    min-width: 7rem;
  }

  .label {
    font-size: 0.65rem;
    letter-spacing: 0.12em;
    opacity: 0.75;
  }

  .value {
    font-size: 1.25rem;
    font-weight: 700;
  }

  .unit {
    font-size: 0.75rem;
    opacity: 0.8;
  }
</style>
