/**
 * Web Audio race / pit cues — prefers /public/audio/pit/*.wav, procedural fallback.
 * Unlock on first user gesture; respects mute + tab visibility.
 */

type CueId =
  | "pitBed"
  | "gun"
  | "jackUp"
  | "jackDown"
  | "release"
  | "unsafe"
  | "raceBed"
  | "startRed"
  | "startGreen"
  | "lightsOut";

const WAV = {
  gun: "/audio/pit/gun.wav",
  jack: "/audio/pit/jack.wav",
  release: "/audio/pit/release.wav",
  unsafe: "/audio/pit/unsafe.wav",
  pitBed: "/audio/pit/pit-bed.wav",
  raceBed: "/audio/pit/race-bed.wav",
} as const;

const MAX_RACE_SPEED_MPS = 120;
const IDLE_RPM = 3200;
const MAX_RPM = 12800;

let ctx: AudioContext | null = null;
let unlocked = false;
let unlockPromise: Promise<boolean> | null = null;
let muted = false;
let buffersLoaded = false;
const buffers: Partial<Record<keyof typeof WAV, AudioBuffer>> = {};

let pitBedGain: GainNode | null = null;
let pitBedOsc: OscillatorNode[] = [];
let pitBedSrc: AudioBufferSourceNode | null = null;

let engineGain: GainNode | null = null;
let engineFilter: BiquadFilterNode | null = null;
let engineOsc: OscillatorNode[] = [];
let engineSrc: AudioBufferSourceNode | null = null;
let engineNoise: AudioBufferSourceNode | null = null;
let engineRunning = false;
let engineSpeedMps = 0;

let lastGunAt = 0;
let lastJackAt = 0;
let lastReleaseAt = 0;
let lastUnsafeAt = 0;
let lastStartRedAt = 0;

const ensureCtx = (): AudioContext | null => {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
};

const loadBuffers = async (): Promise<void> => {
  const c = ensureCtx();
  if (!c || buffersLoaded) return;
  await Promise.all(
    (Object.keys(WAV) as (keyof typeof WAV)[]).map(async (key) => {
      try {
        const res = await fetch(WAV[key]);
        if (!res.ok) return;
        const arr = await res.arrayBuffer();
        buffers[key] = await c.decodeAudioData(arr.slice(0));
      } catch {
        /* procedural fallback */
      }
    }),
  );
  buffersLoaded = true;
};

export const unlockRaceAudio = async (): Promise<boolean> => {
  const c = ensureCtx();
  if (!c) return false;
  if (unlocked && c.state === "running") return true;

  if (!unlockPromise) {
    unlockPromise = (async () => {
      if (c.state === "suspended") {
        try {
          await c.resume();
        } catch {
          unlocked = false;
          return false;
        }
      }
      unlocked = c.state === "running";
      if (unlocked) await loadBuffers();
      return unlocked;
    })().finally(() => {
      unlockPromise = null;
    });
  }
  return unlockPromise;
};

const engineMasterGain = (): number =>
  muted || (typeof document !== "undefined" && document.visibilityState === "hidden") ? 0 : 1;

export const setRaceAudioMuted = (value: boolean): void => {
  muted = value;
  const master = engineMasterGain();
  if (pitBedGain) pitBedGain.gain.value = master * 0.045;
  if (engineGain) engineGain.gain.value = master * 0.055;
};

export const isRaceAudioMuted = (): boolean => muted;

const masterOk = (): boolean =>
  !!ctx &&
  unlocked &&
  !muted &&
  (typeof document === "undefined" || document.visibilityState !== "hidden");

const beep = (
  freq: number,
  dur: number,
  type: OscillatorType = "square",
  gain = 0.08,
  when = 0,
): void => {
  const c = ensureCtx();
  if (!c || !masterOk()) return;
  const t0 = c.currentTime + when;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g);
  g.connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
};

const playBuffer = (key: keyof typeof WAV, gain = 0.12): void => {
  const c = ensureCtx();
  const buf = buffers[key];
  if (!c || !masterOk() || !buf) return;
  const src = c.createBufferSource();
  const g = c.createGain();
  g.gain.value = gain;
  src.buffer = buf;
  src.connect(g);
  g.connect(c.destination);
  src.start();
};

const rpmFromSpeed = (speedMps: number): number => {
  const t = Math.min(1, Math.max(0, speedMps / MAX_RACE_SPEED_MPS));
  return IDLE_RPM + t * (MAX_RPM - IDLE_RPM);
};

const applyEngineRpm = (rpm: number): void => {
  const c = ensureCtx();
  if (!c || !engineFilter) return;
  const baseHz = (rpm / 60) * 1.5;
  engineFilter.frequency.setTargetAtTime(280 + rpm * 0.09, c.currentTime, 0.06);
  engineFilter.Q.setTargetAtTime(1.2 + rpm / 9000, c.currentTime, 0.08);
  for (let i = 0; i < engineOsc.length; i++) {
    const mult = [1, 1.52, 2.08, 3.1][i] ?? 1;
    engineOsc[i].frequency.setTargetAtTime(baseHz * mult, c.currentTime, 0.05);
  }
};

const makeNoiseBuffer = (c: AudioContext): AudioBuffer => {
  const len = c.sampleRate * 2;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
};

const startEngineSynth = (): void => {
  const c = ensureCtx();
  if (!c || !masterOk() || engineGain) return;

  if (buffers.raceBed) {
    engineGain = c.createGain();
    engineGain.gain.value = 0.055;
    engineGain.connect(c.destination);
    engineSrc = c.createBufferSource();
    engineSrc.buffer = buffers.raceBed;
    engineSrc.loop = true;
    engineSrc.connect(engineGain);
    engineSrc.start();
    engineRunning = true;
    return;
  }

  engineGain = c.createGain();
  engineGain.gain.value = 0.055;
  engineFilter = c.createBiquadFilter();
  engineFilter.type = "lowpass";
  engineFilter.frequency.value = 420;
  engineFilter.Q.value = 1.4;
  engineFilter.connect(engineGain);
  engineGain.connect(c.destination);

  const harmonics: Array<{ type: OscillatorType; gain: number }> = [
    { type: "sawtooth", gain: 0.42 },
    { type: "square", gain: 0.18 },
    { type: "sawtooth", gain: 0.12 },
    { type: "triangle", gain: 0.08 },
  ];

  engineOsc = harmonics.map(({ type, gain }) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = 42;
    g.gain.value = gain;
    o.connect(g);
    g.connect(engineFilter!);
    o.start();
    return o;
  });

  const noiseBuf = makeNoiseBuffer(c);
  engineNoise = c.createBufferSource();
  engineNoise.buffer = noiseBuf;
  engineNoise.loop = true;
  const noiseGain = c.createGain();
  noiseGain.gain.value = 0.035;
  engineNoise.connect(noiseGain);
  noiseGain.connect(engineFilter);
  engineNoise.start();

  engineRunning = true;
  applyEngineRpm(IDLE_RPM);
};

const stopEngineSynth = (): void => {
  try {
    engineSrc?.stop();
  } catch {
    /* */
  }
  engineSrc = null;
  try {
    engineNoise?.stop();
  } catch {
    /* */
  }
  engineNoise = null;
  for (const o of engineOsc) {
    try {
      o.stop();
    } catch {
      /* already stopped */
    }
  }
  engineOsc = [];
  engineFilter?.disconnect();
  engineFilter = null;
  engineGain?.disconnect();
  engineGain = null;
  engineRunning = false;
  engineSpeedMps = 0;
};

const updateEngineSpeed = (speedMps: number): void => {
  if (!engineRunning) return;
  engineSpeedMps = speedMps;
  if (engineSrc && buffers.raceBed) {
    const c = ensureCtx();
    if (c) {
      const t = Math.min(1, Math.max(0, speedMps / MAX_RACE_SPEED_MPS));
      engineSrc.playbackRate.setTargetAtTime(0.85 + t * 0.55, c.currentTime, 0.08);
    }
    return;
  }
  applyEngineRpm(rpmFromSpeed(speedMps));
};

/** Live sim hook — update RPM without full snapshot when speed changes every frame. */
export const syncEngineSpeed = (speedMps: number): void => {
  if (!engineRunning) return;
  if (Math.abs(speedMps - engineSpeedMps) > 0.35) {
    updateEngineSpeed(speedMps);
  }
};

const startPitBed = (): void => {
  const c = ensureCtx();
  if (!c || !masterOk() || pitBedGain) return;
  pitBedGain = c.createGain();
  pitBedGain.gain.value = 0.045;
  pitBedGain.connect(c.destination);

  if (buffers.pitBed) {
    pitBedSrc = c.createBufferSource();
    pitBedSrc.buffer = buffers.pitBed;
    pitBedSrc.loop = true;
    pitBedSrc.connect(pitBedGain);
    pitBedSrc.start();
    return;
  }

  const freqs = [55, 82, 110];
  pitBedOsc = freqs.map((f, i) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = i === 0 ? "sawtooth" : "triangle";
    o.frequency.value = f;
    g.gain.value = 0.35 / freqs.length;
    o.connect(g);
    g.connect(pitBedGain!);
    o.start();
    return o;
  });
};

const stopPitBed = (): void => {
  try {
    pitBedSrc?.stop();
  } catch {
    /* */
  }
  pitBedSrc = null;
  for (const o of pitBedOsc) {
    try {
      o.stop();
    } catch {
      /* already stopped */
    }
  }
  pitBedOsc = [];
  pitBedGain?.disconnect();
  pitBedGain = null;
};

/** FIA start-light tick when each red illuminates. */
export const playStartRedLight = (index: number): void => {
  const now = performance.now();
  if (now - lastStartRedAt < 120) return;
  lastStartRedAt = now;
  const pitch = 920 + index * 35;
  beep(pitch, 0.09, "square", 0.11);
  beep(pitch * 0.5, 0.07, "sine", 0.04, 0.01);
};

/** All five reds on — brief hold tone before lights out. */
export const playStartGreenHold = (): void => {
  beep(1180, 0.14, "square", 0.1);
  beep(760, 0.12, "triangle", 0.05, 0.02);
};

/** Lights extinguished — race start. */
export const playLightsOut = (): void => {
  beep(640, 0.05, "square", 0.08);
  beep(420, 0.08, "sawtooth", 0.06, 0.03);
};

/** Staggered wheel-gun bursts during early service. */
export const playWheelGuns = (elapsed: number): void => {
  if (!masterOk() || elapsed > 1.5) return;
  const now = performance.now();
  if (now - lastGunAt < 90) return;
  lastGunAt = now;
  if (buffers.gun) {
    playBuffer("gun", 0.1);
    return;
  }
  const slot = Math.floor(elapsed * 8) % 4;
  beep(1800 + slot * 120, 0.05, "square", 0.06);
  beep(900 + slot * 40, 0.04, "sawtooth", 0.03, 0.01);
};

export const playJack = (up: boolean): void => {
  const now = performance.now();
  if (now - lastJackAt < 400) return;
  lastJackAt = now;
  if (buffers.jack) {
    playBuffer("jack", 0.12);
    return;
  }
  if (up) {
    beep(120, 0.18, "triangle", 0.07);
    beep(80, 0.22, "sine", 0.05, 0.05);
  } else {
    beep(90, 0.12, "triangle", 0.06);
    beep(60, 0.15, "sine", 0.04, 0.04);
  }
};

export const playReleaseBeep = (): void => {
  const now = performance.now();
  if (now - lastReleaseAt < 800) return;
  lastReleaseAt = now;
  if (buffers.release) {
    playBuffer("release", 0.14);
    return;
  }
  beep(880, 0.12, "sine", 0.09);
  beep(1320, 0.1, "sine", 0.07, 0.12);
};

export const playUnsafeSting = (): void => {
  const now = performance.now();
  if (now - lastUnsafeAt < 1200) return;
  lastUnsafeAt = now;
  if (buffers.unsafe) {
    playBuffer("unsafe", 0.16);
    return;
  }
  beep(220, 0.25, "sawtooth", 0.1);
  beep(160, 0.3, "square", 0.08, 0.08);
};

export type RaceAudioSnapshot = {
  phase: "landing" | "ready" | "starting" | "racing" | "finished";
  playerBoxing: boolean;
  pitPhase: "in" | "stopped" | "out" | null;
  pitStopElapsed: number;
  pitServiceDone: boolean;
  pitHoldTraffic: boolean;
  racing: boolean;
  speedMps: number;
  startLightCount: number;
  startLightsGreen: boolean;
  startLightsOut: boolean;
  unsafeDelta: boolean;
  justReleased: boolean;
  startRedDelta: number;
  startGreenEdge: boolean;
  lightsOutEdge: boolean;
};

/** @deprecated use RaceAudioSnapshot */
export type PitAudioSnapshot = RaceAudioSnapshot;

/** Drive ambient beds + one-shots from player pit / race state. */
export const syncRaceAudio = async (snap: RaceAudioSnapshot): Promise<void> => {
  const ok = await unlockRaceAudio();
  if (!ok) return;

  const inPit =
    snap.playerBoxing &&
    (snap.pitPhase === "in" || snap.pitPhase === "stopped" || snap.pitPhase === "out");

  if (inPit) startPitBed();
  else stopPitBed();

  const engineActive =
    (snap.racing || snap.phase === "starting" || snap.phase === "ready") &&
    !inPit &&
    snap.phase !== "finished" &&
    snap.phase !== "landing";

  if (engineActive) {
    startEngineSynth();
    const speed =
      snap.phase === "starting" || snap.phase === "ready" ? 0 : snap.speedMps;
    if (Math.abs(speed - engineSpeedMps) > 0.35 || snap.phase === "starting" || snap.phase === "ready") {
      updateEngineSpeed(speed);
    }
  } else {
    stopEngineSynth();
  }

  if (snap.startRedDelta > 0) {
    playStartRedLight(snap.startLightCount);
  }
  if (snap.startGreenEdge) playStartGreenHold();
  if (snap.lightsOutEdge) playLightsOut();

  if (snap.pitPhase === "stopped" && !snap.pitServiceDone) {
    playWheelGuns(snap.pitStopElapsed);
    if (snap.pitStopElapsed > 0.05 && snap.pitStopElapsed < 0.25) playJack(true);
    if (snap.pitStopElapsed > 2.1 && snap.pitStopElapsed < 2.35) playJack(false);
  }

  if (snap.justReleased) playReleaseBeep();
  if (snap.unsafeDelta) playUnsafeSting();
};

export const disposeRaceAudio = (): void => {
  stopPitBed();
  stopEngineSynth();
};

export type { CueId };
