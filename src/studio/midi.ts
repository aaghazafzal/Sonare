import { Midi } from '@tonejs/midi';
import { useStudio, addChannel, newPattern, setChannelNotes, freeLane, ensureLanes, uid, currentPattern } from './store';
import { download } from './buffers';
import type { Note, Pattern, Project } from './types';

/** Rough General MIDI program -> one of our instruments. */
function instrumentForProgram(program: number): string {
  if (program < 8) return 'studio-acoustic-grand-piano';
  if (program < 16) return 'vibraphone';
  if (program < 24) return 'drawbar-organ';
  if (program < 26) return 'classical-guitar-acoustic-nylon';
  if (program < 32) return 'clean-electric';
  if (program < 40) return 'electric-bass';
  if (program < 48) return 'string-ensemble';
  if (program < 56) return 'choir-aahs';
  if (program < 64) return 'trumpet';
  if (program < 72) return 'alto-saxophone';
  if (program < 80) return 'flute';
  if (program < 88) return 'synth-lead';
  if (program < 96) return 'warm-pad';
  return 'studio-acoustic-grand-piano';
}

/** Every note a channel plays across the playlist, in beats from the song start. */
function songNotes(p: Project): Map<string, Note[]> {
  const out = new Map<string, Note[]>();
  const byId = new Map(p.patterns.map((x) => [x.id, x]));
  for (const it of p.playlist) {
    if (it.kind !== 'pattern' || p.lanes[it.lane]?.mute) continue;
    const pat = byId.get(it.patternId);
    if (!pat) continue;
    for (let rep = 0; rep < it.length; rep += pat.length)
      for (const [ch, notes] of Object.entries(pat.notes))
        for (const n of notes) {
          const t = rep + n.start;
          if (n.start >= pat.length || t >= it.length) continue;
          const list = out.get(ch) ?? [];
          list.push({ ...n, start: it.start + t, dur: Math.min(n.dur, it.length - t) });
          out.set(ch, list);
        }
  }
  return out;
}

function patternNotes(pat: Pattern): Map<string, Note[]> {
  return new Map(Object.entries(pat.notes));
}

export function exportMidi(p: Project, scope: 'song' | 'pattern') {
  const midi = new Midi();
  midi.header.setTempo(p.bpm);
  midi.header.timeSignatures.push({ ticks: 0, timeSignature: [p.beatsPerBar, 4] });
  const ppq = midi.header.ppq;
  const notes = scope === 'song' ? songNotes(p) : patternNotes(currentPattern(p));
  let melodic = 0;
  for (const ch of p.tracks) {
    const list = notes.get(ch.id);
    if (!list?.length || ch.kind === 'audio') continue;
    const track = midi.addTrack();
    track.name = ch.name;
    // channel 10 (index 9) is reserved for drums in General MIDI
    if (ch.kind === 'drums') track.channel = 9;
    else {
      if (melodic % 16 === 9) melodic++;
      track.channel = melodic % 16;
      melodic++;
    }
    for (const n of list)
      track.addNote({
        midi: n.pitch,
        ticks: Math.round(n.start * ppq),
        durationTicks: Math.max(1, Math.round(n.dur * ppq)),
        velocity: n.vel,
      });
  }
  const name = scope === 'song' ? p.name : `${p.name} - ${currentPattern(p).name}`;
  download(new Blob([midi.toArray() as BlobPart], { type: 'audio/midi' }), `${name.replace(/[^\w-]+/g, '_') || 'song'}.mid`);
}

/** Import a .mid as one new pattern (one channel per MIDI track), placed on the playlist. */
export async function importMidi(file: File, place?: { lane?: number; start: number }) {
  const midi = new Midi(await file.arrayBuffer());
  const ppq = midi.header.ppq || 480;
  const tracks = midi.tracks.filter((t) => t.notes.length);
  if (!tracks.length) throw new Error('No notes in this MIDI file');
  const s = useStudio.getState();
  const fileBpm = midi.header.tempos[0]?.bpm;
  let itemId = '';
  s.edit((pr) => {
    let next = pr;
    // an empty project takes the file's tempo
    if (fileBpm && !pr.playlist.length) next = { ...next, bpm: Math.round(fileBpm) };
    const [withPat, pat] = newPattern(next, file.name.replace(/\.midi?$/i, ''), next.beatsPerBar);
    next = withPat;
    let maxEnd = 0;
    for (const t of tracks) {
      const drums = t.channel === 9 || t.instrument.percussion;
      const inst = drums ? 'kit:standard-kit' : instrumentForProgram(t.instrument.number);
      const [withCh, ch] = addChannel(next, drums ? 'drums' : 'instrument', inst, t.name || undefined);
      next = withCh;
      const notes: Note[] = t.notes.map((n) => {
        const start = n.ticks / ppq;
        const dur = Math.max(0.0625, n.durationTicks / ppq);
        maxEnd = Math.max(maxEnd, start + dur);
        return { id: uid(), pitch: n.midi, start, dur, vel: Math.max(0.05, n.velocity) };
      });
      next = setChannelNotes(next, pat.id, ch.id, () => notes);
    }
    const length = Math.max(next.beatsPerBar, Math.ceil(maxEnd / next.beatsPerBar) * next.beatsPerBar);
    next = { ...next, patterns: next.patterns.map((x) => (x.id === pat.id ? { ...x, length } : x)) };
    const start = place?.start ?? Math.floor(s.cursor / next.beatsPerBar) * next.beatsPerBar;
    const lane = place?.lane ?? freeLane(next, start, start + length);
    itemId = uid();
    next = ensureLanes({ ...next, playlist: [...next.playlist, { id: itemId, kind: 'pattern', patternId: pat.id, lane, start, length }], mode: 'song' }, lane);
    return next;
  });
  s.setUi({ selectedItemId: itemId });
}
