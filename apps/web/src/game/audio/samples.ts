'use client';

// RR-SOUND (docs/SOUND_PACK.md): the recorded sounds — ambience per place, stingers and the big screen's announcer.
// The procedural sounds in sfx.ts stay as they are; this plays beside them through its own audio context.
// Rules: a file is fetched only when a screen asks for it and only if the pack's index lists it; nothing sounds
// before a user gesture; the HUD's mute switch (sfx.ts) silences this too; a file that fails to load stays silent.
import { useEffect } from 'react';
import pack from './samplePack.json';
import { isMuted } from './sfx';

export const AMBIENCE_NAMES = ['amb_m7_quake', 'amb_m9_polar', 'amb_storm', 'amb_workshop', 'amb_arena'] as const;
export const ONE_SHOT_NAMES = ['fx_quake_tremor', 'fx_race_go', 'fx_win_sting', 'fx_lose_sting', 'fx_photo_finish'] as const;
export const VOICE_NAMES = ['vo_countdown', 'vo_jev_lead', 'vo_human_lead', 'vo_photo_finish', 'vo_ai_wins', 'vo_human_wins', 'vo_best_combo', 'vo_thinking'] as const;
export type AmbienceName = (typeof AMBIENCE_NAMES)[number];
export type OneShotName = (typeof ONE_SHOT_NAMES)[number];
export type VoiceName = (typeof VOICE_NAMES)[number];
export type SampleName = AmbienceName | OneShotName | VoiceName;
export const SAMPLE_NAMES: readonly SampleName[] = [...AMBIENCE_NAMES, ...ONE_SHOT_NAMES, ...VOICE_NAMES];

/** Phones stay quiet (forty in a room must not drown the projector); the big screen carries the ambience. */
export type Venue = 'phone' | 'screen';

export const SAMPLE_LEVELS = {
  /** Ambience sits under the procedural sounds. */
  ambience: { phone: 0.3, screen: 0.6 },
  oneShot: 0.8,
  voice: 1,
  /** Ambience while the announcer speaks: 6 dB down. */
  duck: 0.5,
} as const;
/** A loop overlaps its own start by this much, so a clip that does not loop cleanly has no audible seam. */
export const CROSSFADE_S = 1.5;
const FADE_S = 0.8;
const MUTE_POLL_MS = 250;
/** Announcer lines wait for the one before; more than this many waiting and the news is stale. */
const VOICE_QUEUE = 2;

const indexed = pack.files as Readonly<Record<string, unknown>>;
/** True when the pack has this sound. Without it the app never asks the server for the file. */
export const hasSample = (name: SampleName): boolean => Object.hasOwn(indexed, name);
export const sampleUrl = (name: SampleName): string => `/sfx/${name}.mp3`;

interface Engine {
  readonly context: AudioContext;
  readonly master: GainNode;
  readonly ambience: GainNode;
  readonly shots: GainNode;
  readonly voice: GainNode;
}
interface Loop {
  readonly name: AmbienceName;
  readonly gain: GainNode;
  timer: ReturnType<typeof setTimeout> | null;
  stopped: boolean;
}
interface Wanted {
  readonly name: AmbienceName;
  readonly venue: Venue;
  /** Played once when this ambience first starts. */
  readonly intro?: OneShotName;
}

let engine: Engine | null = null;
let armed = false;
let wanted: Wanted | null = null;
let loop: Loop | null = null;
let voiceBusy = false;
const voiceQueue: VoiceName[] = [];
const buffers = new Map<SampleName, Promise<AudioBuffer | null>>();

const GESTURES = ['pointerdown', 'keydown', 'touchend'] as const;

function unlock(): void {
  if (engine !== null || typeof window === 'undefined') return;
  const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (Context === undefined) return;
  try {
    const context = new Context();
    const master = context.createGain();
    master.gain.value = isMuted() ? 0 : 1;
    master.connect(context.destination);
    const bus = (level: number): GainNode => {
      const node = context.createGain();
      node.gain.value = level;
      node.connect(master);
      return node;
    };
    engine = { context, master, ambience: bus(1), shots: bus(SAMPLE_LEVELS.oneShot), voice: bus(SAMPLE_LEVELS.voice) };
    void context.resume().catch(() => undefined);
    // sfx.ts owns the mute switch and has no way to tell us it moved: look at it a few times a second.
    setInterval(() => {
      if (engine === null) return;
      engine.master.gain.setTargetAtTime(isMuted() ? 0 : 1, engine.context.currentTime, 0.03);
    }, MUTE_POLL_MS);
    for (const type of GESTURES) window.removeEventListener(type, unlock);
    applyAmbience();
  } catch {
    // No audio on this device: stay silent.
    engine = null;
  }
}

/** Waits for the first user gesture; nothing is created or fetched before it. */
function arm(): void {
  if (armed || typeof window === 'undefined') return;
  armed = true;
  if (navigator.userActivation?.hasBeenActive === true) {
    unlock();
    return;
  }
  for (const type of GESTURES) window.addEventListener(type, unlock, { passive: true });
}

function decode(context: AudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
  // The callback form as well: older Safari has no promise here.
  return new Promise((resolve, reject) => {
    const promise = context.decodeAudioData(data, resolve, reject);
    if (promise !== undefined) promise.then(resolve, reject);
  });
}

/** The decoded sound, fetched once; `null` when the pack does not have it or it would not load. */
function load(name: SampleName): Promise<AudioBuffer | null> {
  const active = engine;
  if (active === null || !hasSample(name)) return Promise.resolve(null);
  const known = buffers.get(name);
  if (known !== undefined) return known;
  const loading = fetch(sampleUrl(name))
    .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(`sample ${name}: HTTP ${response.status}`))))
    .then((data) => decode(active.context, data))
    .catch(() => null);
  buffers.set(name, loading);
  return loading;
}

function fire(buffer: AudioBuffer, into: GainNode, onEnded?: () => void): void {
  if (engine === null) return;
  const source = engine.context.createBufferSource();
  source.buffer = buffer;
  source.connect(into);
  if (onEnded) source.onended = onEnded;
  source.start();
}

/** One pass of the loop, faded in and out, and the next pass booked to start under its tail. */
function pass(active: Engine, target: Loop, buffer: AudioBuffer, at: number): void {
  if (target.stopped) return;
  const { context } = active;
  const source = context.createBufferSource();
  source.buffer = buffer;
  const fade = context.createGain();
  const end = at + buffer.duration;
  fade.gain.setValueAtTime(0, at);
  fade.gain.linearRampToValueAtTime(1, at + CROSSFADE_S);
  fade.gain.setValueAtTime(1, end - CROSSFADE_S);
  fade.gain.linearRampToValueAtTime(0, end);
  source.connect(fade);
  fade.connect(target.gain);
  source.start(at);
  source.stop(end + 0.05);
  const next = end - CROSSFADE_S;
  // Booked a second early, so a timer that fires late still lands the pass on time.
  target.timer = setTimeout(() => pass(active, target, buffer, Math.max(next, context.currentTime)), Math.max(0, (next - context.currentTime - 1) * 1000));
}

function stopLoop(target: Loop): void {
  if (engine === null || target.stopped) return;
  target.stopped = true;
  if (target.timer !== null) clearTimeout(target.timer);
  const now = engine.context.currentTime;
  target.gain.gain.cancelScheduledValues(now);
  target.gain.gain.setTargetAtTime(0, now, FADE_S / 3);
  setTimeout(() => target.gain.disconnect(), FADE_S * 2000);
}

function applyAmbience(): void {
  const active = engine;
  if (active === null) return;
  const want = wanted;
  if (loop !== null && want !== null && loop.name === want.name) {
    loop.gain.gain.setTargetAtTime(SAMPLE_LEVELS.ambience[want.venue], active.context.currentTime, FADE_S / 3);
    return;
  }
  if (loop !== null) {
    stopLoop(loop);
    loop = null;
  }
  if (want === null) return;
  void load(want.name).then((buffer) => {
    // Still the ambience that is wanted, and nothing else started while it loaded.
    if (buffer === null || engine !== active || wanted !== want || loop !== null) return;
    const gain = active.context.createGain();
    gain.gain.value = 0;
    gain.connect(active.ambience);
    gain.gain.setTargetAtTime(SAMPLE_LEVELS.ambience[want.venue], active.context.currentTime, FADE_S / 3);
    const started: Loop = { name: want.name, gain, timer: null, stopped: false };
    loop = started;
    if (buffer.duration > CROSSFADE_S * 2 + 1) {
      pass(active, started, buffer, active.context.currentTime + 0.05);
    } else {
      // Too short to overlap with itself: the plain loop.
      const source = active.context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(gain);
      source.start();
    }
    if (want.intro !== undefined) playSample(want.intro);
  });
}

/** The ambience for the screen that is up; `null` fades it out. Changing it crossfades. */
export function setAmbience(name: AmbienceName | null, venue: Venue = 'phone', intro?: OneShotName): void {
  wanted = name === null || !hasSample(name) ? null : { name, venue, ...(intro !== undefined ? { intro } : {}) };
  if (wanted !== null) arm();
  applyAmbience();
}

/** A stinger. Dropped when audio is not unlocked yet: a late stinger is worse than none. */
export function playSample(name: OneShotName): void {
  const active = engine;
  if (active === null) return;
  void load(name).then((buffer) => {
    if (buffer !== null && engine === active) fire(buffer, active.shots);
  });
}

function speakNext(): void {
  const active = engine;
  const name = voiceQueue.shift();
  if (active === null || name === undefined) {
    voiceBusy = false;
    // The announcer is done: the ambience comes back up.
    if (active !== null) active.ambience.gain.setTargetAtTime(1, active.context.currentTime, 0.25);
    return;
  }
  voiceBusy = true;
  void load(name).then((buffer) => {
    if (buffer === null || engine !== active) {
      speakNext();
      return;
    }
    active.ambience.gain.setTargetAtTime(SAMPLE_LEVELS.duck, active.context.currentTime, 0.08);
    fire(buffer, active.voice, speakNext);
  });
}

/** An announcer line, for the big screen only. Lines queue; the ambience ducks while one is spoken. */
export function announce(name: VoiceName): void {
  if (engine === null || !hasSample(name)) return;
  if (voiceQueue.length >= VOICE_QUEUE) voiceQueue.shift();
  voiceQueue.push(name);
  if (!voiceBusy) speakNext();
}

/** How long a sound is, once loaded; `null` when the pack does not have it. For lines that must end on a beat. */
export async function sampleSeconds(name: SampleName): Promise<number | null> {
  return (await load(name))?.duration ?? null;
}

/** True once a user gesture has unlocked this module's audio. */
export const samplesUnlocked = (): boolean => engine !== null;

/** Lets a screen that only announces (no ambience of its own) wait for the first gesture too. */
export function armSamples(): void {
  arm();
}

/** What a mission sounds like around the robot: its own place for M7 and M9, the storm when it rains. */
export function missionAmbience(mission: { readonly id: string; readonly weather: string }): { readonly name: AmbienceName; readonly intro?: OneShotName } | null {
  if (mission.id === 'M7') return { name: 'amb_m7_quake', intro: 'fx_quake_tremor' };
  if (mission.id === 'M9') return { name: 'amb_m9_polar' };
  return mission.weather === 'rain' ? { name: 'amb_storm' } : null;
}

/** Mount: this screen's ambience for as long as the component is up. */
export function useAmbience(name: AmbienceName | null, venue: Venue = 'phone', intro?: OneShotName): void {
  useEffect(() => {
    setAmbience(name, venue, intro);
    return () => setAmbience(null);
  }, [name, venue, intro]);
}

/** Mount for /run: the mission's ambience at a phone's level, with the aftershock when M7 starts. */
export function useMissionAmbience(mission: { readonly id: string; readonly weather: string }): void {
  const sound = missionAmbience(mission);
  useAmbience(sound?.name ?? null, 'phone', sound?.intro);
}
