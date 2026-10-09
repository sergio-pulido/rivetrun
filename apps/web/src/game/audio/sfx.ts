// Copied verbatim from docs/inputs/sfx.ts (the audio input for the game session). Edit the input, then re-copy.

/**
 * RivetRun — Procedural Sound Effects
 * File: sfx.ts
 *
 * Web Audio API only.
 * No assets, dependencies, React, or external requests.
 *
 * Features:
 * - iOS-safe first-gesture audio initialization
 * - Continuous engine hum controlled by speed and load
 * - Optional drone hum
 * - 11 short procedural arcade sound effects
 * - Persistent mute state
 * - SSR-safe module initialization
 * - Low CPU usage on mobile
 *
 * Public API:
 *
 * initAudio(): void
 * setEngine(speed01: number, load01: number): void
 * play(name: SoundName): void
 * droneHum(on: boolean): void
 * setMuted(muted: boolean): void
 * toggleMute(): boolean
 * isMuted(): boolean
 * disposeAudio(): void
 *
 * Call initAudio() once when the game mounts.
 * It automatically registers one-time gesture listeners.
 *
 * setEngine() should be called when simulation speed/load changes.
 * Calling it every frame is supported but unnecessary.
 */

export type SoundName =
  | "decision"
  | "accelerate"
  | "brake"
  | "slip"
  | "splash"
  | "crash"
  | "finish"
  | "dnf"
  | "unlock"
  | "countdown"
  | "go";

const STORAGE_KEY = "rivetrun.audio.muted";

const MASTER_VOLUME = 0.32;
const ENGINE_VOLUME = 0.075;
const DRONE_VOLUME = 0.035;

const EPSILON = 0.0001;

type AudioContextConstructor = typeof AudioContext;

type WebkitAudioWindow = Window & {
  webkitAudioContext?: AudioContextConstructor;
};

interface EngineNodes {
  fundamental: OscillatorNode;
  harmonic: OscillatorNode;
  fundamentalGain: GainNode;
  harmonicGain: GainNode;
  output: GainNode;
  gritFilter: BiquadFilterNode;
}

interface DroneNodes {
  oscillator: OscillatorNode;
  gain: GainNode;
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;

let engine: EngineNodes | null = null;
let drone: DroneNodes | null = null;

let initialized = false;
let disposed = false;
let unlocked = false;

let muted = false;
let engineSpeed = 0;
let engineLoad = 0;
let droneEnabled = false;

let gestureListenersAttached = false;

const clamp01 = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
};

const safeTime = (): number => ctx?.currentTime ?? 0;

/**
 * Read persistent mute preference.
 *
 * This must not throw in:
 * - SSR
 * - private browsing
 * - restricted browser environments
 */
function readMutePreference(): boolean {
  try {
    if (typeof window === "undefined") return false;

    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function persistMutePreference(value: boolean): void {
  try {
    if (typeof window === "undefined") return;

    window.localStorage.setItem(
      STORAGE_KEY,
      String(value),
    );
  } catch {
    // Storage unavailable. In-memory state remains valid.
  }
}

muted = readMutePreference();

/**
 * Smoothly update an AudioParam.
 *
 * setTargetAtTime avoids abrupt transitions and clicking.
 */
function smooth(
  param: AudioParam,
  value: number,
  timeConstant = 0.04,
): void {
  if (!ctx) return;

  const now = ctx.currentTime;

  param.setTargetAtTime(
    value,
    now,
    Math.max(0.001, timeConstant),
  );
}

/**
 * Build a lightweight, reusable white-noise buffer.
 *
 * Generated once per AudioContext.
 *
 * Noise is only played for short effects.
 * No permanent noise source runs in the background.
 */
function createNoiseBuffer(context: AudioContext): AudioBuffer {
  const duration = 0.5;
  const length = Math.ceil(context.sampleRate * duration);

  const buffer = context.createBuffer(
    1,
    length,
    context.sampleRate,
  );

  const data = buffer.getChannelData(0);

  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  return buffer;
}

/**
 * Create persistent engine oscillators.
 *
 * Two oscillators:
 * - Fundamental: motor pitch
 * - Harmonic: mechanical grit / load
 *
 * No per-frame AudioNode allocation.
 */
function createEngine(context: AudioContext): EngineNodes {
  const fundamental = context.createOscillator();
  fundamental.type = "sawtooth";

  const harmonic = context.createOscillator();
  harmonic.type = "square";

  const fundamentalGain = context.createGain();
  const harmonicGain = context.createGain();

  const gritFilter = context.createBiquadFilter();
  gritFilter.type = "lowpass";
  gritFilter.frequency.value = 450;
  gritFilter.Q.value = 0.6;

  const output = context.createGain();

  fundamentalGain.gain.value = 0;
  harmonicGain.gain.value = 0;
  output.gain.value = 0;

  fundamental.frequency.value = 45;
  harmonic.frequency.value = 90;

  fundamental.connect(fundamentalGain);
  harmonic.connect(harmonicGain);

  fundamentalGain.connect(output);

  harmonicGain.connect(gritFilter);
  gritFilter.connect(output);

  output.connect(master!);

  fundamental.start();
  harmonic.start();

  return {
    fundamental,
    harmonic,
    fundamentalGain,
    harmonicGain,
    output,
    gritFilter,
  };
}

/**
 * Create optional drone hum.
 *
 * One oscillator, permanently allocated but inaudible
 * when disabled.
 */
function createDrone(context: AudioContext): DroneNodes {
  const oscillator = context.createOscillator();
  oscillator.type = "triangle";
  oscillator.frequency.value = 185;

  const gain = context.createGain();
  gain.gain.value = 0;

  oscillator.connect(gain);
  gain.connect(master!);

  oscillator.start();

  return {
    oscillator,
    gain,
  };
}

/**
 * Initialize Web Audio nodes.
 *
 * This must only be called inside a trusted user gesture.
 */
function createAudioGraph(): void {
  if (ctx || typeof window === "undefined") return;

  const audioWindow = window as WebkitAudioWindow;

  const AudioContextClass =
    window.AudioContext ??
    audioWindow.webkitAudioContext;

  if (!AudioContextClass) return;

  try {
    const context = new AudioContextClass();

    ctx = context;

    master = context.createGain();
    master.gain.value = muted ? 0 : MASTER_VOLUME;
    master.connect(context.destination);

    noiseBuffer = createNoiseBuffer(context);

    engine = createEngine(context);
    drone = createDrone(context);

    updateEngine();
    updateDrone();
  } catch {
    // Web Audio is unavailable or blocked.
    // The rest of the game must continue normally.
  }
}

/**
 * Attempts to unlock/resume Web Audio.
 *
 * Called directly from a user gesture.
 *
 * The resume promise is handled so browser restrictions
 * never cause an unhandled rejection.
 */
function unlockAudio(): void {
  if (disposed) return;

  createAudioGraph();

  if (!ctx) return;

  if (ctx.state === "running") {
    unlocked = true;
    removeGestureListeners();
    return;
  }

  void ctx
    .resume()
    .then(() => {
      if (ctx?.state === "running") {
        unlocked = true;
        removeGestureListeners();

        updateEngine();
        updateDrone();
      }
    })
    .catch(() => {
      // Keep gesture listeners for another attempt.
    });
}

function onFirstGesture(): void {
  unlockAudio();
}

/**
 * Register multiple gesture types for mobile compatibility.
 *
 * Duplicate events are harmless:
 * - createAudioGraph() is idempotent
 * - resume() is safe to call repeatedly
 *
 * Listeners are removed only after audio is running.
 */
function addGestureListeners(): void {
  if (
    typeof window === "undefined" ||
    gestureListenersAttached ||
    disposed
  ) {
    return;
  }

  gestureListenersAttached = true;

  window.addEventListener(
    "pointerdown",
    onFirstGesture,
    { passive: true },
  );

  window.addEventListener(
    "touchend",
    onFirstGesture,
    { passive: true },
  );

  window.addEventListener(
    "keydown",
    onFirstGesture,
  );

  window.addEventListener(
    "click",
    onFirstGesture,
  );
}

function removeGestureListeners(): void {
  if (
    typeof window === "undefined" ||
    !gestureListenersAttached
  ) {
    return;
  }

  gestureListenersAttached = false;

  window.removeEventListener(
    "pointerdown",
    onFirstGesture,
  );

  window.removeEventListener(
    "touchend",
    onFirstGesture,
  );

  window.removeEventListener(
    "keydown",
    onFirstGesture,
  );

  window.removeEventListener(
    "click",
    onFirstGesture,
  );
}

/**
 * Public initialization.
 *
 * Call once when the game starts.
 *
 * No AudioContext is created during SSR.
 *
 * If called inside an active user gesture, unlock immediately.
 * Otherwise, wait for the first pointer/touch/key/click event.
 */
export function initAudio(): void {
  if (typeof window === "undefined") return;

  if (disposed) {
    disposed = false;
  }

  if (initialized && unlocked && ctx?.state === "running") {
    return;
  }

  initialized = true;

  addGestureListeners();

  // Supports calling initAudio() directly inside
  // a Start Game button's event handler.
  //
  // Do not create AudioContext merely because initAudio()
  // was called during component mounting.
  if (navigator.userActivation?.isActive) {
    unlockAudio();
  }
}

/**
 * Update the persistent engine sound.
 *
 * speed01:
 *   0 = stationary
 *   1 = maximum speed
 *
 * load01:
 *   0 = no load
 *   1 = maximum load
 *
 * Pitch follows speed.
 * Harmonic grit follows load.
 */
function updateEngine(): void {
  if (!ctx || !engine) return;

  const speed = engineSpeed;
  const load = engineLoad;

  const now = safeTime();

  // Motor pitch: 45–165 Hz.
  const frequency = 45 + speed * 120;

  // Higher load adds harmonic presence and a
  // small amount of pitch instability.
  //
  // This is deterministic from the current inputs.
  const loadPitchOffset = load * 4;

  smooth(
    engine.fundamental.frequency,
    frequency - loadPitchOffset,
    0.055,
  );

  smooth(
    engine.harmonic.frequency,
    frequency * 2 + loadPitchOffset,
    0.055,
  );

  // Engine is quiet when stationary.
  // It becomes more prominent as speed increases.
  const activity = Math.pow(speed, 0.7);

  const baseLevel =
    ENGINE_VOLUME *
    (0.25 + activity * 0.75);

  // Load increases mechanical grit.
  const gritLevel =
    ENGINE_VOLUME *
    load *
    (0.12 + activity * 0.65);

  smooth(
    engine.fundamentalGain.gain,
    baseLevel,
    0.045,
  );

  smooth(
    engine.harmonicGain.gain,
    gritLevel,
    0.045,
  );

  // A loaded motor sounds darker and rougher.
  smooth(
    engine.gritFilter.frequency,
    350 + speed * 700 - load * 180,
    0.08,
  );

  // Fade nearly to zero at rest.
  const targetOutput =
    speed < 0.015 && load < 0.015
      ? 0
      : 1;

  engine.output.gain.setTargetAtTime(
    targetOutput,
    now,
    0.06,
  );
}

/**
 * Public continuous engine control.
 *
 * Safe to call before audio initialization.
 * The latest values are retained.
 */
export function setEngine(
  speed01: number,
  load01: number,
): void {
  engineSpeed = clamp01(speed01);
  engineLoad = clamp01(load01);

  updateEngine();
}

/**
 * Optional continuous drone sound.
 */
function updateDrone(): void {
  if (!ctx || !drone) return;

  smooth(
    drone.gain.gain,
    droneEnabled ? DRONE_VOLUME : 0,
    0.08,
  );
}

/**
 * Enable or disable scout-drone hum.
 */
export function droneHum(on: boolean): void {
  droneEnabled = Boolean(on);
  updateDrone();
}

/**
 * Procedural tone.
 *
 * All sounds are short, scheduled, and self-cleaning.
 */
interface ToneOptions {
  frequency: number;
  endFrequency?: number;
  duration: number;
  volume?: number;
  type?: OscillatorType;
  delay?: number;
  attack?: number;
}

function tone(options: ToneOptions): void {
  if (!ctx || !master || muted || !unlocked) return;

  const {
    frequency,
    endFrequency = frequency,
    duration,
    volume = 0.25,
    type = "sine",
    delay = 0,
    attack = 0.008,
  } = options;

  const start = ctx.currentTime + delay;
  const end = start + duration;

  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = type;

  oscillator.frequency.setValueAtTime(
    Math.max(1, frequency),
    start,
  );

  oscillator.frequency.exponentialRampToValueAtTime(
    Math.max(1, endFrequency),
    end,
  );

  gain.gain.setValueAtTime(EPSILON, start);

  gain.gain.exponentialRampToValueAtTime(
    Math.max(EPSILON, volume),
    start + Math.min(attack, duration * 0.5),
  );

  gain.gain.exponentialRampToValueAtTime(
    EPSILON,
    end,
  );

  oscillator.connect(gain);
  gain.connect(master);

  oscillator.start(start);
  oscillator.stop(end + 0.015);

  oscillator.onended = () => {
    oscillator.disconnect();
    gain.disconnect();
  };
}

/**
 * Short filtered noise burst.
 *
 * Used for:
 * - braking
 * - tire slip
 * - water splash
 * - crashes
 *
 * The noise buffer is reused.
 */
interface NoiseOptions {
  duration: number;
  volume?: number;
  frequency?: number;
  endFrequency?: number;
  delay?: number;
  filterType?: BiquadFilterType;
}

function noise(options: NoiseOptions): void {
  if (
    !ctx ||
    !master ||
    !noiseBuffer ||
    muted ||
    !unlocked
  ) {
    return;
  }

  const {
    duration,
    volume = 0.2,
    frequency = 1200,
    endFrequency = frequency,
    delay = 0,
    filterType = "lowpass",
  } = options;

  const start = ctx.currentTime + delay;
  const end = start + duration;

  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer;

  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.Q.value = 0.7;

  filter.frequency.setValueAtTime(
    Math.max(20, frequency),
    start,
  );

  filter.frequency.exponentialRampToValueAtTime(
    Math.max(20, endFrequency),
    end,
  );

  const gain = ctx.createGain();

  gain.gain.setValueAtTime(EPSILON, start);

  gain.gain.exponentialRampToValueAtTime(
    Math.max(EPSILON, volume),
    start + Math.min(0.012, duration * 0.25),
  );

  gain.gain.exponentialRampToValueAtTime(
    EPSILON,
    end,
  );

  source.connect(filter);
  filter.connect(gain);
  gain.connect(master);

  source.start(start);
  source.stop(end + 0.015);

  source.onended = () => {
    source.disconnect();
    filter.disconnect();
    gain.disconnect();
  };
}

/**
 * Public one-shot sound effects.
 *
 * Every sound is synthesized.
 *
 * Short arcade/maker aesthetic:
 * - electronic beeps
 * - mechanical chirps
 * - filtered noise
 * - short melodic feedback
 */
export function play(name: SoundName): void {
  if (!ctx || muted || !unlocked) return;

  switch (name) {
    /**
     * AI decision:
     * Short digital confirmation chirp.
     */
    case "decision": {
      tone({
        frequency: 680,
        endFrequency: 940,
        duration: 0.065,
        volume: 0.16,
        type: "square",
      });

      tone({
        frequency: 1040,
        endFrequency: 1180,
        duration: 0.045,
        volume: 0.09,
        delay: 0.055,
      });

      break;
    }

    /**
     * Acceleration:
     * Quick rising electric motor whine.
     */
    case "accelerate": {
      tone({
        frequency: 170,
        endFrequency: 570,
        duration: 0.22,
        volume: 0.24,
        type: "sawtooth",
      });

      break;
    }

    /**
     * Braking:
     * Descending motor note and light friction.
     */
    case "brake": {
      tone({
        frequency: 480,
        endFrequency: 105,
        duration: 0.2,
        volume: 0.18,
        type: "triangle",
      });

      noise({
        duration: 0.17,
        volume: 0.12,
        frequency: 2200,
        endFrequency: 650,
      });

      break;
    }

    /**
     * Slip:
     * Fast tire squeal.
     */
    case "slip": {
      tone({
        frequency: 1350,
        endFrequency: 690,
        duration: 0.2,
        volume: 0.12,
        type: "sawtooth",
      });

      noise({
        duration: 0.23,
        volume: 0.13,
        frequency: 3200,
        endFrequency: 1250,
        filterType: "bandpass",
      });

      break;
    }

    /**
     * Splash:
     * Broadband burst with falling filter.
     */
    case "splash": {
      noise({
        duration: 0.32,
        volume: 0.30,
        frequency: 4200,
        endFrequency: 350,
      });

      tone({
        frequency: 180,
        endFrequency: 85,
        duration: 0.11,
        volume: 0.10,
        type: "sine",
      });

      break;
    }

    /**
     * Crash:
     * Mechanical impact with a low thump
     * and short metallic distortion.
     */
    case "crash": {
      tone({
        frequency: 180,
        endFrequency: 42,
        duration: 0.32,
        volume: 0.45,
        type: "triangle",
      });

      tone({
        frequency: 730,
        endFrequency: 175,
        duration: 0.17,
        volume: 0.15,
        type: "square",
      });

      noise({
        duration: 0.28,
        volume: 0.34,
        frequency: 2600,
        endFrequency: 180,
      });

      break;
    }

    /**
     * Finish:
     * Short triumphant arcade melody.
     */
    case "finish": {
      const notes = [
        { frequency: 523.25, delay: 0 },
        { frequency: 659.25, delay: 0.11 },
        { frequency: 783.99, delay: 0.22 },
        { frequency: 1046.5, delay: 0.34 },
      ];

      for (const note of notes) {
        tone({
          frequency: note.frequency,
          endFrequency: note.frequency,
          duration: note.delay > 0.3 ? 0.32 : 0.12,
          volume: 0.24,
          type: "triangle",
          delay: note.delay,
        });
      }

      break;
    }

    /**
     * DNF:
     * Sad descending electronic sequence.
     */
    case "dnf": {
      tone({
        frequency: 392,
        endFrequency: 370,
        duration: 0.16,
        volume: 0.18,
        type: "triangle",
      });

      tone({
        frequency: 294,
        endFrequency: 280,
        duration: 0.16,
        volume: 0.18,
        type: "triangle",
        delay: 0.18,
      });

      tone({
        frequency: 196,
        endFrequency: 95,
        duration: 0.36,
        volume: 0.22,
        type: "sawtooth",
        delay: 0.36,
      });

      break;
    }

    /**
     * Unlock:
     * Mechanical click followed by bright reward tones.
     */
    case "unlock": {
      noise({
        duration: 0.035,
        volume: 0.15,
        frequency: 2800,
      });

      tone({
        frequency: 660,
        endFrequency: 880,
        duration: 0.12,
        volume: 0.2,
        type: "square",
        delay: 0.045,
      });

      tone({
        frequency: 1320,
        endFrequency: 1568,
        duration: 0.2,
        volume: 0.16,
        type: "sine",
        delay: 0.15,
      });

      break;
    }

    /**
     * Countdown:
     * Classic short starting-grid beep.
     *
     * Call once per countdown step.
     */
    case "countdown": {
      tone({
        frequency: 440,
        endFrequency: 440,
        duration: 0.12,
        volume: 0.22,
        type: "square",
      });

      break;
    }

    /**
     * GO:
     * Bright, rising start signal.
     */
    case "go": {
      tone({
        frequency: 660,
        endFrequency: 1320,
        duration: 0.3,
        volume: 0.28,
        type: "sawtooth",
      });

      tone({
        frequency: 880,
        endFrequency: 1760,
        duration: 0.23,
        volume: 0.13,
        type: "sine",
        delay: 0.055,
      });

      break;
    }
  }
}

/**
 * Mute controls.
 *
 * Muting affects:
 * - engine
 * - drone
 * - all one-shot effects
 *
 * Engine/drone continue updating silently so their
 * latest state is restored when audio is unmuted.
 */
export function setMuted(value: boolean): void {
  muted = Boolean(value);

  persistMutePreference(muted);

  if (!ctx || !master) return;

  smooth(
    master.gain,
    muted ? 0 : MASTER_VOLUME,
    0.025,
  );
}

/**
 * Toggle mute.
 *
 * Returns the NEW muted state.
 */
export function toggleMute(): boolean {
  setMuted(!muted);
  return muted;
}

/**
 * Read current mute state.
 */
export function isMuted(): boolean {
  return muted;
}

/**
 * Optional cleanup.
 *
 * Safe when leaving the game.
 *
 * initAudio() can be called again afterward.
 */
export function disposeAudio(): void {
  disposed = true;

  removeGestureListeners();

  try {
    engine?.fundamental.stop();
    engine?.harmonic.stop();
    drone?.oscillator.stop();
  } catch {
    // Already stopped.
  }

  engine = null;
  drone = null;
  master = null;
  noiseBuffer = null;

  const oldContext = ctx;

  ctx = null;

  initialized = false;
  unlocked = false;

  engineSpeed = 0;
  engineLoad = 0;
  droneEnabled = false;

  if (oldContext) {
    void oldContext.close().catch(() => {
      // Context already closed or unavailable.
    });
  }
}
