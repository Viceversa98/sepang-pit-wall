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

const WAV_BASE = `${import.meta.env.BASE_URL}audio/pit/`;

const WAV = {
  gun: `${WAV_BASE}gun.wav`,
  jack: `${WAV_BASE}jack.wav`,
  release: `${WAV_BASE}release.wav`,
  unsafe: `${WAV_BASE}unsafe.wav`,
  pitBed: `${WAV_BASE}pit-bed.wav`,
  raceBed: `${WAV_BASE}race-bed.wav`,
} as const;

const MAX_RACE_SPEED_MPS = 120;
const IDLE_RPM = 4200;
const MAX_RPM = 12800;
/** Match start-light tick peak (`playStartRedLight` main beep ≈ 0.11). */
const START_CUE_GAIN = 0.11;
/** Loops need higher gain than one-shots to feel equally loud. */
const ENGINE_LOOP_GAIN = START_CUE_GAIN * 2;
const PIT_LOOP_GAIN = START_CUE_GAIN * 1.6;
const ENGINE_PLAYBACK_IDLE = 1.12;
const ENGINE_PLAYBACK_MAX = 2.05;

let ctx: AudioContext | null = null;
let unlocked = false;
let unlockPromise: Promise<boolean> | null = null;
let muted = false;
let buffersLoaded = false;
const buffers: Partial<Record<keyof typeof WAV, AudioBuffer>> = {};
const buffersReadyListeners = new Set<() => void>();
let engineLoopPrimed = false;
let pitLoopPrimed = false;
let engineLoopUsesRaceBed = false;

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

const createAudioContext = (): AudioContext | null => {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  return new AC();
};

/** Returns the live context — only created during unlock (user gesture). */
const ensureCtx = (): AudioContext | null => {
  if (ctx?.state === "closed") ctx = null;
  return ctx;
};

const audioContextRunning = (c: AudioContext): boolean => c.state === "running";

/** Kick resume + silent buffer in the same user-gesture turn (no await). */
const primeAudioContextSync = (c: AudioContext): void => {
  if (audioContextRunning(c)) return;
  try {
    void c.resume();
  } catch {
    /* continue to silent priming */
  }
  if (audioContextRunning(c)) return;
  const silent = c.createBuffer(1, 1, c.sampleRate);
  const src = c.createBufferSource();
  src.buffer = silent;
  src.connect(c.destination);
  src.start(0);
  try {
    void c.resume();
  } catch {
    /* async resume may still succeed */
  }
};

/** iOS / Safari fallback when sync priming did not reach "running" yet. */
const primeAudioContext = async (c: AudioContext): Promise<void> => {
  if (audioContextRunning(c)) return;
  primeAudioContextSync(c);
  if (audioContextRunning(c)) return;
  try {
    await c.resume();
  } catch {
    /* continue */
  }
  if (audioContextRunning(c)) return;
  const silent = c.createBuffer(1, 1, c.sampleRate);
  const src = c.createBufferSource();
  src.buffer = silent;
  src.connect(c.destination);
  src.start(0);
  await c.resume();
};

const fetchAudio = async (url: string, ms = 8000): Promise<Response | null> => {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
};

const loadBuffers = async (): Promise<void> => {
  const c = ensureCtx();
  if (!c || buffersLoaded) return;
  await Promise.all(
    (Object.keys(WAV) as (keyof typeof WAV)[]).map(async (key) => {
      try {
        const res = await fetchAudio(WAV[key]);
        if (!res?.ok) return;
        const arr = await res.arrayBuffer();
        buffers[key] = await c.decodeAudioData(arr.slice(0));
      } catch {
        /* procedural fallback */
      }
    }),
  );
  buffersLoaded = true;
  stopEngineSynth();
  stopPitBed();
  engineLoopPrimed = false;
  pitLoopPrimed = false;
  for (const cb of buffersReadyListeners) cb();
};

/** Re-sync loops after WAV decode (engine/pit beds upgrade from procedural). */
export const onRaceAudioBuffersReady = (cb: () => void): (() => void) => {
  buffersReadyListeners.add(cb);
  if (buffersLoaded) cb();
  return () => buffersReadyListeners.delete(cb);
};

/** True only after a user gesture successfully started the AudioContext. */
export const isRaceAudioUnlocked = (): boolean =>
  unlocked && !!ctx && ctx.state !== "closed";

/** Resume suspended context synchronously when possible (mobile tab focus / gesture). */
export const ensureRaceAudioRunning = (): boolean => {
  const c = ensureCtx();
  if (!c || !unlocked) return false;
  if (audioContextRunning(c)) return true;
  if (c.state === "suspended") {
    primeAudioContextSync(c);
  }
  return audioContextRunning(c);
};

export const unlockRaceAudio = async (): Promise<boolean> => {
  if (typeof window === "undefined") return false;
  if (ctx?.state === "running") {
    unlocked = true;
    return true;
  }

  if (!unlockPromise) {
    unlockPromise = (async () => {
      try {
        if (!ctx || ctx.state === "closed") ctx = createAudioContext();
        const c = ctx;
        if (!c) {
          unlocked = false;
          return false;
        }
        // Sync priming must run in the gesture turn; await only if still suspended.
        primeAudioContextSync(c);
        if (c.state !== "running") await primeAudioContext(c);
        unlocked = c.state === "running";
        if (unlocked) {
          stopEngineSynth();
          stopPitBed();
          engineLoopPrimed = false;
          pitLoopPrimed = false;
          if (!buffersLoaded) void loadBuffers();
        }
        return unlocked;
      } catch {
        unlocked = false;
        return false;
      } finally {
        unlockPromise = null;
      }
    })();
  }
  return unlockPromise;
};

/** Call at the start of click/key handlers — unlock before store updates. */
export const unlockRaceAudioFromGesture = (): void => {
  void unlockRaceAudio();
};

const engineMasterGain = (): number =>
  muted || (typeof document !== "undefined" && document.visibilityState === "hidden") ? 0 : 1;

export const setRaceAudioMuted = (value: boolean): void => {
  muted = value;
  const master = engineMasterGain();
  if (pitBedGain) pitBedGain.gain.value = master * PIT_LOOP_GAIN;
  if (engineGain) engineGain.gain.value = master * ENGINE_LOOP_GAIN;
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
  if (!c || !masterOk() || !audioContextRunning(c) || engineGain) return;

  if (buffers.raceBed) {
    engineGain = c.createGain();
    engineGain.gain.value = ENGINE_LOOP_GAIN * engineMasterGain();
    engineGain.connect(c.destination);
    engineSrc = c.createBufferSource();
    engineSrc.buffer = buffers.raceBed;
    engineSrc.loop = true;
    engineSrc.connect(engineGain);
    engineSrc.playbackRate.value = enginePlaybackRate(0);
    engineSrc.start();
    engineRunning = true;
    engineLoopUsesRaceBed = true;
    engineSpeedMps = 0;
    return;
  }

  engineGain = c.createGain();
  engineGain.gain.value = ENGINE_LOOP_GAIN * engineMasterGain();
  engineLoopUsesRaceBed = false;
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
  engineLoopPrimed = false;
  engineLoopUsesRaceBed = false;
};

const enginePlaybackRate = (speedMps: number): number => {
  const t = Math.min(1, Math.max(0, speedMps / MAX_RACE_SPEED_MPS));
  return ENGINE_PLAYBACK_IDLE + t * (ENGINE_PLAYBACK_MAX - ENGINE_PLAYBACK_IDLE);
};

const updateEngineSpeed = (speedMps: number): void => {
  if (!engineRunning) return;
  engineSpeedMps = speedMps;
  if (engineSrc && buffers.raceBed) {
    const c = ensureCtx();
    if (c) {
      engineSrc.playbackRate.setTargetAtTime(
        enginePlaybackRate(speedMps),
        c.currentTime,
        0.06,
      );
    }
    return;
  }
  applyEngineRpm(rpmFromSpeed(speedMps));
};

/** Live sim hook — update RPM without full snapshot when speed changes every frame. */
export const syncEngineSpeed = (speedMps: number): void => {
  if (!engineRunning || !masterOk()) return;
  if (Math.abs(speedMps - engineSpeedMps) > 0.35) {
    updateEngineSpeed(speedMps);
  }
};

const startPitBed = (): void => {
  const c = ensureCtx();
  if (!c || !masterOk() || !audioContextRunning(c) || pitBedGain) return;
  pitBedGain = c.createGain();
  pitBedGain.gain.value = PIT_LOOP_GAIN * engineMasterGain();
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
  pitLoopPrimed = false;
};

type LoopAudioSnap = {
  phase: "landing" | "ready" | "starting" | "racing" | "finished";
  racing: boolean;
  playerBoxing: boolean;
  pitPhase: "in" | "stopped" | "out" | null;
  speedMps: number;
};

/** Continuous engine / pit beds — safe to call every frame once unlocked. */
export const syncRaceLoopAudio = (snap: LoopAudioSnap): void => {
  if (!isRaceAudioUnlocked()) return;
  const c = ensureCtx();
  if (!c || !ensureRaceAudioRunning()) {
    if (engineGain) stopEngineSynth();
    if (pitBedGain) stopPitBed();
    return;
  }

  const inPit =
    snap.playerBoxing &&
    (snap.pitPhase === "in" || snap.pitPhase === "stopped" || snap.pitPhase === "out");

  const engineActive =
    (snap.racing || snap.phase === "starting" || snap.phase === "ready") &&
    !inPit &&
    snap.phase !== "finished" &&
    snap.phase !== "landing";

  if (engineRunning && buffers.raceBed && !engineLoopUsesRaceBed) {
    stopEngineSynth();
  }

  if (inPit) {
    if (engineGain) stopEngineSynth();
    if (!pitLoopPrimed) {
      stopPitBed();
      startPitBed();
      pitLoopPrimed = !!pitBedGain;
    }
    return;
  }

  if (pitBedGain) stopPitBed();

  if (engineActive) {
    if (!engineLoopPrimed) {
      stopEngineSynth();
      startEngineSynth();
      engineLoopPrimed = !!engineGain;
    }
    const speed =
      snap.phase === "starting" || snap.phase === "ready" ? 0 : snap.speedMps;
    if (
      engineRunning &&
      (Math.abs(speed - engineSpeedMps) > 0.35 ||
        snap.phase === "starting" ||
        snap.phase === "ready")
    ) {
      updateEngineSpeed(speed);
    }
  } else if (engineGain) {
    stopEngineSynth();
  }
};

/** Pit one-shots from live sim — call every frame while stopped in box. */
export const tickLivePitCues = (
  pitPhase: "in" | "stopped" | "out" | null,
  pitStopElapsed: number,
  pitServiceDone: boolean,
): void => {
  if (!isRaceAudioUnlocked() || pitPhase !== "stopped" || pitServiceDone) return;
  playWheelGuns(pitStopElapsed);
  if (pitStopElapsed > 0.05 && pitStopElapsed < 0.25) playJack(true);
  if (pitStopElapsed > 2.1 && pitStopElapsed < 2.35) playJack(false);
};

/** FIA start-light tick when each red illuminates. */
export const playStartRedLight = (index: number): void => {
  const now = performance.now();
  if (now - lastStartRedAt < 120) return;
  lastStartRedAt = now;
  const pitch = 920 + index * 35;
  beep(pitch, 0.09, "square", START_CUE_GAIN);
  beep(pitch * 0.5, 0.07, "sine", START_CUE_GAIN * 0.36, 0.01);
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

/** One-shots + loop sync from store snapshots. Never unlocks — gesture only. */
export const syncRaceAudio = (snap: RaceAudioSnapshot): void => {
  if (!isRaceAudioUnlocked()) return;

  syncRaceLoopAudio(snap);

  if (snap.startRedDelta > 0) {
    playStartRedLight(snap.startLightCount);
  }
  if (snap.startGreenEdge) playStartGreenHold();
  if (snap.lightsOutEdge) playLightsOut();

  if (snap.justReleased) playReleaseBeep();
  if (snap.unsafeDelta) playUnsafeSting();
};

export const disposeRaceAudio = (): void => {
  stopPitBed();
  stopEngineSynth();
  if (ctx) {
    void ctx.close();
    ctx = null;
  }
  unlocked = false;
  buffersLoaded = false;
  engineLoopPrimed = false;
  pitLoopPrimed = false;
  buffersReadyListeners.clear();
};

export type { CueId };
