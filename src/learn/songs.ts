/** Public-domain melodies for the learning mode. */

export interface SongNote {
  id: number;
  pitch: number;
  start: number; // beats
  dur: number; // beats
  hand: 'R' | 'L';
}

export interface Song {
  id: string;
  title: string;
  composer: string;
  level: 1 | 2 | 3;
  bpm: number;
  beatsPerBar: number;
  notes: SongNote[];
  length: number; // beats
  hands: ('R' | 'L')[];
}

const STEPS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function pitchOf(name: string) {
  const m = name.match(/^([A-G])(#|b)?(-?\d)$/);
  if (!m) throw new Error(`bad note ${name}`);
  return 12 * (Number(m[3]) + 1) + STEPS[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

/** "E4:1 D#4:.5 r:1 …" — notes played one after another; ":dur" in beats, default 1; "r" is a rest. */
function seq(text: string, hand: 'R' | 'L' = 'R') {
  const out: Omit<SongNote, 'id'>[] = [];
  let t = 0;
  for (const tok of text.trim().split(/\s+/)) {
    const [n, d] = tok.split(':');
    const dur = d ? Number(d) : 1;
    if (n !== 'r') out.push({ pitch: pitchOf(n), start: t, dur, hand });
    t += dur;
  }
  return out;
}

function song(meta: Omit<Song, 'notes' | 'length' | 'hands'>, ...parts: Omit<SongNote, 'id'>[][]): Song {
  const notes = parts.flat().sort((a, b) => a.start - b.start || a.pitch - b.pitch).map((n, i) => ({ ...n, id: i }));
  const length = Math.max(...notes.map((n) => n.start + n.dur));
  const hands = [...new Set(notes.map((n) => n.hand))];
  return { ...meta, notes, length, hands };
}

const twice = (s: string) => `${s} ${s}`;

export const SONGS: Song[] = [
  song(
    { id: 'twinkle', title: 'Twinkle, Twinkle, Little Star', composer: 'Traditional', level: 1, bpm: 100, beatsPerBar: 4 },
    seq(
      'C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2 ' +
        twice('G4 G4 F4 F4 E4 E4 D4:2') +
        ' C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2',
    ),
  ),
  song(
    { id: 'mary', title: 'Mary Had a Little Lamb', composer: 'Traditional', level: 1, bpm: 110, beatsPerBar: 4 },
    seq('E4 D4 C4 D4 E4 E4 E4:2 D4 D4 D4:2 E4 G4 G4:2 E4 D4 C4 D4 E4 E4 E4 E4 D4 D4 E4 D4 C4:4'),
  ),
  song(
    { id: 'row', title: 'Row, Row, Row Your Boat', composer: 'Traditional', level: 1, bpm: 100, beatsPerBar: 3 },
    seq(
      'C4:1.5 C4:1.5 C4 D4:.5 E4:1.5 E4 D4:.5 E4 F4:.5 G4:3 ' +
        'C5:.5 C5:.5 C5:.5 G4:.5 G4:.5 G4:.5 E4:.5 E4:.5 E4:.5 C4:.5 C4:.5 C4:.5 G4 F4:.5 E4 D4:.5 C4:3',
    ),
  ),
  song(
    { id: 'frere', title: 'Frère Jacques', composer: 'Traditional', level: 1, bpm: 110, beatsPerBar: 4 },
    seq(
      twice('C4 D4 E4 C4') +
        ' ' +
        twice('E4 F4 G4:2') +
        ' ' +
        twice('G4:.5 A4:.5 G4:.5 F4:.5 E4 C4') +
        ' ' +
        twice('C4 G3 C4:2'),
    ),
  ),
  song(
    { id: 'ode', title: 'Ode to Joy', composer: 'Ludwig van Beethoven', level: 2, bpm: 104, beatsPerBar: 4 },
    seq(
      'E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4:1.5 D4:.5 D4:2 ' +
        'E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4:1.5 C4:.5 C4:2 ' +
        'D4 D4 E4 C4 D4 E4:.5 F4:.5 E4 C4 D4 E4:.5 F4:.5 E4 D4 C4 D4 G3:2 ' +
        'E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4:1.5 C4:.5 C4:2',
    ),
    seq('C3:4 G2:4 C3:4 G2:2 G2:2 C3:4 G2:4 C3:4 G2:2 C3:2 G2:4 C3:4 G2:4 C3:2 G2:2 C3:4 G2:4 C3:4 G2:2 C3:2', 'L'),
  ),
  song(
    { id: 'jingle', title: 'Jingle Bells', composer: 'James Lord Pierpont', level: 2, bpm: 120, beatsPerBar: 4 },
    seq(
      'E4 E4 E4:2 E4 E4 E4:2 E4 G4 C4:1.5 D4:.5 E4:4 ' +
        'F4 F4 F4:1.5 F4:.5 F4 E4 E4 E4:.5 E4:.5 E4 D4 D4 E4 D4:2 G4:2 ' +
        'E4 E4 E4:2 E4 E4 E4:2 E4 G4 C4:1.5 D4:.5 E4:4 ' +
        'F4 F4 F4 F4 F4 E4 E4 E4:.5 E4:.5 G4 G4 F4 D4 C4:4',
    ),
  ),
  song(
    { id: 'birthday', title: 'Happy Birthday', composer: 'Mildred & Patty Hill', level: 2, bpm: 96, beatsPerBar: 3 },
    seq(
      'G4:.75 G4:.25 A4 G4 C5 B4:2 G4:.75 G4:.25 A4 G4 D5 C5:2 ' +
        'G4:.75 G4:.25 G5 E5 C5 B4 A4:2 F5:.75 F5:.25 E5 C5 D5 C5:2',
    ),
  ),
  song(
    { id: 'canon', title: 'Canon in D', composer: 'Johann Pachelbel', level: 2, bpm: 72, beatsPerBar: 4 },
    seq(twice('F#5:2 E5:2 D5:2 C#5:2 B4:2 A4:2 B4:2 C#5:2')),
    seq(twice('D3:2 A2:2 B2:2 F#2:2 G2:2 D2:2 G2:2 A2:2'), 'L'),
  ),
  song(
    { id: 'minuet', title: 'Minuet in G', composer: 'Christian Petzold (attr. J. S. Bach)', level: 3, bpm: 108, beatsPerBar: 3 },
    seq(
      'D5 G4:.5 A4:.5 B4:.5 C5:.5 D5 G4 G4 E5 C5:.5 D5:.5 E5:.5 F#5:.5 G5 G4 G4 ' +
        'C5 D5:.5 C5:.5 B4:.5 A4:.5 B4 C5:.5 B4:.5 A4:.5 G4:.5 F#4 G4:.5 A4:.5 B4:.5 G4:.5 A4:3 ' +
        'D5 G4:.5 A4:.5 B4:.5 C5:.5 D5 G4 G4 E5 C5:.5 D5:.5 E5:.5 F#5:.5 G5 G4 G4 ' +
        'C5 D5:.5 C5:.5 B4:.5 A4:.5 B4 C5:.5 B4:.5 A4:.5 G4:.5 A4 B4:.5 A4:.5 G4:.5 F#4:.5 G4:3',
    ),
  ),
  song(
    { id: 'elise', title: 'Für Elise (opening)', composer: 'Ludwig van Beethoven', level: 3, bpm: 72, beatsPerBar: 1.5 },
    seq(
      'E5:.25 D#5:.25 E5:.25 D#5:.25 E5:.25 B4:.25 D5:.25 C5:.25 A4:.5 r:.25 C4:.25 E4:.25 A4:.25 ' +
        'B4:.5 r:.25 E4:.25 G#4:.25 B4:.25 C5:.5 r:.25 E4:.25 E5:.25 D#5:.25 ' +
        'E5:.25 D#5:.25 E5:.25 B4:.25 D5:.25 C5:.25 A4:.5 r:.25 C4:.25 E4:.25 A4:.25 ' +
        'B4:.5 r:.25 E4:.25 C5:.25 B4:.25 A4:1',
    ),
    seq(
      'r:2 A2:.25 E3:.25 A3:.25 r:.75 E2:.25 E3:.25 G#3:.25 r:.75 A2:.25 E3:.25 A3:.25 r:2.25 ' +
        'A2:.25 E3:.25 A3:.25 r:.75 E2:.25 E3:.25 G#3:.25 r:.75 A2:.25 E3:.25 A3:.5',
      'L',
    ),
  ),
];

export const LEVEL_LABEL = { 1: 'Easy', 2: 'Medium', 3: 'Harder' } as const;
export const songById = (id: string) => SONGS.find((s) => s.id === id);
