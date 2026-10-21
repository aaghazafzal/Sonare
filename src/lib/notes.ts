export const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export const NOTE_NAMES_ASCII = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const isBlack = (midi: number) => [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);
export const pitchClass = (midi: number) => ((midi % 12) + 12) % 12;
export const octaveOf = (midi: number) => Math.floor(midi / 12) - 1;
export const noteName = (midi: number, withOctave = true) =>
  NOTE_NAMES[pitchClass(midi)] + (withOctave ? octaveOf(midi) : '');
export const noteNameAscii = (midi: number) => NOTE_NAMES_ASCII[pitchClass(midi)] + octaveOf(midi);

export const SCALES: Record<string, { label: string; steps: number[] }> = {
  major: { label: 'Major', steps: [0, 2, 4, 5, 7, 9, 11] },
  minor: { label: 'Natural minor', steps: [0, 2, 3, 5, 7, 8, 10] },
  harmonic: { label: 'Harmonic minor', steps: [0, 2, 3, 5, 7, 8, 11] },
  dorian: { label: 'Dorian', steps: [0, 2, 3, 5, 7, 9, 10] },
  mixolydian: { label: 'Mixolydian', steps: [0, 2, 4, 5, 7, 9, 10] },
  pentMajor: { label: 'Major pentatonic', steps: [0, 2, 4, 7, 9] },
  pentMinor: { label: 'Minor pentatonic', steps: [0, 3, 5, 7, 10] },
  blues: { label: 'Blues', steps: [0, 3, 5, 6, 7, 10] },
  chromatic: { label: 'Chromatic', steps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
};

export function scaleNotes(root: number, scale: string, from: number, count: number) {
  const steps = SCALES[scale]?.steps ?? SCALES.major.steps;
  const out: number[] = [];
  let oct = 0;
  while (out.length < count) {
    for (const s of steps) {
      const n = from + root + s + oct * 12;
      if (n >= from) out.push(n);
      if (out.length >= count) break;
    }
    oct++;
  }
  return out;
}

export const inScale = (midi: number, root: number, scale: string) =>
  (SCALES[scale]?.steps ?? []).includes(pitchClass(midi - root));

/** Guitar chord shapes, low E to high E; -1 = muted string */
export const GUITAR_CHORDS: { name: string; frets: number[] }[] = [
  { name: 'C', frets: [-1, 3, 2, 0, 1, 0] },
  { name: 'G', frets: [3, 2, 0, 0, 0, 3] },
  { name: 'D', frets: [-1, -1, 0, 2, 3, 2] },
  { name: 'A', frets: [-1, 0, 2, 2, 2, 0] },
  { name: 'E', frets: [0, 2, 2, 1, 0, 0] },
  { name: 'F', frets: [1, 3, 3, 2, 1, 1] },
  { name: 'Am', frets: [-1, 0, 2, 2, 1, 0] },
  { name: 'Em', frets: [0, 2, 2, 0, 0, 0] },
  { name: 'Dm', frets: [-1, -1, 0, 2, 3, 1] },
  { name: 'Bm', frets: [-1, 2, 4, 4, 3, 2] },
  { name: 'C7', frets: [-1, 3, 2, 3, 1, 0] },
  { name: 'G7', frets: [3, 2, 0, 0, 0, 1] },
  { name: 'D7', frets: [-1, -1, 0, 2, 1, 2] },
  { name: 'A7', frets: [-1, 0, 2, 0, 2, 0] },
  { name: 'E7', frets: [0, 2, 0, 1, 0, 0] },
  { name: 'Fmaj7', frets: [-1, -1, 3, 2, 1, 0] },
];

/** Triad / seventh intervals for keyboard chord mode */
export const CHORD_TYPES: Record<string, { label: string; intervals: number[] }> = {
  off: { label: 'Single notes', intervals: [0] },
  maj: { label: 'Major', intervals: [0, 4, 7] },
  min: { label: 'Minor', intervals: [0, 3, 7] },
  maj7: { label: 'Major 7', intervals: [0, 4, 7, 11] },
  min7: { label: 'Minor 7', intervals: [0, 3, 7, 10] },
  dom7: { label: 'Dominant 7', intervals: [0, 4, 7, 10] },
  sus4: { label: 'Sus 4', intervals: [0, 5, 7] },
  oct: { label: 'Octaves', intervals: [0, 12] },
  power: { label: 'Power (5th)', intervals: [0, 7, 12] },
};
