export interface Note {
  id: string;
  pitch: number;
  start: number; // beats, relative to clip start
  dur: number; // beats
  vel: number; // 0..1
}

export interface MidiClip {
  id: string;
  kind: 'midi';
  name: string;
  start: number; // beats
  length: number; // beats
  notes: Note[];
}

export interface AudioClip {
  id: string;
  kind: 'audio';
  name: string;
  start: number; // beats
  length: number; // beats (derived from seconds at the bpm it was created with)
  bufferId: string;
  offset: number; // seconds into the buffer
  gain: number;
}

export type Clip = MidiClip | AudioClip;

export type TrackKind = 'instrument' | 'drums' | 'audio';

export interface Track {
  id: string;
  name: string;
  kind: TrackKind;
  instrumentId: string; // unused for audio tracks
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
  clips: Clip[];
}

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
  tracks: Track[];
}

export const TRACK_COLORS = [
  '#d9a144', '#6fae9f', '#d06f58', '#8fa65a', '#6f93c4', '#c7a37a', '#b9768d', '#5fa6b8', '#a39a64', '#c98a4b',
];
