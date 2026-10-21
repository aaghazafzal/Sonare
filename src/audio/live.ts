import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Strip, Voice, ensureAudio } from './engine';
import { DEFAULT_INSTRUMENT, defaultView, getInstrument, getKit, type ViewKind } from '../lib/instruments';
import { CHORD_TYPES } from '../lib/notes';

/** Live performance state shared by every on-screen instrument and input device. */
interface LiveState {
  instrumentId: string;
  view: ViewKind;
  octave: number; // shift applied to computer-keyboard input
  transpose: number;
  velocity: number;
  sustain: boolean;
  chord: string;
  volume: number;
  reverb: number;
  active: Record<number, true>;
  setInstrument: (id: string, keepView?: boolean) => void;
  set: (p: Partial<Omit<LiveState, 'set' | 'setInstrument' | 'active'>>) => void;
}

export const useLive = create<LiveState>()(
  persist(
    (set) => ({
      instrumentId: DEFAULT_INSTRUMENT,
      view: 'keyboard',
      octave: 0,
      transpose: 0,
      velocity: 0.78,
      sustain: false,
      chord: 'off',
      volume: 0,
      reverb: 0.18,
      active: {},
      setInstrument: (id, keepView) =>
        set((s) => ({ instrumentId: id, view: keepView ? s.view : defaultView(id) })),
      set: (p) => set(p),
    }),
    {
      name: 'sonare.live',
      // drop an instrument id that no longer exists in the sample library
      merge: (persisted, current) => {
        const p = { ...current, ...(persisted as Partial<LiveState>) };
        if (!getInstrument(p.instrumentId) && !getKit(p.instrumentId)) {
          p.instrumentId = DEFAULT_INSTRUMENT;
          p.view = 'keyboard';
        }
        return p;
      },
      partialize: ({ instrumentId, view, octave, velocity, chord, volume, reverb }) => ({
        instrumentId,
        view,
        octave,
        velocity,
        chord,
        volume,
        reverb,
      }),
    },
  ),
);

export const liveStrip = new Strip();
export const liveVoice = new Voice(liveStrip.input);

let target: Voice = liveVoice;
export const liveTargetIsKit = () => target.isKit;
/** Studio points live input at the selected track's voice so its effects apply while playing. */
export function setLiveTarget(v: Voice | null) {
  releaseAllLive();
  target = v ?? liveVoice;
}

export type NoteEvent = { type: 'on' | 'off'; midi: number; vel: number };
const listeners = new Set<(e: NoteEvent) => void>();
export function onLiveNote(fn: (e: NoteEvent) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

const held = new Map<number, number>(); // midi -> hold count (several inputs may press the same note)
const sustained = new Set<number>();

function setActive(midi: number, on: boolean) {
  useLive.setState((s) => {
    const active = { ...s.active };
    if (on) active[midi] = true;
    else delete active[midi];
    return { active };
  });
}

function rawOn(midi: number, vel: number) {
  const count = held.get(midi) ?? 0;
  held.set(midi, count + 1);
  if (sustained.has(midi)) {
    target.noteOff(midi);
    sustained.delete(midi);
  }
  target.noteOn(midi, vel);
  setActive(midi, true);
  listeners.forEach((l) => l({ type: 'on', midi, vel }));
}

function rawOff(midi: number) {
  const count = (held.get(midi) ?? 0) - 1;
  if (count > 0) {
    held.set(midi, count);
    return;
  }
  held.delete(midi);
  setActive(midi, false);
  listeners.forEach((l) => l({ type: 'off', midi, vel: 0 }));
  if (useLive.getState().sustain && !target.isKit) sustained.add(midi);
  else target.noteOff(midi);
}

function expand(midi: number) {
  const { chord, transpose } = useLive.getState();
  const intervals = target.isKit ? [0] : CHORD_TYPES[chord]?.intervals ?? [0];
  return intervals.map((i) => midi + i + (target.isKit ? 0 : transpose)).filter((n) => n >= 0 && n <= 127);
}

/** Entry points used by on-screen instruments, the computer keyboard and MIDI devices. */
export function noteOn(midi: number, vel?: number) {
  void ensureAudio();
  const v = vel ?? useLive.getState().velocity;
  expand(midi).forEach((n) => rawOn(n, v));
}

export function noteOff(midi: number) {
  expand(midi).forEach((n) => rawOff(n));
}

/** Fire-and-forget hit (strums, pads) that releases itself. */
export function strike(midi: number, vel?: number, holdMs = 900) {
  void ensureAudio();
  const v = vel ?? useLive.getState().velocity;
  rawOn(midi, v);
  setTimeout(() => rawOff(midi), holdMs);
}

export function setSustain(on: boolean) {
  useLive.setState({ sustain: on });
  if (!on) {
    sustained.forEach((m) => {
      if (!held.has(m)) target.noteOff(m);
    });
    sustained.clear();
  }
}

export function releaseAllLive() {
  held.clear();
  sustained.clear();
  target.releaseAll();
  useLive.setState({ active: {} });
}

// keep the live strip and voice in step with the store
const syncLive = (s: LiveState) => {
  liveStrip.set({ volume: s.volume, reverb: s.reverb });
  liveVoice.setInstrument(s.instrumentId);
};
syncLive(useLive.getState());
useLive.subscribe((s, prev) => {
  if (s.volume !== prev.volume || s.reverb !== prev.reverb || s.instrumentId !== prev.instrumentId) syncLive(s);
});
