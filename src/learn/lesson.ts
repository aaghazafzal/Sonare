import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { onLiveNote, releaseAllLive, strike, useLive } from '../audio/live';
import { ensureAudio } from '../audio/engine';
import { mappedRange } from '../audio/input';
import { songById, type Song, type SongNote } from './songs';
import { DEFAULT_INSTRUMENT, isKitId } from '../lib/instruments';

/**
 * Song practice.
 *  watch — the song plays itself and lights the keys
 *  wait  — notes fall and stop at the keyboard until you press the right keys
 *  play  — the song keeps time; notes are scored as hit or missed
 * The hand you don't practise is played for you.
 */
export type LessonMode = 'watch' | 'wait' | 'play';
export type HandSel = 'R' | 'L' | 'both';
export type Judgement = 0 | 1 | 2; // pending, hit, missed

interface LessonState {
  songId: string | null;
  mode: LessonMode;
  hands: HandSel;
  speed: number;
  playing: boolean;
  waiting: boolean;
  finished: boolean;
  pickerOpen: boolean;
  hits: number;
  misses: number;
  streak: number;
  bestStreak: number;
  /** keys to press next, by hand */
  hint: Record<number, 'R' | 'L'>;
  best: Record<string, number>; // song id -> best accuracy %
}

export const useLesson = create<LessonState>()(
  persist(
    (): LessonState => ({
      songId: null,
      mode: 'wait',
      hands: 'R',
      speed: 0.8,
      playing: false,
      waiting: false,
      finished: false,
      pickerOpen: false,
      hits: 0,
      misses: 0,
      streak: 0,
      bestStreak: 0,
      hint: {},
      best: {},
    }),
    { name: 'sonare.lesson', partialize: ({ mode, hands, speed, best }) => ({ mode, hands, speed, best }) },
  ),
);

const LEAD_IN = 3; // beats of falling notes before the first one lands
const WINDOW = 0.4; // beats either side of a note that still count as on time

let song: Song | null = null;
let pos = -LEAD_IN;
let last = 0;
let raf = 0;
let judged: Judgement[] = [];
let autoIdx = 0;
let need = new Set<number>(); // wait mode: pitches still to press for the current chord
let needAt = -1;
let unsub: (() => void) | null = null;
let autoplaying = false;

export const lessonSong = () => song;
export const lessonPos = () => pos;
export const judgement = (n: SongNote) => judged[n.id] ?? 0;

export const isUserNote = (n: SongNote) => {
  const { mode, hands } = useLesson.getState();
  return mode !== 'watch' && (hands === 'both' || n.hand === hands || !song?.hands.includes(hands));
};

const beatMs = () => 60000 / (song?.bpm ?? 100) / useLesson.getState().speed;

/** Choose the octave shift that puts most of the practised notes under the computer keys. */
function fitOctave(s: Song) {
  const notes = s.notes.filter(isUserNote);
  if (!notes.length) return;
  let best = useLive.getState().octave;
  let bestScore = -1;
  for (const o of [0, -1, 1, -2, 2, -3, 3]) {
    const [lo, hi] = mappedRange(o);
    const score = notes.filter((n) => n.pitch >= lo && n.pitch <= hi).length;
    if (score > bestScore) {
      best = o;
      bestScore = score;
    }
  }
  useLive.getState().set({ octave: best, transpose: 0 });
}

function reset() {
  pos = -LEAD_IN;
  judged = song ? song.notes.map(() => 0) : [];
  autoIdx = 0;
  need = new Set();
  needAt = -1;
  useLesson.setState({ hits: 0, misses: 0, streak: 0, bestStreak: 0, waiting: false, finished: false, hint: {} });
  hintKey = '';
  updateHint();
}

export function openSong(id: string) {
  const s = songById(id);
  if (!s) return;
  stopLesson();
  song = s;
  // melodies need a pitched instrument
  if (isKitId(useLive.getState().instrumentId)) useLive.getState().setInstrument(DEFAULT_INSTRUMENT);
  useLesson.setState({ songId: id, pickerOpen: false });
  fitOctave(s);
  reset();
  unsub = onLiveNote((e) => e.type === 'on' && !autoplaying && onUserNote(e.midi));
}

export function closeSong() {
  stopLesson();
  song = null;
  hintKey = '';
  useLesson.setState({ songId: null, hint: {}, waiting: false, finished: false });
}

export function setLesson(p: Partial<Pick<LessonState, 'mode' | 'hands' | 'speed' | 'pickerOpen'>>) {
  const modeChanged = (p.mode && p.mode !== useLesson.getState().mode) || (p.hands && p.hands !== useLesson.getState().hands);
  useLesson.setState(p);
  if (song && modeChanged) {
    pauseLesson();
    fitOctave(song);
    reset();
  }
}

export function playLesson() {
  if (!song) return;
  void ensureAudio();
  if (useLesson.getState().finished) reset();
  useLesson.setState({ playing: true });
  last = performance.now();
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(tick);
}

export function pauseLesson() {
  cancelAnimationFrame(raf);
  useLesson.setState({ playing: false });
}

export function restartLesson() {
  const was = useLesson.getState().playing;
  pauseLesson();
  releaseAllLive();
  reset();
  if (was) playLesson();
}

function stopLesson() {
  pauseLesson();
  unsub?.();
  unsub = null;
}

/** Move the playhead (progress bar); notes before it count as neither hit nor missed. */
export function seekLesson(beat: number) {
  if (!song) return;
  pos = Math.max(-LEAD_IN, Math.min(song.length, beat));
  judged = song.notes.map(() => 0);
  autoIdx = song.notes.findIndex((n) => n.start >= pos - 1e-6);
  if (autoIdx < 0) autoIdx = song.notes.length;
  need = new Set();
  needAt = -1;
  useLesson.setState({ finished: false, waiting: false });
  hintKey = '';
  updateHint();
}

function score(hit: boolean, count = 1) {
  useLesson.setState((s) => {
    const streak = hit ? s.streak + count : 0;
    return {
      hits: s.hits + (hit ? count : 0),
      misses: s.misses + (hit ? 0 : count),
      streak,
      bestStreak: Math.max(s.bestStreak, streak),
    };
  });
}

/** Wait mode: the chord at or just ahead of the playhead that the player has to press. */
function armNext(until: number) {
  if (!song || needAt >= 0) return;
  const due = song.notes.find((n) => isUserNote(n) && !judged[n.id] && n.start >= pos - 1e-6);
  if (!due || due.start > until) return;
  needAt = due.start;
  need = new Set(song.notes.filter((n) => Math.abs(n.start - due.start) < 1e-6 && isUserNote(n)).map((n) => n.pitch));
}

function onUserNote(midi: number) {
  if (!song) return;
  const { mode, playing } = useLesson.getState();
  if (mode === 'watch') return;
  if (mode === 'wait') {
    // a key pressed slightly early still counts
    armNext(pos + WINDOW);
    if (needAt < 0) return;
    if (need.has(midi)) {
      need.delete(midi);
      if (!need.size) {
        let count = 0;
        for (const n of song.notes)
          if (Math.abs(n.start - needAt) < 1e-6 && isUserNote(n)) {
            judged[n.id] = 1;
            count++;
          }
        score(true, count);
        needAt = -1;
        useLesson.setState({ waiting: false });
        updateHint();
      }
    } else if (useLesson.getState().waiting) score(false);
    return;
  }
  if (!playing) return;
  let bestN: SongNote | null = null;
  for (const n of song.notes) {
    if (n.start > pos + WINDOW) break;
    if (n.pitch !== midi || judged[n.id] || !isUserNote(n) || n.start < pos - WINDOW) continue;
    if (!bestN || Math.abs(n.start - pos) < Math.abs(bestN.start - pos)) bestN = n;
  }
  if (bestN) {
    judged[bestN.id] = 1;
    score(true);
  } else score(false);
}

let hintKey = '';
function updateHint() {
  if (!song) return;
  const { mode } = useLesson.getState();
  const hint: Record<number, 'R' | 'L'> = {};
  if (mode === 'wait') {
    const next = song.notes.find((n) => isUserNote(n) && !judged[n.id] && n.start >= pos - 1e-6);
    if (next) for (const n of song.notes) if (Math.abs(n.start - next.start) < 1e-6 && isUserNote(n)) hint[n.pitch] = n.hand;
  } else if (mode === 'play') {
    for (const n of song.notes) {
      if (n.start > pos + 0.75) break;
      if (isUserNote(n) && !judged[n.id] && n.start + n.dur > pos) hint[n.pitch] = n.hand;
    }
  }
  const key = Object.entries(hint).join();
  if (key !== hintKey) {
    hintKey = key;
    useLesson.setState({ hint });
  }
}

function tick(now: number) {
  if (!song) return;
  const s = useLesson.getState();
  const dt = Math.min(100, now - last);
  last = now;
  let next = pos + dt / beatMs();

  if (s.mode === 'wait') {
    armNext(next);
    if (needAt >= 0 && next >= needAt) {
      next = needAt;
      if (!s.waiting) useLesson.setState({ waiting: true });
    }
  } else if (s.mode === 'play') {
    for (const n of song.notes) {
      if (n.start >= next - WINDOW) break;
      if (!judged[n.id] && isUserNote(n)) {
        judged[n.id] = 2;
        score(false);
      }
    }
  }

  // play the accompaniment (and everything in watch mode)
  while (autoIdx < song.notes.length && song.notes[autoIdx].start <= next) {
    const n = song.notes[autoIdx++];
    if (isUserNote(n)) continue;
    autoplaying = true;
    strike(n.pitch, n.hand === 'L' ? 0.55 : 0.7, n.dur * beatMs() * 0.95);
    autoplaying = false;
  }

  pos = next;
  updateHint();

  if (pos >= song.length + 1) {
    pauseLesson();
    const st = useLesson.getState();
    const scored = st.mode !== 'watch' && st.hits + st.misses > 0;
    useLesson.setState({ finished: true, best: scored ? { ...st.best, [song.id]: Math.max(st.best[song.id] ?? 0, accuracy()) } : st.best });
    return;
  }
  raf = requestAnimationFrame(tick);
}

/** Accuracy so far, for the score readout. */
export function accuracy() {
  const { hits, misses } = useLesson.getState();
  return hits + misses ? Math.round((100 * hits) / (hits + misses)) : 100;
}
