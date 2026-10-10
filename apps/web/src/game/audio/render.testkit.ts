// Offline rendering of the procedural sound effects, for tests: a recording stand-in for the Web Audio
// nodes sfx.ts schedules, and the sample math that turns that schedule into a waveform. No browser needed.

interface ParamEvent {
  readonly kind: 'set' | 'exp' | 'lin';
  readonly value: number;
  readonly t: number;
}

class FakeParam {
  value = 0;
  readonly events: ParamEvent[] = [];
  setValueAtTime(value: number, t: number): this { this.events.push({ kind: 'set', value, t }); return this; }
  exponentialRampToValueAtTime(value: number, t: number): this { this.events.push({ kind: 'exp', value, t }); return this; }
  linearRampToValueAtTime(value: number, t: number): this { this.events.push({ kind: 'lin', value, t }); return this; }
  setTargetAtTime(): this { return this; }
  cancelScheduledValues(): this { return this; }
  /** The scheduled value at time t (Web Audio's ramp rules). Before the first event: the first event's value. */
  at(t: number): number {
    const events = this.events;
    if (events.length === 0) return this.value;
    let previous = events[0]!;
    if (t <= previous.t) return previous.value;
    for (let i = 1; i < events.length; i += 1) {
      const next = events[i]!;
      if (t < next.t) {
        if (next.kind === 'set') return previous.value;
        const k = (t - previous.t) / (next.t - previous.t);
        return next.kind === 'exp' ? previous.value * (next.value / previous.value) ** k : previous.value + (next.value - previous.value) * k;
      }
      previous = next;
    }
    return previous.value;
  }
}

type NodeKind = 'oscillator' | 'gain' | 'noise' | 'filter' | 'destination';

class FakeNode {
  readonly frequency = new FakeParam();
  readonly gain = new FakeParam();
  readonly Q = new FakeParam();
  readonly detune = new FakeParam();
  readonly playbackRate = new FakeParam();
  type = 'sine';
  buffer: unknown = null;
  loop = false;
  onended: (() => void) | null = null;
  startAt: number | null = null;
  stopAt: number | null = null;
  readonly inputs: FakeNode[] = [];
  constructor(readonly kind: NodeKind) {}
  connect(target: FakeNode): FakeNode { target.inputs.push(this); return target; }
  disconnect(): void {}
  start(t = 0): void { this.startAt = t; }
  stop(t = 0): void { this.stopAt = t; }
}

export class FakeAudioContext {
  static last: FakeAudioContext | null = null;
  readonly sampleRate = 44100;
  readonly currentTime = 0;
  readonly state = 'running';
  readonly destination = new FakeNode('destination');
  readonly gains: FakeNode[] = [];
  constructor() { FakeAudioContext.last = this; }
  createOscillator(): FakeNode { return new FakeNode('oscillator'); }
  createGain(): FakeNode { const node = new FakeNode('gain'); this.gains.push(node); return node; }
  createBiquadFilter(): FakeNode { return new FakeNode('filter'); }
  createBufferSource(): FakeNode { return new FakeNode('noise'); }
  createBuffer(_channels: number, length: number): { getChannelData: () => Float32Array } {
    const data = new Float32Array(length);
    return { getChannelData: () => data };
  }
  resume(): Promise<void> { return Promise.resolve(); }
  close(): Promise<void> { return Promise.resolve(); }
}

export interface Rendered {
  /** Largest absolute sample after the master gain. 1.0 is full scale. */
  readonly peak: number;
  readonly rms: number;
  /** Seconds from the call to the last scheduled sample. */
  readonly durationS: number;
  readonly voices: number;
}

const WAVE: Readonly<Record<string, (phase: number) => number>> = {
  sine: (p) => Math.sin(2 * Math.PI * p),
  square: (p) => (p % 1 < 0.5 ? 1 : -1),
  sawtooth: (p) => 2 * (p % 1) - 1,
  triangle: (p) => 1 - 4 * Math.abs((p % 1) - 0.5),
};

/** A deterministic white-noise source, so the test gives the same numbers on every run. */
function noiseSource(): () => number {
  let seed = 0x2f6e2b1;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return (seed >>> 0) / 0x80000000 - 1;
  };
}

/**
 * Renders the voices that reached `master` after index `from` in the context's gain list: each is
 * source → (filter) → gain → master, which is how sfx.ts builds every one-shot. The biquad follows the
 * Web Audio formulas (lowpass with Q in dB, bandpass with constant peak gain).
 */
export function renderVoices(context: FakeAudioContext, master: FakeNode, from: number, masterVolume: number): Rendered {
  const rate = context.sampleRate;
  const voices = context.gains.slice(from).filter((gain) => master.inputs.includes(gain));
  let endT = 0;
  for (const voice of voices) for (const event of voice.gain.events) endT = Math.max(endT, event.t);
  const length = Math.ceil(endT * rate) + 1;
  const mix = new Float64Array(length);
  for (const voice of voices) {
    const input = voice.inputs[0];
    if (!input) continue;
    const source = input.kind === 'filter' ? input.inputs[0] : input;
    if (!source || source.startAt === null) continue;
    const filter = input.kind === 'filter' ? input : null;
    const wave = WAVE[source.type] ?? WAVE.sine!;
    const random = noiseSource();
    let phase = 0;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    const first = Math.floor(source.startAt * rate);
    const last = Math.min(length - 1, Math.ceil((source.stopAt ?? endT) * rate));
    for (let i = first; i <= last; i += 1) {
      const t = i / rate;
      let sample: number;
      if (source.kind === 'oscillator') {
        phase += source.frequency.at(t) / rate;
        sample = wave(phase);
      } else {
        sample = random();
      }
      if (filter) {
        const w0 = (2 * Math.PI * Math.min(rate * 0.49, filter.frequency.at(t))) / rate;
        const q = filter.Q.events.length > 0 ? filter.Q.at(t) : filter.Q.value;
        const band = filter.type === 'bandpass';
        const alpha = Math.sin(w0) / (2 * (band ? Math.max(0.0001, q) : 10 ** (q / 20)));
        const cos = Math.cos(w0);
        const a0 = 1 + alpha;
        const b0 = band ? alpha : (1 - cos) / 2;
        const b1 = band ? 0 : 1 - cos;
        const b2 = band ? -alpha : (1 - cos) / 2;
        const out = (b0 * sample + b1 * x1 + b2 * x2 - -2 * cos * y1 - (1 - alpha) * y2) / a0;
        x2 = x1; x1 = sample; y2 = y1; y1 = out;
        sample = out;
      }
      mix[i]! += sample * voice.gain.at(t);
    }
  }
  let peak = 0;
  let sum = 0;
  for (let i = 0; i < length; i += 1) {
    const value = Math.abs(mix[i]! * masterVolume);
    if (value > peak) peak = value;
    sum += value * value;
  }
  return { peak, rms: Math.sqrt(sum / Math.max(1, length)), durationS: endT, voices: voices.length };
}

export type { FakeNode };
