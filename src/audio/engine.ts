import * as Tone from 'tone';
import { create } from 'zustand';
import {
  getInstrument,
  getKit,
  isKitId,
  pieceForMidi,
  sampleUrl,
  DRUM_PIECES,
} from '../lib/instruments';
import { createFx, type FxInstance, type FxSlot } from './fx';

// A short look-ahead keeps on-screen playing tight while still scheduling transport events reliably.
Tone.setContext(new Tone.Context({ latencyHint: 'interactive', lookAhead: 0.04 }));

export async function ensureAudio() {
  if (Tone.getContext().state !== 'running') await Tone.start();
}

/* ---------------------------------------------------------------- master bus */

/**
 * Master section plus the shared reverb / delay buses. Built once for live playback and again inside
 * an offline context when the studio renders a song.
 */
export function createBus(destination: Tone.InputNode = Tone.getDestination()) {
  // General-MIDI style samples are mastered quietly; make up ~8 dB before the bus compressor
  const input = new Tone.Gain(2.5);
  const volume = new Tone.Volume(-4);
  const comp = new Tone.Compressor({ threshold: -16, ratio: 2.2, attack: 0.012, release: 0.22 });
  const limiter = new Tone.Limiter(-0.8);
  const meter = new Tone.Meter({ smoothing: 0.75, channelCount: 2 });
  const recorderTap = new Tone.Gain(1);

  const reverbIn = new Tone.Gain(1);
  const reverb = new Tone.Reverb({ decay: 2.6, preDelay: 0.018, wet: 1 });
  const reverbTone = new Tone.Filter({ type: 'lowpass', frequency: 7200 });
  const delayIn = new Tone.Gain(1);
  const delay = new Tone.FeedbackDelay({ delayTime: '8n', feedback: 0.3, wet: 1 });
  const delayTone = new Tone.Filter({ type: 'bandpass', frequency: 1800, Q: 0.4 });

  input.chain(volume, comp, limiter, destination);
  limiter.connect(meter);
  limiter.connect(recorderTap);
  reverbIn.chain(reverb, reverbTone, input);
  delayIn.chain(delay, delayTone, input);

  return { input, volume, comp, limiter, meter, recorderTap, reverbIn, reverb, delayIn, delay };
}
export type Bus = ReturnType<typeof createBus>;

export const master = createBus();

export function setMasterVolume(db: number) {
  master.volume.volume.rampTo(db <= -60 ? -Infinity : db, 0.05);
}

export type AutoParam = 'volume' | 'pan' | 'reverb' | 'delay' | 'cutoff';
/** What automation needs from a Tone param or signal. */
export interface Automatable {
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
  cancelScheduledValues(time: number): unknown;
}

/** Channel strip used by the live instrument and every studio channel: EQ → comp → inserts → fader. */
export class Strip {
  readonly input = new Tone.Gain(1);
  readonly eq = new Tone.EQ3({ low: 0, mid: 0, high: 0 });
  readonly comp = new Tone.Compressor({ threshold: -20, ratio: 3, attack: 0.008, release: 0.18 });
  readonly channel = new Tone.Channel({ volume: 0, pan: 0 });
  readonly meter = new Tone.Meter({ smoothing: 0.7 });
  readonly reverbSend = new Tone.Gain(0);
  readonly delaySend = new Tone.Gain(0);
  private compOn = false;
  private inserts: FxInstance[] = [];
  private insertSig = '';

  constructor(bus: Bus = master) {
    this.input.chain(this.eq, this.channel);
    this.channel.connect(bus.input);
    this.channel.connect(this.meter);
    this.channel.connect(this.reverbSend);
    this.channel.connect(this.delaySend);
    this.reverbSend.connect(bus.reverbIn);
    this.delaySend.connect(bus.delayIn);
  }

  private rewire() {
    this.eq.disconnect();
    this.comp.disconnect();
    this.inserts.forEach((f) => f.node.disconnect());
    const chain: Tone.ToneAudioNode[] = [this.eq];
    if (this.compOn) chain.push(this.comp);
    chain.push(...this.inserts.map((f) => f.node), this.channel);
    for (let i = 0; i < chain.length - 1; i++) chain[i].connect(chain[i + 1]);
  }

  private setInserts(slots: FxSlot[]) {
    const active = slots.filter((s) => s.on);
    const sig = active.map((s) => `${s.id}:${s.type}`).join('|');
    if (sig !== this.insertSig) {
      this.inserts.forEach((f) => f.dispose());
      this.inserts = active.map((s) => createFx(s));
      this.insertSig = sig;
      this.rewire();
    }
    active.forEach((s, i) => this.inserts[i].apply(s));
  }

  /** The audio parameter an automation clip drives. */
  param(name: AutoParam): Automatable | null {
    switch (name) {
      case 'volume':
        return this.channel.volume;
      case 'pan':
        return this.channel.pan;
      case 'reverb':
        return this.reverbSend.gain;
      case 'delay':
        return this.delaySend.gain;
      case 'cutoff':
        return this.inserts.find((f) => f.cutoff)?.cutoff ?? null;
    }
  }

  set({
    volume,
    pan,
    muted,
    reverb,
    delay,
    eq,
    comp,
    fx,
  }: {
    volume?: number;
    pan?: number;
    muted?: boolean;
    reverb?: number;
    delay?: number;
    eq?: { low: number; mid: number; high: number };
    comp?: boolean;
    fx?: FxSlot[];
  }) {
    if (volume !== undefined) this.channel.volume.rampTo(volume <= -60 ? -Infinity : volume, 0.04);
    if (pan !== undefined) this.channel.pan.rampTo(pan, 0.04);
    if (muted !== undefined) this.channel.mute = muted;
    if (reverb !== undefined) this.reverbSend.gain.rampTo(reverb, 0.05);
    if (delay !== undefined) this.delaySend.gain.rampTo(delay, 0.05);
    if (eq) {
      this.eq.low.value = eq.low;
      this.eq.mid.value = eq.mid;
      this.eq.high.value = eq.high;
    }
    if (comp !== undefined && comp !== this.compOn) {
      this.compOn = comp;
      this.rewire();
    }
    if (fx) this.setInserts(fx);
  }

  dispose() {
    this.inserts.forEach((f) => f.dispose());
    [this.input, this.eq, this.comp, this.channel, this.meter, this.reverbSend, this.delaySend].forEach((n) => n.dispose());
  }
}

/* ------------------------------------------------------------- sample cache */

type BufferMap = Record<string, Tone.ToneAudioBuffer>;

const canPlayOgg = (() => {
  try {
    return typeof Audio !== 'undefined' && new Audio().canPlayType('audio/ogg; codecs="vorbis"') !== '';
  } catch {
    return false;
  }
})();
const bufferCache = new Map<string, Promise<BufferMap>>();

interface LoadingState {
  pending: Record<string, number>;
  failed: string[];
}
export const useLoading = create<LoadingState>(() => ({ pending: {}, failed: [] }));

function trackLoad(id: string, delta: number) {
  useLoading.setState((s) => {
    const pending = { ...s.pending };
    pending[id] = (pending[id] ?? 0) + delta;
    if (pending[id] <= 0) delete pending[id];
    return { pending };
  });
}

export function loadBuffers(id: string): Promise<BufferMap> {
  const cached = bufferCache.get(id);
  if (cached) return cached;
  let entries: [string, string][] = [];
  let folder = '';
  if (isKitId(id)) {
    const kit = getKit(id);
    if (kit) {
      folder = kit.folder;
      entries = Object.entries(kit.pieces);
    }
  } else {
    const inst = getInstrument(id);
    if (inst) {
      folder = inst.folder;
      entries = Object.entries(inst.samples);
    }
  }
  trackLoad(id, 1);
  const p = Promise.all(
    entries.map(async ([key, file]) => {
      // Safari / iOS can't decode Ogg Vorbis: use the AAC copy made by scripts/convert-ogg.mjs
      const isOgg = file.endsWith('.ogg');
      const aac = file.replace(/\.ogg$/, '.m4a');
      const first = isOgg && !canPlayOgg ? aac : file;
      try {
        return [key, await Tone.ToneAudioBuffer.fromUrl(sampleUrl(folder, first))] as const;
      } catch {
        if (!isOgg) return null;
        try {
          return [key, await Tone.ToneAudioBuffer.fromUrl(sampleUrl(folder, first === aac ? file : aac))] as const;
        } catch {
          return null;
        }
      }
    }),
  ).then((res) => {
    trackLoad(id, -1);
    const map: BufferMap = {};
    for (const r of res) if (r) map[r[0]] = r[1];
    if (Object.keys(map).length === 0) {
      useLoading.setState((s) => ({ failed: [...s.failed, id] }));
      bufferCache.delete(id);
    }
    return map;
  });
  bufferCache.set(id, p);
  return p;
}

/* -------------------------------------------------------------------- voice */

function releaseFor(id: string) {
  const fam = getInstrument(id)?.family;
  switch (fam) {
    case 'piano':
    case 'keys':
      return 0.45;
    case 'guitar':
    case 'bass':
      return 0.7;
    case 'mallets':
      return 1.4;
    case 'strings':
    case 'synth':
    case 'voice':
    case 'organ':
      return 0.6;
    default:
      return 0.35;
  }
}

/** One playable instrument (sampler or drum kit) routed into a strip. */
export class Voice {
  id = '';
  private sampler: Tone.Sampler | null = null;
  private kit: BufferMap | null = null;
  private openHats = new Set<Tone.ToneBufferSource>();
  private token = 0;
  ready: Promise<void> = Promise.resolve();

  // remembered so offline renders (whose events fire after Tone switches back to the live context)
  // still build their nodes in the right context
  private readonly ctx = Tone.getContext();

  constructor(private out: Tone.InputNode, id?: string) {
    if (id) this.setInstrument(id);
  }

  get isKit() {
    return isKitId(this.id);
  }

  setInstrument(id: string) {
    if (id === this.id) return this.ready;
    this.id = id;
    const token = ++this.token;
    this.ready = loadBuffers(id).then((buffers) => {
      if (token !== this.token) return;
      const old = this.sampler;
      if (old) {
        old.releaseAll();
        setTimeout(() => old.dispose(), 2500);
      }
      this.sampler = null;
      this.kit = null;
      if (isKitId(id)) {
        this.kit = buffers;
      } else {
        const urls: Record<number, Tone.ToneAudioBuffer> = {};
        for (const [k, b] of Object.entries(buffers)) urls[Number(k)] = b;
        this.sampler = new Tone.Sampler({ urls, release: releaseFor(id), attack: 0.002, context: this.ctx });
        this.sampler.connect(this.out);
      }
    });
    return this.ready;
  }

  private hitPiece(midi: number, vel: number, time: number) {
    if (!this.kit) return;
    const piece = pieceForMidi(midi) ?? DRUM_PIECES[Math.abs(midi) % DRUM_PIECES.length];
    const buf = this.kit[piece.key];
    if (!buf) return;
    // closed or pedal hi-hat chokes a ringing open hi-hat
    if (piece.key === 'hihat' || piece.key === 'hihat-foot') {
      this.openHats.forEach((s) => s.stop(time + 0.01));
      this.openHats.clear();
    }
    const src = new Tone.ToneBufferSource({ url: buf, context: this.ctx }).connect(this.out);
    src.start(time, 0, undefined, Math.max(0.05, Math.min(1, vel)));
    if (piece.key === 'hihat-open') {
      this.openHats.add(src);
      src.onended = () => this.openHats.delete(src);
    }
  }

  noteOn(midi: number, vel = 0.8, time: number = Tone.immediate()) {
    if (this.kit) return this.hitPiece(midi, vel, time);
    this.sampler?.triggerAttack(Tone.Frequency(midi, 'midi').toFrequency(), time, vel);
  }

  noteOff(midi: number, time: number = Tone.immediate()) {
    if (this.kit) return;
    this.sampler?.triggerRelease(Tone.Frequency(midi, 'midi').toFrequency(), time);
  }

  play(midi: number, duration: number, time: number, vel = 0.8) {
    if (this.kit) return this.hitPiece(midi, vel, time);
    this.sampler?.triggerAttackRelease(Tone.Frequency(midi, 'midi').toFrequency(), duration, time, vel);
  }

  releaseAll() {
    this.sampler?.releaseAll();
  }

  dispose() {
    this.token++;
    this.sampler?.dispose();
    this.sampler = null;
  }
}

/* -------------------------------------------------------------- metronome */

const clickOut = new Tone.Volume(-8).connect(master.input);
const click = new Tone.Synth({
  oscillator: { type: 'triangle' },
  envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.02 },
}).connect(clickOut);

export function metronomeClick(time: number, accent: boolean) {
  click.triggerAttackRelease(accent ? 1760 : 1175, 0.03, time, accent ? 1 : 0.6);
}
export function setClickVolume(db: number) {
  clickOut.volume.value = db;
}
