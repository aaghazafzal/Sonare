import type { Note } from './types';

/** Ready-made patterns for the browser: drag or click to drop them into a project. */
export interface PresetDef {
  id: string;
  name: string;
  category: 'drums' | 'chords' | 'bass' | 'melody';
  bars: number;
  hint: string;
  build: () => Omit<Note, 'id'>[];
}

const GM = { kick: 36, stick: 37, snare: 38, hatC: 42, hatP: 44, hatO: 46, tomF: 41, tomM: 45, tomH: 48, crash: 49, ride: 51 };

/** "x" = hit, "o" = soft hit, "-" = rest; one character per 16th note. */
function steps(rows: [number, string][], bars = 1): Omit<Note, 'id'>[] {
  const out: Omit<Note, 'id'>[] = [];
  for (let b = 0; b < bars; b++)
    for (const [pitch, row] of rows)
      [...row].forEach((c, i) => {
        if (c === 'x' || c === 'o') out.push({ pitch, start: b * row.length * 0.25 + i * 0.25, dur: 0.25, vel: c === 'x' ? 0.92 : 0.55 });
      });
  return out;
}

function chords(list: number[][], beatsEach = 4, rhythm: [number, number][] = [[0, beatsEach - 0.1]], vel = 0.62) {
  const out: Omit<Note, 'id'>[] = [];
  list.forEach((ch, i) =>
    rhythm.forEach(([s, d]) => ch.forEach((pitch) => out.push({ pitch, start: i * beatsEach + s, dur: d, vel }))),
  );
  return out;
}

function line(notes: [number, number, number][], vel = 0.8): Omit<Note, 'id'>[] {
  return notes.map(([pitch, start, dur]) => ({ pitch, start, dur, vel }));
}

// voicings around middle C
const C = [48, 52, 55, 60];
const G = [47, 50, 55, 59];
const Am = [45, 52, 57, 60];
const F = [45, 48, 53, 57];
const Dm7 = [50, 53, 57, 60];
const G7 = [47, 50, 53, 57];
const Cmaj7 = [48, 52, 55, 59];
const Fmaj7 = [53, 57, 60, 64];
const Em7 = [52, 55, 59, 62];
const Dm = [50, 53, 57, 62];
const E = [52, 56, 59, 64];

export const PRESETS: PresetDef[] = [
  {
    id: 'd-rock', name: 'Basic rock', category: 'drums', bars: 1, hint: 'Kick on 1 & 3, snare on 2 & 4, steady eighths',
    build: () => steps([[GM.kick, 'x-------x-x-----'], [GM.snare, '----x-------x---'], [GM.hatC, 'x-x-x-x-x-x-x-x-']]),
  },
  {
    id: 'd-boombap', name: 'Boom bap', category: 'drums', bars: 1, hint: 'Classic 90s hip-hop groove',
    build: () => steps([[GM.kick, 'x-------x-x---o-'], [GM.snare, '----x-------x---'], [GM.hatC, 'x-xox-xox-xox-xo']]),
  },
  {
    id: 'd-trap', name: 'Trap', category: 'drums', bars: 1, hint: 'Half-time snare, rolling hats',
    build: () =>
      steps([[GM.kick, 'x------x--x-----'], [GM.snare, '--------x-------'], [GM.hatC, 'x-x-x-x-xxx-x-xx'], [GM.hatO, '--------------x-']]),
  },
  {
    id: 'd-house', name: 'Four on the floor', category: 'drums', bars: 1, hint: 'House / EDM: kick every beat, open hats off-beat',
    build: () => steps([[GM.kick, 'x---x---x---x---'], [GM.snare, '----x-------x---'], [GM.hatO, '--x---x---x---x-'], [GM.hatC, 'o-o-o-o-o-o-o-o-']]),
  },
  {
    id: 'd-lofi', name: 'Lo-fi', category: 'drums', bars: 1, hint: 'Lazy kick, rim click, soft hats',
    build: () => steps([[GM.kick, 'x-----x---x-----'], [GM.stick, '----x-------x---'], [GM.hatC, 'o-o-o-ooo-o-o-oo']]),
  },
  {
    id: 'd-reggaeton', name: 'Dembow', category: 'drums', bars: 1, hint: 'Reggaeton rhythm',
    build: () => steps([[GM.kick, 'x---x---x---x---'], [GM.snare, '---x--x----x--x-'], [GM.hatC, 'x-x-x-x-x-x-x-x-']]),
  },
  {
    id: 'd-funk', name: 'Funk', category: 'drums', bars: 1, hint: 'Syncopated kick, ghost snares',
    build: () => steps([[GM.kick, 'x--x--x---x--x--'], [GM.snare, '----x--o-o--x--o'], [GM.hatC, 'xxxxxxxxxxxxxxxx']]),
  },
  {
    id: 'd-fill', name: 'Tom fill', category: 'drums', bars: 1, hint: 'One-bar fill into a crash',
    build: () =>
      steps([[GM.snare, 'x-x-x-x---------'], [GM.tomH, '--------xx------'], [GM.tomM, '----------xx----'], [GM.tomF, '------------xxxx'], [GM.kick, 'x-----------x---']]),
  },
  {
    id: 'c-pop', name: 'Pop  I–V–vi–IV', category: 'chords', bars: 4, hint: 'C – G – Am – F, the most-used progression',
    build: () => chords([C, G, Am, F]),
  },
  {
    id: 'c-sad', name: 'Emotional  vi–IV–I–V', category: 'chords', bars: 4, hint: 'Am – F – C – G',
    build: () => chords([Am, F, C, G], 4, [[0, 1.9], [2.5, 1.4]]),
  },
  {
    id: 'c-jazz', name: 'Jazz  ii–V–I', category: 'chords', bars: 4, hint: 'Dm7 – G7 – Cmaj7',
    build: () => chords([Dm7, G7, Cmaj7, Cmaj7], 4, [[0, 1.4], [1.5, 2.3]], 0.55),
  },
  {
    id: 'c-lofi', name: 'Lo-fi sevenths', category: 'chords', bars: 4, hint: 'Fmaj7 – Em7 – Dm7 – Cmaj7',
    build: () => chords([Fmaj7, Em7, Dm7, Cmaj7], 4, [[0, 3.8]], 0.5),
  },
  {
    id: 'c-minor', name: 'Dark minor', category: 'chords', bars: 4, hint: 'Am – F – Dm – E',
    build: () => chords([Am, F, Dm, E], 4, [[0, 0.9], [1.5, 0.9], [3, 0.9]]),
  },
  {
    id: 'b-pop', name: 'Root eighths', category: 'bass', bars: 4, hint: 'Follows C – G – Am – F',
    build: () => [36, 43, 33, 41].flatMap((r, bar) => Array.from({ length: 8 }, (_, i) => ({ pitch: r, start: bar * 4 + i * 0.5, dur: 0.45, vel: i % 2 ? 0.65 : 0.85 }))),
  },
  {
    id: 'b-groove', name: 'Groove bass', category: 'bass', bars: 4, hint: 'Syncopated line for Am – F – C – G',
    build: () =>
      [33, 29, 36, 31].flatMap((r, bar) =>
        line([[r, bar * 4, 1.4], [r, bar * 4 + 1.5, 0.45], [r + 12, bar * 4 + 2.5, 0.45], [r, bar * 4 + 3, 0.9]], 0.85),
      ),
  },
  {
    id: 'b-808', name: '808 slides', category: 'bass', bars: 4, hint: 'Long trap bass notes',
    build: () => line([[33, 0, 2.8], [33, 3.5, 0.45], [29, 4, 3.5], [26, 8, 2.8], [28, 11.5, 0.45], [28, 12, 3.8]], 0.9),
  },
  {
    id: 'm-hook', name: 'Pentatonic hook', category: 'melody', bars: 4, hint: 'Catchy A-minor pentatonic phrase',
    build: () =>
      line([[76, 0, 1], [74, 1, 0.5], [72, 1.5, 1.5], [69, 4, 1], [72, 5, 1], [74, 6, 2], [72, 8, 1], [71, 9, 0.5], [72, 9.5, 0.5], [76, 10, 2], [74, 12, 1.5], [71, 13.5, 0.5], [67, 14, 2]], 0.72),
  },
  {
    id: 'm-arp', name: 'Arpeggio', category: 'melody', bars: 4, hint: 'Rising sixteenths over C – G – Am – F',
    build: () =>
      [C, G, Am, F].flatMap((ch, bar) =>
        Array.from({ length: 16 }, (_, i) => ({ pitch: ch[1 + (i % 3)] + 12, start: bar * 4 + i * 0.25, dur: 0.22, vel: i % 4 === 0 ? 0.8 : 0.6 })),
      ),
  },
];

export const PRESET_CATEGORIES: { id: PresetDef['category']; label: string }[] = [
  { id: 'drums', label: 'Drum beats' },
  { id: 'chords', label: 'Chord progressions' },
  { id: 'bass', label: 'Bass lines' },
  { id: 'melody', label: 'Melodies' },
];

export const presetById = (id: string) => PRESETS.find((p) => p.id === id);
