/**
 * Web Audio race / pit cues — prefers /public/audio/pit/*.wav, oscillator fallback.
 * Unlock on first user gesture; respects mute + tab visibility.
 */

type CueId = "pitBed" | "gun" | "jackUp" | "jackDown" | "release" | "unsafe" | "raceBed";

const WAV = {
  gun: "/audio/pit/gun.wav",
  jack: "/audio/pit/jack.wav",
  release: "/audio/pit/release.wav",
  unsafe: "/audio/pit/unsafe.wav",
  pitBed: "/audio/pit/pit-bed.wav",
  raceBed: "/audio/pit/race-bed.wav",
} as const;

let ctx: AudioContext | null = null;
let unlocked = false;
let muted = false;
let buffersLoaded = false;
const buffers: Partial<Record<keyof typeof WAV, AudioBuffer>> = {};

let pitBedGain: GainNode | null = null;
let pitBedOsc: OscillatorNode[] = [];
let pitBedSrc: AudioBufferSourceNode | null = null;
let raceBedGain: GainNode | null = null;
let raceBedOsc: OscillatorNode | null = null;
let raceBedSrc: AudioBufferSourceNode | null = null;
let lastGunAt = 0;
let lastJackAt = 0;
let lastReleaseAt = 0;
let lastUnsafeAt = 0;

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
  buffersLoaded = true;
  await Promise.all(
    (Object.keys(WAV) as (keyof typeof WAV)[]).map(async (key) => {
      try {
        const res = await fetch(WAV[key]);
        if (!res.ok) return;
        const arr = await res.arrayBuffer();
        buffers[key] = await c.decodeAudioData(arr.slice(0));
      } catch {
        /* oscillator fallback */
      }
    }),
  );
};

export const unlockRaceAudio = async (): Promise<void> => {
  const c = ensureCtx();
  if (!c) return;
  if (c.state === "suspended") {
    try {
      await c.resume();
    } catch {
      /* ignore */
    }
  }
  unlocked = c.state === "running";
  if (unlocked) void loadBuffers();
};

export const setRaceAudioMuted = (value: boolean): void => {
  muted = value;
  const master =
    muted || (typeof document !== "undefined" && document.visibilityState === "hidden") ? 0 : 1;
  if (pitBedGain) pitBedGain.gain.value = master * 0.045;
  if (raceBedGain) raceBedGain.gain.value = master * 0.02;
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

const startRaceBed = (): void => {
  const c = ensureCtx();
  if (!c || !masterOk() || raceBedGain) return;
  raceBedGain = c.createGain();
  raceBedGain.gain.value = 0.02;
  raceBedGain.connect(c.destination);

  if (buffers.raceBed) {
    raceBedSrc = c.createBufferSource();
    raceBedSrc.buffer = buffers.raceBed;
    raceBedSrc.loop = true;
    raceBedSrc.connect(raceBedGain);
    raceBedSrc.start();
    return;
  }

  raceBedOsc = c.createOscillator();
  raceBedOsc.type = "sawtooth";
  raceBedOsc.frequency.value = 48;
  raceBedOsc.connect(raceBedGain);
  raceBedOsc.start();
};

const stopRaceBed = (): void => {
  try {
    raceBedSrc?.stop();
  } catch {
    /* */
  }
  raceBedSrc = null;
  try {
    raceBedOsc?.stop();
  } catch {
    /* */
  }
  raceBedOsc = null;
  raceBedGain?.disconnect();
  raceBedGain = null;
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

export type PitAudioSnapshot = {
  playerBoxing: boolean;
  pitPhase: "in" | "stopped" | "out" | null;
  pitStopElapsed: number;
  pitServiceDone: boolean;
  pitHoldTraffic: boolean;
  racing: boolean;
  unsafeDelta: boolean;
  justReleased: boolean;
};

/** Drive ambient beds + one-shots from player pit / race state. */
export const syncRaceAudio = (snap: PitAudioSnapshot): void => {
  void unlockRaceAudio();
  if (!unlocked) return;

  const inPit =
    snap.playerBoxing &&
    (snap.pitPhase === "in" || snap.pitPhase === "stopped" || snap.pitPhase === "out");

  if (inPit) startPitBed();
  else stopPitBed();

  if (snap.racing && !inPit) startRaceBed();
  else stopRaceBed();

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
  stopRaceBed();
};

export type { CueId };
