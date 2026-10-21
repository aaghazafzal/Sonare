import manifest from '../data/manifest.json';

export type ViewKind = 'keyboard' | 'guitar' | 'bass' | 'strings' | 'wind' | 'mallets' | 'drums';

export interface InstrumentDef {
  id: string;
  name: string;
  folder: string;
  family: string;
  view: ViewKind;
  range: [number, number];
  samples: Record<string, string>;
}

export interface KitDef {
  id: string;
  name: string;
  folder: string;
  pieces: Record<string, string>;
}

export const INSTRUMENTS = manifest.instruments as unknown as InstrumentDef[];
export const KITS = manifest.kits as unknown as KitDef[];

/** Kits share the instrument id space with a `kit:` prefix. */
export const isKitId = (id: string) => id.startsWith('kit:');
export const kitIdOf = (id: string) => id.slice(4);
export const getInstrument = (id: string) => INSTRUMENTS.find((i) => i.id === id);
export const getKit = (id: string) => KITS.find((k) => k.id === (isKitId(id) ? kitIdOf(id) : id));

export const displayName = (id: string) =>
  isKitId(id) ? `${getKit(id)?.name ?? 'Drum kit'} Drums` : getInstrument(id)?.name ?? id;

export const FAMILY_LABELS: Record<string, string> = {
  piano: 'Pianos',
  keys: 'Electric pianos',
  organ: 'Organs & accordions',
  guitar: 'Guitars & plucked',
  bass: 'Basses',
  strings: 'Strings',
  wind: 'Flutes & whistles',
  reed: 'Reeds & saxophones',
  brass: 'Brass',
  mallets: 'Mallets & bells',
  percussion: 'Percussion',
  voice: 'Voices',
  synth: 'Synths & pads',
  drums: 'Drum kits',
};
export const FAMILY_ORDER = Object.keys(FAMILY_LABELS);

export const VIEW_LABELS: Record<ViewKind, string> = {
  keyboard: 'Keyboard',
  guitar: 'Guitar',
  bass: 'Bass',
  strings: 'Strings',
  wind: 'Wind',
  mallets: 'Mallets',
  drums: 'Drum kit',
};

export function defaultView(id: string): ViewKind {
  if (isKitId(id)) return 'drums';
  return getInstrument(id)?.view ?? 'keyboard';
}

/** Drum pieces in display order with their General MIDI note numbers. */
export const DRUM_PIECES: { key: string; label: string; short: string; midi: number }[] = [
  { key: 'crash', label: 'Crash', short: 'CR', midi: 49 },
  { key: 'ride', label: 'Ride', short: 'RD', midi: 51 },
  { key: 'hihat-open', label: 'Hi-hat open', short: 'OH', midi: 46 },
  { key: 'hihat', label: 'Hi-hat closed', short: 'HH', midi: 42 },
  { key: 'hihat-foot', label: 'Hi-hat pedal', short: 'HP', midi: 44 },
  { key: 'tom1', label: 'High tom', short: 'T1', midi: 48 },
  { key: 'tom2', label: 'Mid tom', short: 'T2', midi: 45 },
  { key: 'floor-tom', label: 'Floor tom', short: 'FT', midi: 41 },
  { key: 'snare-stick', label: 'Side stick', short: 'SS', midi: 37 },
  { key: 'snare-drum', label: 'Snare', short: 'SN', midi: 38 },
  { key: 'bass', label: 'Kick', short: 'KK', midi: 36 },
];
export const pieceForMidi = (midi: number) => DRUM_PIECES.find((p) => p.midi === midi);
export const midiForPiece = (key: string) => DRUM_PIECES.find((p) => p.key === key)?.midi ?? 36;

export function sampleUrl(folder: string, file: string) {
  return `${import.meta.env.BASE_URL}audio/${encodeURIComponent(folder)}/${encodeURIComponent(file)}`;
}

export function groupedInstruments() {
  const groups: { family: string; label: string; items: { id: string; name: string }[] }[] = [];
  for (const fam of FAMILY_ORDER) {
    const items =
      fam === 'drums'
        ? KITS.map((k) => ({ id: `kit:${k.id}`, name: k.name }))
        : INSTRUMENTS.filter((i) => i.family === fam).map((i) => ({ id: i.id, name: i.name }));
    if (items.length) groups.push({ family: fam, label: FAMILY_LABELS[fam], items });
  }
  return groups;
}

export const DEFAULT_INSTRUMENT = 'studio-acoustic-grand-piano';
