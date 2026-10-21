import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AudioItem, Lane, Note, Pattern, PatternItem, PlaylistItem, Project, Track, TrackKind } from './types';
import { PATTERN_COLORS, TRACK_COLORS } from './types';
import { displayName, isKitId } from '../lib/instruments';
import { presetById, type PresetDef } from './presets';

export const uid = () => Math.random().toString(36).slice(2, 10);

/* ------------------------------------------------------------- factories */

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
  };
}

export function makePattern(index: number, name?: string, length = 4): Pattern {
  return {
    id: uid(),
    name: name ?? `Pattern ${index + 1}`,
    color: PATTERN_COLORS[index % PATTERN_COLORS.length],
    length,
    swing: 0,
    notes: {},
  };
}

export const makeLanes = (n: number, names: string[] = []): Lane[] =>
  Array.from({ length: n }, (_, i) => ({ name: names[i] ?? `Track ${i + 1}`, mute: false }));

const withIds = (notes: Omit<Note, 'id'>[]): Note[] => notes.map((n) => ({ ...n, id: uid() }));

/* ------------------------------------------------------------- templates */

interface TemplateSpec {
  name: string;
  bpm: number;
  channels: { kind: TrackKind; inst: string; name?: string; reverb?: number; pan?: number }[];
  /** pattern name, then [channel index, preset id] pairs */
  patterns: { name: string; bars: number; parts: [number, string][]; swing?: number }[];
  /** [pattern index, lane, start bar, length bars] */
  arrange: [number, number, number, number][];
}

const TEMPLATES: Record<string, TemplateSpec> = {
  demo: {
    name: 'Demo session',
    bpm: 92,
    channels: [
      { kind: 'drums', inst: 'kit:standard-kit', name: 'Drums' },
      { kind: 'instrument', inst: 'electric-bass', name: 'Bass' },
      { kind: 'instrument', inst: 'electric-piano-1', name: 'Keys', pan: -0.15 },
      { kind: 'instrument', inst: 'flute', name: 'Flute', reverb: 0.3, pan: 0.12 },
      { kind: 'audio', inst: '', name: 'Vocals' },
    ],
    patterns: [
      { name: 'Beat', bars: 1, parts: [[0, 'd-boombap']] },
      { name: 'Bass', bars: 4, parts: [[1, 'b-groove']] },
      { name: 'Chords', bars: 4, parts: [[2, 'c-sad']] },
      { name: 'Melody', bars: 4, parts: [[3, 'm-hook']] },
    ],
    arrange: [[0, 0, 0, 8], [1, 1, 0, 8], [2, 2, 0, 8], [3, 3, 4, 4]],
  },
  hiphop: {
    name: 'Hip-hop beat',
    bpm: 88,
    channels: [
      { kind: 'drums', inst: 'kit:smooth-kit', name: 'Drums' },
      { kind: 'instrument', inst: 'fretless-bass', name: 'Bass' },
      { kind: 'instrument', inst: 'electric-piano-2', name: 'Keys', reverb: 0.25 },
    ],
    patterns: [
      { name: 'Beat', bars: 1, parts: [[0, 'd-boombap']], swing: 0.4 },
      { name: 'Keys', bars: 4, parts: [[2, 'c-lofi']] },
      { name: 'Bass', bars: 4, parts: [[1, 'b-groove']] },
    ],
    arrange: [[0, 0, 0, 8], [1, 1, 0, 8], [2, 2, 4, 4]],
  },
  pop: {
    name: 'Pop song',
    bpm: 104,
    channels: [
      { kind: 'drums', inst: 'kit:standard-kit', name: 'Drums' },
      { kind: 'instrument', inst: 'electric-bass', name: 'Bass' },
      { kind: 'instrument', inst: 'grand-piano-1', name: 'Piano' },
      { kind: 'instrument', inst: 'string-ensemble', name: 'Strings', reverb: 0.35 },
      { kind: 'audio', inst: '', name: 'Vocals' },
    ],
    patterns: [
      { name: 'Drums', bars: 1, parts: [[0, 'd-rock']] },
      { name: 'Chords', bars: 4, parts: [[2, 'c-pop'], [1, 'b-pop']] },
      { name: 'Strings', bars: 4, parts: [[3, 'c-pop']] },
      { name: 'Fill', bars: 1, parts: [[0, 'd-fill']] },
    ],
    arrange: [[1, 1, 0, 8], [0, 0, 4, 3], [3, 0, 7, 1], [0, 0, 8, 4], [2, 2, 8, 4]],
  },
  trap: {
    name: 'Trap',
    bpm: 140,
    channels: [
      { kind: 'drums', inst: 'kit:powerful-kit', name: 'Drums' },
      { kind: 'instrument', inst: 'synth-bass-1', name: '808' },
      { kind: 'instrument', inst: 'music-box', name: 'Bells', reverb: 0.4 },
    ],
    patterns: [
      { name: 'Drums', bars: 1, parts: [[0, 'd-trap']] },
      { name: '808', bars: 4, parts: [[1, 'b-808']] },
      { name: 'Bells', bars: 4, parts: [[2, 'm-hook']] },
    ],
    arrange: [[2, 2, 0, 8], [0, 0, 4, 4], [1, 1, 4, 4]],
  },
  house: {
    name: 'House',
    bpm: 124,
    channels: [
      { kind: 'drums', inst: 'kit:energetic-kit', name: 'Drums' },
      { kind: 'instrument', inst: 'synth-bass-2', name: 'Bass' },
      { kind: 'instrument', inst: 'synth-strings-1', name: 'Chords', reverb: 0.3 },
      { kind: 'instrument', inst: 'square-lead', name: 'Lead' },
    ],
    patterns: [
      { name: 'Drums', bars: 1, parts: [[0, 'd-house']] },
      { name: 'Chords', bars: 4, parts: [[2, 'c-minor'], [1, 'b-pop']] },
      { name: 'Arp', bars: 4, parts: [[3, 'm-arp']] },
    ],
    arrange: [[0, 0, 0, 8], [1, 1, 0, 8], [2, 2, 4, 4]],
  },
  empty: {
    name: 'Untitled session',
    bpm: 100,
    channels: [
      { kind: 'drums', inst: 'kit:standard-kit', name: 'Drums' },
      { kind: 'instrument', inst: 'studio-acoustic-grand-piano' },
      { kind: 'audio', inst: '', name: 'Vocals' },
    ],
    patterns: [{ name: 'Pattern 1', bars: 1, parts: [] }],
    arrange: [],
  },
};

export const TEMPLATE_LIST: { id: string; name: string; hint: string }[] = [
  { id: 'empty', name: 'Empty', hint: 'Drums, piano and a vocal channel' },
  { id: 'demo', name: 'Demo session', hint: 'Boom-bap beat with keys and flute' },
  { id: 'hiphop', name: 'Hip-hop', hint: 'Swung drums, lo-fi keys, bass — 88 BPM' },
  { id: 'pop', name: 'Pop', hint: 'Rock beat, piano, strings, fill — 104 BPM' },
  { id: 'trap', name: 'Trap', hint: 'Rolling hats, 808 and bells — 140 BPM' },
  { id: 'house', name: 'House', hint: 'Four on the floor, minor chords, arp — 124 BPM' },
];

export function fromTemplate(id: string): Project {
  const spec = TEMPLATES[id] ?? TEMPLATES.empty;
  const tracks = spec.channels.map((c, i) => {
    const t = makeTrack(c.kind, c.inst, i, c.name);
    if (c.reverb !== undefined) t.reverb = c.reverb;
    if (c.pan !== undefined) t.pan = c.pan;
    return t;
  });
  const patterns = spec.patterns.map((ps, i) => {
    const p = makePattern(i, ps.name, ps.bars * 4);
    p.swing = ps.swing ?? 0;
    for (const [ch, presetId] of ps.parts) {
      const pre = presetById(presetId);
      if (pre) p.notes[tracks[ch].id] = [...(p.notes[tracks[ch].id] ?? []), ...withIds(pre.build())];
    }
    return p;
  });
  const playlist: PlaylistItem[] = spec.arrange.map(([pi, lane, bar, len]) => ({
    id: uid(),
    kind: 'pattern',
    patternId: patterns[pi].id,
    lane,
    start: bar * 4,
    length: len * 4,
  }));
  const laneNames = spec.patterns.map((p) => p.name);
  return {
    id: uid(),
    name: spec.name,
    bpm: spec.bpm,
    beatsPerBar: 4,
    bars: 16,
    loop: { on: false, start: 0, end: 16 },
    metronome: id === 'empty',
    countIn: true,
    master: -4,
    tracks,
    patterns,
    currentPatternId: patterns[0].id,
    playlist,
    lanes: makeLanes(Math.max(12, tracks.length + 6), id === 'empty' ? [] : laneNames),
    mode: id === 'empty' ? 'pattern' : 'song',
  };
}

export const demoProject = () => fromTemplate('demo');
export const emptyProject = () => fromTemplate('empty');

/* ------------------------------------------------- old (v1) session files */

interface V1Clip {
  id: string;
  kind: 'midi' | 'audio';
  name: string;
  start: number;
  length: number;
  notes?: Note[];
  bufferId?: string;
  offset?: number;
  gain?: number;
}
type V1Track = Track & { clips?: V1Clip[] };

/** Accept current projects and convert track/clip sessions from the first version. */
export function normalizeProject(raw: unknown): Project {
  const p = raw as Partial<Project>;
  if (Array.isArray(p.patterns) && Array.isArray(p.playlist)) return p as Project;
  const oldTracks = (p.tracks ?? []) as V1Track[];
  const patterns: Pattern[] = [];
  const playlist: PlaylistItem[] = [];
  // identical clips (e.g. a duplicated groove) become one pattern placed twice
  const seen = new Map<string, Pattern>();
  oldTracks.forEach((t, lane) => {
    for (const c of t.clips ?? []) {
      if (c.kind === 'midi') {
        const key = `${t.id}|${c.name}|${c.length}|${JSON.stringify((c.notes ?? []).map((n) => [n.pitch, n.start, n.dur, n.vel]))}`;
        let pat = seen.get(key);
        if (!pat) {
          pat = makePattern(patterns.length, c.name, c.length);
          pat.notes[t.id] = c.notes ?? [];
          patterns.push(pat);
          seen.set(key, pat);
        }
        playlist.push({ id: uid(), kind: 'pattern', patternId: pat.id, lane, start: c.start, length: c.length });
      } else if (c.bufferId) {
        playlist.push({
          id: uid(), kind: 'audio', channelId: t.id, name: c.name, lane, start: c.start, length: c.length,
          bufferId: c.bufferId, offset: c.offset ?? 0, gain: c.gain ?? 1,
        });
      }
    }
  });
  if (!patterns.length) patterns.push(makePattern(0));
  const tracks: Track[] = oldTracks.map(({ clips: _drop, ...rest }) => {
    void _drop;
    return rest;
  });
  return {
    id: p.id ?? uid(),
    name: p.name ?? 'Untitled session',
    bpm: p.bpm ?? 100,
    beatsPerBar: p.beatsPerBar ?? 4,
    bars: p.bars ?? 16,
    loop: p.loop ?? { on: false, start: 0, end: 16 },
    metronome: p.metronome ?? false,
    countIn: p.countIn ?? true,
    master: p.master ?? -4,
    tracks,
    patterns,
    currentPatternId: patterns[0].id,
    playlist,
    lanes: makeLanes(Math.max(12, tracks.length + 6), tracks.map((t) => t.name)),
    mode: 'song',
  };
}

/* ----------------------------------------------------------------- store */

export type DockTab = 'rack' | 'roll' | 'mixer' | 'instrument';

interface StudioState {
  project: Project;
  past: Project[];
  future: Project[];
  selectedTrackId: string | null; // selected channel
  selectedItemId: string | null; // selected playlist item
  selectedNotes: string[];
  dock: DockTab;
  dockOpen: boolean;
  browserOpen: boolean;
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
      selectedItemId: null,
      selectedNotes: [],
      dock: 'rack',
      dockOpen: true,
      browserOpen: true,
      pxPerBeat: 24,
      snap: 4,
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
        set({
          project: normalizeProject(p),
          past: [],
          future: [],
          selectedItemId: null,
          selectedNotes: [],
          selectedTrackId: p.tracks[0]?.id ?? null,
          cursor: 0,
        }),
    }),
    {
      name: 'sonare.studio',
      version: 2,
      migrate: (state, version) => {
        const s = state as { project?: unknown; dock?: string; snap?: number };
        if (version < 2) {
          if (s.project) s.project = normalizeProject(s.project);
          s.dock = 'rack';
          s.snap = 4;
        }
        return s as never;
      },
      partialize: (s) => ({
        project: s.project,
        pxPerBeat: s.pxPerBeat,
        snap: s.snap,
        dock: s.dock,
        dockOpen: s.dockOpen,
        browserOpen: s.browserOpen,
      }),
    },
  ),
);

/* ----------------------------------------------------------- pure helpers */

export const mapTrack = (p: Project, id: string, fn: (t: Track) => Track): Project => ({
  ...p,
  tracks: p.tracks.map((t) => (t.id === id ? fn(t) : t)),
});

export const mapPattern = (p: Project, id: string, fn: (pt: Pattern) => Pattern): Project => ({
  ...p,
  patterns: p.patterns.map((pt) => (pt.id === id ? fn(pt) : pt)),
});

export const mapItem = (p: Project, id: string, fn: (it: PlaylistItem) => PlaylistItem): Project => ({
  ...p,
  playlist: p.playlist.map((it) => (it.id === id ? fn(it) : it)),
});

export const setChannelNotes = (p: Project, patternId: string, channelId: string, fn: (n: Note[]) => Note[]): Project =>
  mapPattern(p, patternId, (pt) => ({ ...pt, notes: { ...pt.notes, [channelId]: fn(pt.notes[channelId] ?? []) } }));

export const currentPattern = (p: Project) => p.patterns.find((x) => x.id === p.currentPatternId) ?? p.patterns[0];

export function songEnd(p: Project) {
  let end = 0;
  for (const it of p.playlist) end = Math.max(end, it.start + it.length);
  return end;
}

/** First lane with nothing between start and end (adds lanes when all are busy). */
export function freeLane(p: Project, start: number, end: number, from = 0): number {
  for (let lane = from; lane < p.lanes.length + 1; lane++) {
    const busy = p.playlist.some((it) => it.lane === lane && it.start < end && it.start + it.length > start);
    if (!busy) return lane;
  }
  return p.lanes.length;
}

export function ensureLanes(p: Project, lane: number): Project {
  if (lane < p.lanes.length - 1) return p;
  return { ...p, lanes: [...p.lanes, ...makeLanes(lane - p.lanes.length + 4).map((l, i) => ({ ...l, name: `Track ${p.lanes.length + i + 1}` }))] };
}

export function newPattern(p: Project, name?: string, length?: number): [Project, Pattern] {
  const pat = makePattern(p.patterns.length, name, length ?? p.beatsPerBar);
  return [{ ...p, patterns: [...p.patterns, pat], currentPatternId: pat.id }, pat];
}

export function clonePattern(p: Project, id: string): [Project, Pattern] | null {
  const src = p.patterns.find((x) => x.id === id);
  if (!src) return null;
  const notes: Record<string, Note[]> = {};
  for (const [ch, ns] of Object.entries(src.notes)) notes[ch] = ns.map((n) => ({ ...n, id: uid() }));
  const pat: Pattern = { ...src, id: uid(), name: `${src.name} copy`, color: PATTERN_COLORS[p.patterns.length % PATTERN_COLORS.length], notes };
  return [{ ...p, patterns: [...p.patterns, pat], currentPatternId: pat.id }, pat];
}

export function deletePattern(p: Project, id: string): Project {
  if (p.patterns.length <= 1) return p;
  const patterns = p.patterns.filter((x) => x.id !== id);
  return {
    ...p,
    patterns,
    playlist: p.playlist.filter((it) => !(it.kind === 'pattern' && it.patternId === id)),
    currentPatternId: p.currentPatternId === id ? patterns[0].id : p.currentPatternId,
  };
}

export function addChannel(p: Project, kind: TrackKind, instrumentId: string, name?: string): [Project, Track] {
  const t = makeTrack(kind, instrumentId, p.tracks.length, name);
  return [{ ...p, tracks: [...p.tracks, t] }, t];
}

export function removeChannel(p: Project, id: string): Project {
  return {
    ...p,
    tracks: p.tracks.filter((t) => t.id !== id),
    patterns: p.patterns.map((pt) => {
      if (!(id in pt.notes)) return pt;
      const notes = { ...pt.notes };
      delete notes[id];
      return { ...pt, notes };
    }),
    playlist: p.playlist.filter((it) => !(it.kind === 'audio' && it.channelId === id)),
  };
}

export const channelKind = (instrumentId: string): TrackKind => (isKitId(instrumentId) ? 'drums' : 'instrument');

/** Drop a browser preset into the project: a new pattern on a suitable channel. */
export function applyPreset(p: Project, preset: PresetDef, opts: { channelId?: string | null; place?: { lane: number; start: number } }) {
  let next = p;
  let channel = opts.channelId ? next.tracks.find((t) => t.id === opts.channelId) : undefined;
  const wantDrums = preset.category === 'drums';
  if (!channel || (wantDrums ? channel.kind !== 'drums' : channel.kind !== 'instrument')) {
    channel = next.tracks.find((t) => (wantDrums ? t.kind === 'drums' : t.kind === 'instrument'));
  }
  if (!channel) {
    const inst = wantDrums ? 'kit:standard-kit' : preset.category === 'bass' ? 'electric-bass' : 'studio-acoustic-grand-piano';
    [next, channel] = addChannel(next, wantDrums ? 'drums' : 'instrument', inst);
  }
  const [withPat, pat] = newPattern(next, preset.name.replace(/\s+/g, ' ').trim(), preset.bars * next.beatsPerBar);
  next = setChannelNotes(withPat, pat.id, channel.id, () => withIds(preset.build()));
  let item: PatternItem | null = null;
  if (opts.place) {
    item = { id: uid(), kind: 'pattern', patternId: pat.id, lane: opts.place.lane, start: opts.place.start, length: pat.length };
    next = ensureLanes({ ...next, playlist: [...next.playlist, item] }, opts.place.lane);
  }
  return { project: next, pattern: pat, channel, item };
}

export function cloneItem(it: PlaylistItem, start: number, lane = it.lane): PlaylistItem {
  return { ...it, id: uid(), start, lane };
}

export function splitAudioItem(it: AudioItem, at: number, bpm: number): [AudioItem, AudioItem] | null {
  const rel = at - it.start;
  if (rel <= 0.01 || rel >= it.length - 0.01) return null;
  return [
    { ...it, length: rel },
    { ...it, id: uid(), start: at, length: it.length - rel, offset: it.offset + (rel * 60) / bpm },
  ];
}

export function patternNotesFlat(pt: Pattern): Note[] {
  return Object.values(pt.notes).flat();
}
