import * as Tone from 'tone';
import { get, set, del, keys } from 'idb-keyval';
import { create } from 'zustand';
import { uid } from './store';

/** Recorded / imported audio lives in IndexedDB as encoded blobs and in memory as decoded buffers. */
const memory = new Map<string, AudioBuffer>();
const peaksCache = new Map<string, Float32Array>();

export const useBuffers = create<{ ready: Record<string, true> }>(() => ({ ready: {} }));
const markReady = (id: string) => useBuffers.setState((s) => ({ ready: { ...s.ready, [id]: true } }));

export function getBuffer(id: string) {
  return memory.get(id) ?? null;
}

export async function storeBlob(blob: Blob): Promise<{ id: string; buffer: AudioBuffer }> {
  const id = uid();
  const buffer = await Tone.getContext().rawContext.decodeAudioData(await blob.arrayBuffer());
  memory.set(id, buffer);
  await set(`audio:${id}`, blob);
  markReady(id);
  return { id, buffer };
}

/** Store an already-decoded buffer (e.g. a trimmed recording) as WAV. */
export async function storeBuffer(buffer: AudioBuffer): Promise<string> {
  const id = uid();
  memory.set(id, buffer);
  await set(`audio:${id}`, encodeWav(buffer));
  markReady(id);
  return id;
}

const loading = new Map<string, Promise<AudioBuffer | null>>();
export function loadBuffer(id: string): Promise<AudioBuffer | null> {
  const m = memory.get(id);
  if (m) return Promise.resolve(m);
  const pending = loading.get(id);
  if (pending) return pending;
  const p = (async () => {
    const blob = await get<Blob>(`audio:${id}`);
    if (!blob) return null;
    const buffer = await Tone.getContext().rawContext.decodeAudioData(await blob.arrayBuffer());
    memory.set(id, buffer);
    markReady(id);
    return buffer;
  })();
  loading.set(id, p);
  return p;
}

/** Drop stored audio no project references any more. */
export async function collectGarbage(used: Set<string>) {
  const all = await keys();
  for (const k of all) {
    const key = String(k);
    if (key.startsWith('audio:') && !used.has(key.slice(6))) {
      await del(key);
      memory.delete(key.slice(6));
    }
  }
}

export function peaks(id: string, buckets = 2000): Float32Array | null {
  const cached = peaksCache.get(id);
  if (cached) return cached;
  const buf = memory.get(id);
  if (!buf) return null;
  const data = buf.getChannelData(0);
  const step = Math.max(1, Math.floor(data.length / buckets));
  const out = new Float32Array(Math.ceil(data.length / step));
  for (let i = 0; i < out.length; i++) {
    let max = 0;
    const end = Math.min(data.length, (i + 1) * step);
    for (let j = i * step; j < end; j += 4) {
      const v = Math.abs(data[j]);
      if (v > max) max = v;
    }
    out[i] = max;
  }
  peaksCache.set(id, out);
  return out;
}

export function encodeWav(buffer: AudioBuffer): Blob {
  const channels = Math.min(2, buffer.numberOfChannels);
  const rate = buffer.sampleRate;
  const frames = buffer.length;
  const bytes = 44 + frames * channels * 2;
  const view = new DataView(new ArrayBuffer(bytes));
  const str = (o: number, s: string) => [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  view.setUint32(4, bytes - 8, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  str(36, 'data');
  view.setUint32(40, frames * channels * 2, true);
  const chans = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c));
  let o = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const s = Math.max(-1, Math.min(1, chans[c][i]));
      view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return new Blob([view], { type: 'audio/wav' });
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Raw stored audio, for putting recordings inside saved session files. */
export function readAudioBlob(id: string) {
  return get<Blob>(`audio:${id}`);
}

/** Store audio under a known id (used when opening a session file that carries its recordings). */
export async function writeAudioBlob(id: string, blob: Blob) {
  await set(`audio:${id}`, blob);
  memory.delete(id);
  peaksCache.delete(id);
  loading.delete(id);
}
