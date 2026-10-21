export interface Note {
  id: string;
  pitch: number;
  start: number; // beats, relative to the pattern start
  dur: number; // beats
  vel: number; // 0..1
}

/** A pattern holds notes for any number of channels, like an FL Studio pattern. */
export interface Pattern {
  id: string;
  name: string;
  color: string;
  length: number; // beats
  swing: number; // 0..1, delays every second 16th
  notes: Record<string, Note[]>; // channel id -> notes
}

/** A pattern placed on the playlist. Longer than the pattern = it repeats. */
export interface PatternItem {
  id: string;
  kind: 'pattern';
  patternId: string;
  lane: number;
  start: number; // beats
  length: number; // beats
}

/** Recorded or imported audio on the playlist, played through an audio channel. */
export interface AudioItem {
  id: string;
  kind: 'audio';
  channelId: string;
  name: string;
  lane: number;
  start: number; // beats
  length: number; // beats (from seconds at the bpm it was created with)
  bufferId: string;
  offset: number; // seconds into the buffer
  gain: number;
}

export type PlaylistItem = PatternItem | AudioItem;

export interface Lane {
  name: string;
  mute: boolean;
}

export type TrackKind = 'instrument' | 'drums' | 'audio';

/** A channel: one instrument (or audio input) with its own mixer insert. */
export interface Track {
  id: string;
  name: string;
  kind: TrackKind;
  instrumentId: string; // unused for audio channels
  color: string;
  volume: number; // dB
  pan: number; // -1..1
  mute: boolean;
  solo: boolean;
  arm: boolean;
  reverb: number; // send 0..1
  delay: number; // send 0..1
  eq: { low: number; mid: number; high: number };
  comp: boolean;
}

export type PlayMode = 'pattern' | 'song';

export interface Project {
  id: string;
  name: string;
  bpm: number;
  beatsPerBar: number;
  bars: number;
  loop: { on: boolean; start: number; end: number };
  metronome: boolean;
  countIn: boolean;
  master: number;
  tracks: Track[]; // channels, in channel-rack order
  patterns: Pattern[];
  currentPatternId: string;
  playlist: PlaylistItem[];
  lanes: Lane[];
  mode: PlayMode;
}

export const TRACK_COLORS = [
  '#d9a144', '#6fae9f', '#d06f58', '#8fa65a', '#6f93c4', '#c7a37a', '#b9768d', '#5fa6b8', '#a39a64', '#c98a4b',
];

export const PATTERN_COLORS = [
  '#5c8fbf', '#c0703f', '#7aa35a', '#b56a8c', '#c9a447', '#5aa59b', '#7f8c99', '#c35d5d', '#6c9e7a', '#b08a5b',
];
