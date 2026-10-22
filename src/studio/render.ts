import * as Tone from 'tone';
import { zipSync } from 'fflate';
import { createBus, loadBuffers, Strip, Voice } from '../audio/engine';
import { scheduleProject } from './schedule';
import { currentPattern, songEnd } from './store';
import { download, encodeWav, getBuffer, loadBuffer } from './buffers';
import type { Project } from './types';

export type ExportFormat = 'wav' | 'mp3-320' | 'mp3-192';

const TAIL = 3; // seconds of reverb / delay tail after the last note

/**
 * Render the song (or, with nothing on the playlist, the current pattern) much faster than real time
 * by building the whole mix again inside an offline audio context.
 */
export async function renderProject(p: Project, only?: string): Promise<AudioBuffer> {
  const songBeats = songEnd(p);
  const mode: Project['mode'] = songBeats > 0 ? 'song' : 'pattern';
  const beats = songBeats > 0 ? songBeats : currentPattern(p).length;
  if (beats <= 0) throw new Error('Nothing to export yet');
  const seconds = (beats * 60) / p.bpm + TAIL;

  // load every sample set and recording first, in the live context
  await Promise.all(p.tracks.filter((t) => t.kind !== 'audio').map((t) => loadBuffers(t.instrumentId)));
  await Promise.all(p.playlist.map((it) => (it.kind === 'audio' ? loadBuffer(it.bufferId) : null)));

  const anySolo = p.tracks.some((t) => t.solo);
  const rendered = await Tone.Offline(
    async ({ transport }) => {
      const bus = createBus(Tone.getDestination());
      await bus.reverb.ready;
      bus.volume.volume.value = p.master <= -60 ? -Infinity : p.master;
      const strips = new Map<string, Strip>();
      const voices = new Map<string, Voice>();
      for (const t of p.tracks) {
        const strip = new Strip(bus);
        strip.set({
          volume: t.volume,
          pan: t.pan,
          muted: t.mute || (anySolo && !t.solo) || (only !== undefined && t.id !== only),
          reverb: t.reverb,
          delay: t.delay,
          eq: t.eq,
          comp: t.comp,
          fx: t.fx ?? [],
        });
        strips.set(t.id, strip);
        if (t.kind !== 'audio') {
          const v = new Voice(strip.input);
          await v.setInstrument(t.instrumentId);
          voices.set(t.id, v);
        }
      }
      transport.bpm.value = p.bpm;
      transport.timeSignature = p.beatsPerBar;
      scheduleProject(
        p,
        {
          transport,
          voice: (id) => voices.get(id),
          strip: (id) => strips.get(id),
          masterVolume: bus.volume.volume,
          player: (item) => {
            const buf = getBuffer(item.bufferId);
            const strip = strips.get(item.channelId);
            return buf && strip ? new Tone.Player(buf).connect(strip.input) : null;
          },
        },
        mode,
      );
      transport.start(0);
    },
    seconds,
    2,
    44100,
  );
  return rendered.get() as AudioBuffer;
}

async function encodeMp3(buf: AudioBuffer, bitrate: 320 | 192): Promise<Blob> {
  const { createMp3Encoder } = await import('wasm-media-encoders');
  const enc = await createMp3Encoder();
  const channels = Math.min(2, buf.numberOfChannels) as 1 | 2;
  enc.configure({ sampleRate: buf.sampleRate as 44100, channels, bitrate });
  const data = Array.from({ length: channels }, (_, c) => buf.getChannelData(c));
  const parts: Uint8Array[] = [];
  const CHUNK = 1152 * 64;
  for (let i = 0; i < buf.length; i += CHUNK) {
    const out = enc.encode(data.map((d) => d.subarray(i, Math.min(buf.length, i + CHUNK))));
    parts.push(out.slice());
  }
  parts.push(enc.finalize().slice());
  return new Blob(parts as BlobPart[], { type: 'audio/mpeg' });
}

async function encode(buf: AudioBuffer, format: ExportFormat): Promise<Blob> {
  if (format === 'wav') return encodeWav(buf);
  return encodeMp3(buf, format === 'mp3-320' ? 320 : 192);
}

const safe = (s: string) => s.replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '') || 'untitled';
const ext = (f: ExportFormat) => (f === 'wav' ? 'wav' : 'mp3');

/** Full mix as one file. */
export async function exportMix(p: Project, format: ExportFormat, onStep: (msg: string, frac: number) => void) {
  onStep('Rendering the mix…', 0.1);
  const buf = await renderProject(p);
  onStep(format === 'wav' ? 'Writing WAV…' : 'Encoding MP3…', 0.75);
  const blob = await encode(buf, format);
  onStep('Done', 1);
  download(blob, `${safe(p.name)}.${ext(format)}`);
}

/** One file per channel (each with its own effects and the master bus), zipped. */
export async function exportStems(p: Project, format: ExportFormat, onStep: (msg: string, frac: number) => void) {
  const channels = p.tracks.filter((t) => !t.mute);
  const files: Record<string, Uint8Array> = {};
  for (let i = 0; i < channels.length; i++) {
    const t = channels[i];
    onStep(`Rendering ${t.name} (${i + 1}/${channels.length})…`, i / channels.length);
    const buf = await renderProject(p, t.id);
    const blob = await encode(buf, format);
    files[`${String(i + 1).padStart(2, '0')} ${safe(t.name)}.${ext(format)}`] = new Uint8Array(await blob.arrayBuffer());
  }
  onStep('Zipping…', 0.97);
  const zip = zipSync(files, { level: 0 });
  onStep('Done', 1);
  download(new Blob([zip as BlobPart], { type: 'application/zip' }), `${safe(p.name)} stems.zip`);
}
