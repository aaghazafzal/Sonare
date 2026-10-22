import * as Tone from 'tone';

/** Insert effects a mixer channel can carry, in the order the user chains them. */
export type FxType = 'filter' | 'distortion' | 'bitcrusher' | 'chorus' | 'phaser' | 'tremolo' | 'delay' | 'reverb' | 'widener' | 'limiter';

export interface FxSlot {
  id: string;
  type: FxType;
  on: boolean;
  mix: number; // 0..1 dry/wet, ignored by effects without a wet control
  params: Record<string, number>;
}

export interface FxParamDef {
  key: string;
  label: string;
  min: number;
  max: number;
  def: number;
  step?: number;
  log?: boolean;
  unit?: 'hz' | 'db' | 'ms' | 'pct' | 'x' | 'bits' | 'sec';
  choices?: string[];
}

export const DELAY_TIMES = ['16n', '8n', '8n.', '4n', '4n.', '2n'];
const DELAY_LABELS = ['1/16', '1/8', '1/8 dotted', '1/4', '1/4 dotted', '1/2'];
const FILTER_TYPES: BiquadFilterType[] = ['lowpass', 'highpass', 'bandpass'];

export const FX_DEFS: Record<FxType, { label: string; hint: string; mix: boolean; params: FxParamDef[] }> = {
  filter: {
    label: 'Filter',
    hint: 'Cut lows or highs — sweep it with automation',
    mix: false,
    params: [
      { key: 'mode', label: 'Type', min: 0, max: 2, def: 0, step: 1, choices: ['Low-pass', 'High-pass', 'Band-pass'] },
      { key: 'cutoff', label: 'Cutoff', min: 40, max: 18000, def: 8000, log: true, unit: 'hz' },
      { key: 'q', label: 'Reso', min: 0.5, max: 15, def: 1, unit: 'x' },
    ],
  },
  distortion: {
    label: 'Distortion',
    hint: 'Grit and drive for guitars, bass and drums',
    mix: true,
    params: [{ key: 'drive', label: 'Drive', min: 0, max: 1, def: 0.4, unit: 'pct' }],
  },
  bitcrusher: {
    label: 'Bitcrusher',
    hint: 'Lo-fi, retro digital crunch',
    mix: true,
    params: [{ key: 'bits', label: 'Bits', min: 1, max: 16, def: 6, step: 1, unit: 'bits' }],
  },
  chorus: {
    label: 'Chorus',
    hint: 'Thickens and widens pads, keys and guitars',
    mix: true,
    params: [
      { key: 'rate', label: 'Rate', min: 0.1, max: 8, def: 1.5, unit: 'hz' },
      { key: 'depth', label: 'Depth', min: 0, max: 1, def: 0.6, unit: 'pct' },
      { key: 'delay', label: 'Delay', min: 2, max: 20, def: 3.5, unit: 'ms' },
    ],
  },
  phaser: {
    label: 'Phaser',
    hint: 'Swirling sweep',
    mix: true,
    params: [
      { key: 'rate', label: 'Rate', min: 0.05, max: 8, def: 0.5, unit: 'hz' },
      { key: 'octaves', label: 'Range', min: 1, max: 6, def: 3, unit: 'x' },
      { key: 'base', label: 'Base', min: 100, max: 1500, def: 350, log: true, unit: 'hz' },
    ],
  },
  tremolo: {
    label: 'Tremolo',
    hint: 'Pulsing volume',
    mix: true,
    params: [
      { key: 'rate', label: 'Rate', min: 0.5, max: 20, def: 5, unit: 'hz' },
      { key: 'depth', label: 'Depth', min: 0, max: 1, def: 0.6, unit: 'pct' },
    ],
  },
  delay: {
    label: 'Ping-pong delay',
    hint: 'Echoes bouncing left and right, in time with the song',
    mix: true,
    params: [
      { key: 'time', label: 'Time', min: 0, max: DELAY_TIMES.length - 1, def: 1, step: 1, choices: DELAY_LABELS },
      { key: 'feedback', label: 'Feedback', min: 0, max: 0.9, def: 0.35, unit: 'pct' },
    ],
  },
  reverb: {
    label: 'Reverb',
    hint: 'A room just for this channel (the mixer send is shared)',
    mix: true,
    params: [
      { key: 'size', label: 'Size', min: 0.1, max: 0.98, def: 0.75, unit: 'pct' },
      { key: 'damp', label: 'Damp', min: 500, max: 9000, def: 3000, log: true, unit: 'hz' },
    ],
  },
  widener: {
    label: 'Stereo width',
    hint: 'Narrow to mono or spread wider',
    mix: false,
    params: [{ key: 'width', label: 'Width', min: 0, max: 1, def: 0.7, unit: 'pct' }],
  },
  limiter: {
    label: 'Limiter',
    hint: 'Stops peaks from getting louder than the threshold',
    mix: false,
    params: [{ key: 'threshold', label: 'Ceiling', min: -24, max: 0, def: -6, unit: 'db' }],
  },
};

export const FX_TYPES = Object.keys(FX_DEFS) as FxType[];

export function defaultSlot(type: FxType, id: string): FxSlot {
  const params: Record<string, number> = {};
  for (const p of FX_DEFS[type].params) params[p.key] = p.def;
  return { id, type, on: true, mix: type === 'reverb' ? 0.3 : type === 'delay' ? 0.25 : 1, params };
}

export function formatParam(def: FxParamDef, v: number): string {
  if (def.choices) return def.choices[Math.round(v)] ?? '';
  switch (def.unit) {
    case 'hz':
      return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v.toFixed(v < 10 ? 1 : 0)}`;
    case 'db':
      return `${v.toFixed(1)} dB`;
    case 'ms':
      return `${v.toFixed(1)} ms`;
    case 'pct':
      return `${Math.round(v * 100)}%`;
    case 'bits':
      return `${Math.round(v)}`;
    default:
      return v.toFixed(1);
  }
}

export interface FxInstance {
  node: Tone.ToneAudioNode;
  apply(slot: FxSlot): void;
  /** the filter's cutoff, for automation */
  cutoff?: Tone.Signal<'frequency'>;
  dispose(): void;
}

const p = (slot: FxSlot, key: string) => slot.params[key] ?? FX_DEFS[slot.type].params.find((x) => x.key === key)?.def ?? 0;

export function createFx(slot: FxSlot): FxInstance {
  switch (slot.type) {
    case 'filter': {
      const f = new Tone.Filter({ type: 'lowpass', frequency: p(slot, 'cutoff'), Q: p(slot, 'q'), rolloff: -24 });
      return {
        node: f,
        cutoff: f.frequency,
        apply: (s) => {
          f.type = FILTER_TYPES[Math.round(p(s, 'mode'))] ?? 'lowpass';
          f.frequency.rampTo(p(s, 'cutoff'), 0.03);
          f.Q.value = p(s, 'q');
        },
        dispose: () => f.dispose(),
      };
    }
    case 'distortion': {
      const d = new Tone.Distortion({ distortion: p(slot, 'drive'), oversample: '2x' });
      return { node: d, apply: (s) => d.set({ distortion: p(s, 'drive'), wet: s.mix }), dispose: () => d.dispose() };
    }
    case 'bitcrusher': {
      const b = new Tone.BitCrusher({ bits: p(slot, 'bits') });
      return { node: b, apply: (s) => b.set({ bits: Math.round(p(s, 'bits')), wet: s.mix }), dispose: () => b.dispose() };
    }
    case 'chorus': {
      const c = new Tone.Chorus({ frequency: p(slot, 'rate'), depth: p(slot, 'depth'), delayTime: p(slot, 'delay') }).start();
      return {
        node: c,
        apply: (s) => c.set({ frequency: p(s, 'rate'), depth: p(s, 'depth'), delayTime: p(s, 'delay'), wet: s.mix }),
        dispose: () => c.dispose(),
      };
    }
    case 'phaser': {
      const ph = new Tone.Phaser({ frequency: p(slot, 'rate'), octaves: p(slot, 'octaves'), baseFrequency: p(slot, 'base') });
      return {
        node: ph,
        apply: (s) => ph.set({ frequency: p(s, 'rate'), octaves: p(s, 'octaves'), baseFrequency: p(s, 'base'), wet: s.mix }),
        dispose: () => ph.dispose(),
      };
    }
    case 'tremolo': {
      const t = new Tone.Tremolo({ frequency: p(slot, 'rate'), depth: p(slot, 'depth') }).start();
      return { node: t, apply: (s) => t.set({ frequency: p(s, 'rate'), depth: p(s, 'depth'), wet: s.mix }), dispose: () => t.dispose() };
    }
    case 'delay': {
      const d = new Tone.PingPongDelay({ delayTime: DELAY_TIMES[Math.round(p(slot, 'time'))] ?? '8n', feedback: p(slot, 'feedback') });
      return {
        node: d,
        apply: (s) => d.set({ delayTime: DELAY_TIMES[Math.round(p(s, 'time'))] ?? '8n', feedback: p(s, 'feedback'), wet: s.mix }),
        dispose: () => d.dispose(),
      };
    }
    case 'reverb': {
      const r = new Tone.Freeverb({ roomSize: p(slot, 'size'), dampening: p(slot, 'damp') });
      return { node: r, apply: (s) => r.set({ roomSize: p(s, 'size'), dampening: p(s, 'damp'), wet: s.mix }), dispose: () => r.dispose() };
    }
    case 'widener': {
      const w = new Tone.StereoWidener({ width: p(slot, 'width') });
      return { node: w, apply: (s) => w.set({ width: p(s, 'width') }), dispose: () => w.dispose() };
    }
    case 'limiter': {
      const l = new Tone.Limiter(p(slot, 'threshold'));
      return { node: l, apply: (s) => l.threshold.rampTo(p(s, 'threshold'), 0.03), dispose: () => l.dispose() };
    }
  }
}
