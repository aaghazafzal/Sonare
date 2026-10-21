import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AudioClip, Clip, MidiClip, Note, Project, Track, TrackKind } from './types';
import { TRACK_COLORS } from './types';
import { displayName } from '../lib/instruments';

export const uid = () => Math.random().toString(36).slice(2, 10);

export function makeTrack(kind: TrackKind, instrumentId: string, index: number, name?: string): Track {
  return {
    id: uid(),
    name: name ?? (kind === 'audio' ? 'Vocals' : displayName(instrumentId)),
    kind,
    instrumentId,
    color: TRACK_COLORS[index % TRACK_COLORS.length],
    volume: kind === 'drums' ? -3 : -6,
    pan: 0,
    mute: false,
    solo: false,
    arm: false,
    reverb: kind === 'audio' ? 0.22 : kind === 'drums' ? 0.06 : 0.14,
    delay: 0,
    eq: { low: 0, mid: 0, high: 0 },
    comp: kind === 'audio',
    clips: [],
  };
}

const n = (pitch: number, start: number, dur: number, vel = 0.8): Note => ({ id: uid(), pitch, start, dur, vel });

export function demoProject(): Project {
  const drums = makeTrack('drums', 'kit:standard-kit', 0, 'Drums');
  const bass = makeTrack('instrument', 'electric-bass', 1, 'Bass');
  const keys = makeTrack('instrument', 'electric-piano-1', 2, 'Keys');
  const lead = makeTrack('instrument', 'flute', 3, 'Flute');
  const vox = makeTrack('audio', '', 4, 'Vocals');

  const beat: Note[] = [];
  for (let bar = 0; bar < 4; bar++) {
    const o = bar * 4;
    beat.push(n(36, o, 0.25, 0.95), n(36, o + 1.5, 0.25, 0.7), n(36, o + 2.5, 0.25, 0.85));
    beat.push(n(38, o + 1, 0.25, 0.9), n(38, o + 3, 0.25, 0.92));
    for (let e = 0; e < 8; e++) beat.push(n(e === 7 && bar % 2 === 1 ? 46 : 42, o + e * 0.5, 0.25, e % 2 ? 0.45 : 0.7));
  }
  beat.push(n(49, 0, 0.5, 0.8));

  // Am - F - C - G
  const roots = [45, 41, 48, 43];
  const chords = [
    [57, 60, 64],
    [53, 57, 60],
    [55, 60, 64],
    [55, 59, 62],
  ];
  const bassNotes: Note[] = [];
  const keyNotes: Note[] = [];
  roots.forEach((r, bar) => {
    const o = bar * 4;
    bassNotes.push(n(r - 12, o, 1.4, 0.9), n(r - 12, o + 1.5, 0.45, 0.7), n(r, o + 2.5, 0.5, 0.75), n(r - 12, o + 3, 0.9, 0.8));
    chords[bar].forEach((p) => keyNotes.push(n(p, o, 1.9, 0.62), n(p, o + 2.5, 1.4, 0.55)));
  });
  const melody: [number, number, number][] = [
    [76, 0, 1], [74, 1, 0.5], [72, 1.5, 1.5], [69, 4, 1], [72, 5, 1], [74, 6, 2],
    [72, 8, 1], [71, 9, 0.5], [72, 9.5, 0.5], [76, 10, 2], [74, 12, 1.5], [71, 13.5, 0.5], [67, 14, 2],
  ];

  const clip = (name: string, notes: Note[], start = 0, length = 16): MidiClip => ({ id: uid(), kind: 'midi', name, start, length, notes });
  drums.clips = [clip('Groove', beat), clip('Groove', beat.map((x) => ({ ...x, id: uid() })), 16)];
  bass.clips = [clip('Bass line', bassNotes), clip('Bass line', bassNotes.map((x) => ({ ...x, id: uid() })), 16)];
  keys.clips = [clip('Chords', keyNotes), clip('Chords', keyNotes.map((x) => ({ ...x, id: uid() })), 16)];
  lead.clips = [clip('Melody', melody.map(([p, s, d]) => n(p, s, d, 0.72)), 16)];
  lead.reverb = 0.3;
  lead.delay = 0.12;
  keys.pan = -0.15;
  lead.pan = 0.12;

  return {
    id: uid(),
    name: 'Untitled session',
    bpm: 92,
    beatsPerBar: 4,
    bars: 16,
    loop: { on: false, start: 0, end: 16 },
    metronome: false,
    countIn: true,
    master: -4,
    tracks: [drums, bass, keys, lead, vox],
  };
}

export function emptyProject(): Project {
  return {
    id: uid(),
    name: 'Untitled session',
    bpm: 100,
    beatsPerBar: 4,
    bars: 16,
    loop: { on: false, start: 0, end: 16 },
    metronome: true,
    countIn: true,
    master: -4,
    tracks: [makeTrack('drums', 'kit:standard-kit', 0, 'Drums'), makeTrack('instrument', 'studio-acoustic-grand-piano', 1)],
  };
}

export type DockTab = 'editor' | 'mixer' | 'instrument';

interface StudioState {
  project: Project;
  past: Project[];
  future: Project[];
  selectedTrackId: string | null;
  selectedClipId: string | null;
  selectedNotes: string[];
  dock: DockTab;
  dockOpen: boolean;
  pxPerBeat: number;
  snap: number; // beats; 0 = off
  playing: boolean;
  recording: boolean;
  cursor: number; // beats, where playback starts

  /** Mutate the project. `record` false = no undo entry (used mid-drag after a checkpoint). */
  edit: (fn: (p: Project) => Project, record?: boolean) => void;
  checkpoint: () => void;
  undo: () => void;
  redo: () => void;
  setUi: (p: Partial<Omit<StudioState, 'edit' | 'checkpoint' | 'undo' | 'redo' | 'setUi' | 'project'>>) => void;
  loadProject: (p: Project) => void;
}

const HISTORY = 120;

export const useStudio = create<StudioState>()(
  persist(
    (set, get) => ({
      project: demoProject(),
      past: [],
      future: [],
      selectedTrackId: null,
      selectedClipId: null,
      selectedNotes: [],
      dock: 'editor',
      dockOpen: true,
      pxPerBeat: 28,
      snap: 1,
      playing: false,
      recording: false,
      cursor: 0,

      edit: (fn, record = true) =>
        set((s) => {
          const next = fn(s.project);
          if (next === s.project) return {};
          return record
            ? { project: next, past: [...s.past.slice(-HISTORY), s.project], future: [] }
            : { project: next };
        }),
      checkpoint: () => set((s) => ({ past: [...s.past.slice(-HISTORY), s.project], future: [] })),
      undo: () => {
        const { past, project, future } = get();
        if (!past.length) return;
        set({ project: past[past.length - 1], past: past.slice(0, -1), future: [project, ...future] });
      },
      redo: () => {
        const { past, project, future } = get();
        if (!future.length) return;
        set({ project: future[0], future: future.slice(1), past: [...past, project] });
      },
      setUi: (p) => set(p),
      loadProject: (p) =>
        set({ project: p, past: [], future: [], selectedClipId: null, selectedTrackId: p.tracks[0]?.id ?? null, cursor: 0 }),
    }),
    {
      name: 'sonare.studio',
      version: 1,
      partialize: (s) => ({ project: s.project, pxPerBeat: s.pxPerBeat, snap: s.snap, dock: s.dock, dockOpen: s.dockOpen }),
    },
  ),
);

/* ----------------------------------------------------------- pure helpers */

export const mapTrack = (p: Project, id: string, fn: (t: Track) => Track): Project => ({
  ...p,
  tracks: p.tracks.map((t) => (t.id === id ? fn(t) : t)),
});

export const mapClip = (p: Project, clipId: string, fn: (c: Clip) => Clip): Project => ({
  ...p,
  tracks: p.tracks.map((t) => (t.clips.some((c) => c.id === clipId) ? { ...t, clips: t.clips.map((c) => (c.id === clipId ? fn(c) : c)) } : t)),
});

export function findClip(p: Project, clipId: string | null): { track: Track; clip: Clip } | null {
  if (!clipId) return null;
  for (const t of p.tracks) {
    const c = t.clips.find((x) => x.id === clipId);
    if (c) return { track: t, clip: c };
  }
  return null;
}

export function songEnd(p: Project) {
  let end = 0;
  for (const t of p.tracks) for (const c of t.clips) end = Math.max(end, c.start + c.length);
  return end;
}

export function cloneClip(c: Clip, start: number): Clip {
  if (c.kind === 'midi') return { ...c, id: uid(), start, notes: c.notes.map((x) => ({ ...x, id: uid() })) };
  return { ...(c as AudioClip), id: uid(), start };
}

export function splitClip(c: Clip, at: number, bpm: number): [Clip, Clip] | null {
  const rel = at - c.start;
  if (rel <= 0.01 || rel >= c.length - 0.01) return null;
  if (c.kind === 'midi') {
    const a: MidiClip = { ...c, length: rel, notes: c.notes.filter((x) => x.start < rel).map((x) => ({ ...x, dur: Math.min(x.dur, rel - x.start) })) };
    const b: MidiClip = {
      ...c,
      id: uid(),
      start: at,
      length: c.length - rel,
      notes: c.notes.filter((x) => x.start >= rel).map((x) => ({ ...x, id: uid(), start: x.start - rel })),
    };
    return [a, b];
  }
  const a: AudioClip = { ...c, length: rel };
  const b: AudioClip = { ...c, id: uid(), start: at, length: c.length - rel, offset: c.offset + (rel * 60) / bpm };
  return [a, b];
}
