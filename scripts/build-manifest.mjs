// Scans ./Audio and writes src/data/manifest.json describing every playable instrument.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const audioDir = path.join(root, 'Audio');
const outFile = path.join(root, 'src', 'data', 'manifest.json');

const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const AUDIO_EXT = /\.(mp3|ogg|m4a|wav)$/i;

function noteToMidi(letter, acc, octave) {
  let n = NOTE[letter.toUpperCase()];
  if (acc === 's' || acc === '#') n += 1;
  if (acc === 'b') n -= 1;
  return 12 * (Number(octave) + 1) + n;
}

function parsePitched(file) {
  const base = file.replace(AUDIO_EXT, '');
  let m = base.match(/^(\d+)_[A-G][sb#]?\d$/);
  if (m) return Number(m[1]);
  m = base.match(/^note_(\d+)$/);
  if (m) return 20 + Number(m[1]);
  m = base.match(/^([A-G])(b|s|#)?(-?\d)$/);
  if (m) return noteToMidi(m[1], m[2], m[3]);
  return null;
}

// family -> default play surface
const RULES = [
  [/drums \(/i, 'drums', 'drums'],
  [/bongos/i, null, null],
  [/guitar tuner/i, null, null],
  [/electric piano/i, 'keys', 'keyboard'],
  [/piano|honky|harpsichord|clavinet|electric grand/i, 'piano', 'keyboard'],
  [/organ|accordion/i, 'organ', 'keyboard'],
  [/violin|viola|cello|contrabass/i, 'strings', 'strings'],
  [/clarinet|oboe|english horn|bassoon|sax|harmonica/i, 'reed', 'wind'],
  [/bass/i, 'bass', 'bass'],
  [/strings|harp/i, 'strings', 'keyboard'],
  [/guitar|banjo|ukulele|sitar|oud|koto|clean electric/i, 'guitar', 'guitar'],
  [/flute|piccolo|recorder|ocarina|shakuhachi|whistle|bottle/i, 'wind', 'wind'],
  [/trumpet|trombone|tuba|horn|brass/i, 'brass', 'keyboard'],
  [/marimba|xylophone|vibraphone|glockenspiel|bells|music box|celesta|tinkle|steel (drums|pan)|dulcimer/i, 'mallets', 'mallets'],
  [/taiko|timpani|percussion|orchestra hit/i, 'percussion', 'keyboard'],
  [/choir|voice/i, 'voice', 'keyboard'],
  [/lead|pad|synth/i, 'synth', 'keyboard'],
];

function classify(name) {
  for (const [re, family, view] of RULES) if (re.test(name)) return { family, view };
  return { family: 'other', view: 'keyboard' };
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const instruments = [];
const kits = [];

for (const folder of fs.readdirSync(audioDir).sort()) {
  const full = path.join(audioDir, folder);
  if (!fs.statSync(full).isDirectory()) continue;
  const name = folder.replace(/^\d+\s*-\s*/, '');
  const { family, view } = classify(name);
  if (!family) continue;
  const files = fs.readdirSync(full).filter((f) => AUDIO_EXT.test(f));

  if (view === 'drums') {
    const pieces = {};
    for (const f of files) pieces[f.replace(AUDIO_EXT, '')] = f;
    const kitName = name.replace(/^Drums \((.*)\)$/, '$1');
    kits.push({ id: slug(kitName), name: kitName, folder, pieces });
    continue;
  }

  const all = {};
  for (const f of files) {
    let midi = parsePitched(f);
    // Ukulele ships single-letter open notes (a.mp3, c.mp3 ...), assume octave 4
    if (midi == null && /^[a-g]\.(mp3|ogg)$/i.test(f)) midi = noteToMidi(f[0], '', 4);
    if (midi != null) all[midi] = f;
  }
  const keys = Object.keys(all).map(Number).sort((a, b) => a - b);
  if (keys.length === 0) continue;
  // Dense (one-per-semitone) sets are thinned to minor thirds; the sampler repitches between them.
  const dense = keys.length > 40;
  const samples = {};
  for (const k of keys) if (!dense || k % 3 === 0 || k === keys[0] || k === keys[keys.length - 1]) samples[k] = all[k];
  instruments.push({
    id: slug(name),
    name,
    folder,
    family,
    view,
    range: [keys[0], keys[keys.length - 1]],
    samples,
  });
}

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify({ instruments, kits }, null, 1));
console.log(`manifest: ${instruments.length} instruments, ${kits.length} kits`);
