import * as Tone from 'tone';
import { Strip, Voice, ensureAudio, master, metronomeClick, setMasterVolume } from '../audio/engine';
import { onLiveNote, setLiveTarget } from '../audio/live';
import { useSettings } from '../theme/settings';
import { useStudio, uid, songEnd, mapTrack } from './store';
import { getBuffer, loadBuffer, storeBuffer, encodeWav, download } from './buffers';
import type { AudioClip, MidiClip, Note, Project, Track } from './types';

const transport = Tone.getTransport();
const PPQ = transport.PPQ;
const ticks = (beats: number) => `${Math.round(beats * PPQ)}i`;

interface TrackNode {
  strip: Strip;
  voice: Voice | null;
  players: Map<string, Tone.Player>;
}
const nodes = new Map<string, TrackNode>();
export const trackNode = (id: string) => nodes.get(id);

/* --------------------------------------------------------- graph syncing */

function syncGraph(p: Project) {
  const anySolo = p.tracks.some((t) => t.solo);
  const live = new Set(p.tracks.map((t) => t.id));
  for (const [id, node] of nodes) {
    if (live.has(id)) continue;
    node.voice?.dispose();
    node.players.forEach((pl) => pl.dispose());
    node.strip.dispose();
    nodes.delete(id);
  }
  for (const t of p.tracks) {
    let node = nodes.get(t.id);
    if (!node) {
      node = { strip: new Strip(), voice: null, players: new Map() };
      nodes.set(t.id, node);
    }
    if (t.kind !== 'audio') {
      if (!node.voice) node.voice = new Voice(node.strip.input);
      node.voice.setInstrument(t.instrumentId);
    }
    node.strip.set({
      volume: t.volume,
      pan: t.pan,
      muted: t.mute || (anySolo && !t.solo),
      reverb: t.reverb,
      delay: t.delay,
      eq: t.eq,
      comp: t.comp,
    });
  }
  setMasterVolume(p.master);
}

/* ------------------------------------------------------------ scheduling */

function scheduleNotes(t: Track, clip: MidiClip, voice: Voice) {
  for (const note of clip.notes) {
    if (note.start >= clip.length || note.start < 0) continue;
    const dur = Math.min(note.dur, clip.length - note.start);
    const durTicks = Math.max(1, Math.round(dur * PPQ));
    transport.schedule((time) => {
      voice.play(note.pitch, Tone.Ticks(durTicks).toSeconds(), time, note.vel);
    }, ticks(clip.start + note.start));
  }
  void t;
}

function scheduleAudio(node: TrackNode, clip: AudioClip, bpm: number) {
  const buf = getBuffer(clip.bufferId);
  if (!buf) {
    void loadBuffer(clip.bufferId).then((b) => b && requestSync());
    return;
  }
  let player = node.players.get(clip.id);
  if (!player) {
    player = new Tone.Player(buf).connect(node.strip.input);
    node.players.set(clip.id, player);
  }
  player.volume.value = Tone.gainToDb(clip.gain);
  const startSec = (clip.start * 60) / bpm;
  const durSec = Math.min((clip.length * 60) / bpm, buf.duration - clip.offset);
  if (durSec > 0) player.sync().start(startSec, clip.offset, durSec);
}

function reschedule(p: Project) {
  for (const node of nodes.values()) node.players.forEach((pl) => pl.unsync().stop());
  transport.cancel(0);
  transport.bpm.value = p.bpm;
  transport.timeSignature = p.beatsPerBar;
  const end = Math.max(songEnd(p), p.beatsPerBar);
  transport.loop = p.loop.on;
  if (p.loop.on && p.loop.end > p.loop.start) {
    transport.loopStart = ticks(p.loop.start);
    transport.loopEnd = ticks(p.loop.end);
  }

  for (const t of p.tracks) {
    const node = nodes.get(t.id)!;
    const liveClipIds = new Set<string>();
    for (const c of t.clips) {
      if (c.kind === 'midi' && node.voice) scheduleNotes(t, c, node.voice);
      if (c.kind === 'audio' && t.kind === 'audio') {
        liveClipIds.add(c.id);
        scheduleAudio(node, c, p.bpm);
      }
    }
    for (const [id, pl] of node.players) {
      if (!liveClipIds.has(id)) {
        pl.dispose();
        node.players.delete(id);
      }
    }
  }

  if (p.metronome) {
    transport.scheduleRepeat(
      (time) => {
        const beat = Math.round(transport.getTicksAtTime(time) / PPQ);
        metronomeClick(time, beat % p.beatsPerBar === 0);
      },
      '4n',
      0,
    );
  }

  // auto-stop at the end of the song when not looping (and not recording, which can run past it)
  if (!p.loop.on) {
    transport.schedule((time) => {
      Tone.getDraw().schedule(() => {
        if (!useStudio.getState().recording) stop();
      }, time);
    }, ticks(end + 1));
  }
}

let syncQueued = false;
export function requestSync() {
  if (syncQueued) return;
  syncQueued = true;
  queueMicrotask(() => {
    syncQueued = false;
    const p = useStudio.getState().project;
    syncGraph(p);
    reschedule(p);
    routeLive();
  });
}

/* --------------------------------------------------------- transport api */

export const currentBeat = () => transport.ticks / PPQ;

export async function play() {
  await ensureAudio();
  const s = useStudio.getState();
  if (s.playing) return;
  requestSync();
  await Promise.all([...nodes.values()].map((n) => n.voice?.ready));
  transport.ticks = Math.round(s.cursor * PPQ);
  transport.start('+0.05');
  useStudio.setState({ playing: true });
}

export function pause() {
  transport.pause();
  useStudio.setState({ playing: false, cursor: currentBeat() });
  nodes.forEach((n) => n.voice?.releaseAll());
}

export function stop() {
  const wasRecording = useStudio.getState().recording;
  if (wasRecording) void finishRecording();
  transport.stop();
  nodes.forEach((n) => n.voice?.releaseAll());
  useStudio.setState({ playing: false, recording: false });
}

export function seek(beats: number) {
  const b = Math.max(0, beats);
  useStudio.setState({ cursor: b });
  if (useStudio.getState().playing) transport.ticks = Math.round(b * PPQ);
}

export function togglePlay() {
  if (useStudio.getState().playing) pause();
  else void play();
}

/* ------------------------------------------------------------- recording */

let mic: Tone.UserMedia | null = null;
let micRecorder: Tone.Recorder | null = null;
let monitor: Tone.Gain | null = null;
let recStartBeat = 0;
let recAudioTrack: string | null = null;
let recMidiTracks: string[] = [];
const pendingNotes = new Map<number, { start: number; vel: number }>();
let capturedNotes: Note[] = [];
let unsubscribeLive: (() => void) | null = null;

export async function openMic() {
  if (mic) return mic;
  mic = new Tone.UserMedia();
  await mic.open();
  monitor = new Tone.Gain(useSettings.getState().inputMonitoring ? 1 : 0).connect(master.input);
  mic.connect(monitor);
  return mic;
}
export function setMonitoring(on: boolean) {
  monitor?.gain.rampTo(on ? 1 : 0, 0.05);
}
export const micMeter = new Tone.Meter({ smoothing: 0.7 });

export async function record() {
  await ensureAudio();
  if (useStudio.getState().recording) return;
  if (useStudio.getState().playing) pause();
  const s = useStudio.getState();
  let p = s.project;
  // if nothing is armed, arm the selected track
  if (!p.tracks.some((t) => t.arm) && s.selectedTrackId) {
    s.edit((pr) => mapTrack(pr, s.selectedTrackId!, (t) => ({ ...t, arm: true })), false);
    p = useStudio.getState().project;
  }
  const armed = p.tracks.filter((t) => t.arm);
  if (!armed.length) return false;

  recMidiTracks = armed.filter((t) => t.kind !== 'audio').map((t) => t.id);
  const audioTrack = armed.find((t) => t.kind === 'audio');
  recAudioTrack = audioTrack?.id ?? null;
  capturedNotes = [];
  pendingNotes.clear();

  if (recAudioTrack) {
    const m = await openMic();
    m.connect(micMeter);
    micRecorder = new Tone.Recorder();
    m.connect(micRecorder);
  }

  const startBeat = s.cursor;
  recStartBeat = startBeat;

  // count-in: one bar of clicks before the transport starts
  const barSec = (p.beatsPerBar * 60) / p.bpm;
  const lead = p.countIn ? barSec : 0;
  const now = Tone.now() + 0.08;
  if (p.countIn) for (let i = 0; i < p.beatsPerBar; i++) metronomeClick(now + (i * 60) / p.bpm, i === 0);

  requestSync();
  await Promise.all([...nodes.values()].map((n) => n.voice?.ready));
  transport.ticks = Math.round(startBeat * PPQ);
  transport.start(now + lead);
  if (micRecorder) {
    const r = micRecorder;
    setTimeout(() => void r.start(), Math.max(0, (now + lead - Tone.now()) * 1000));
  }

  unsubscribeLive?.();
  unsubscribeLive = onLiveNote((e) => {
    if (!recMidiTracks.length || transport.state !== 'started') return;
    const beat = transport.getTicksAtTime(Tone.immediate()) / PPQ;
    if (e.type === 'on') pendingNotes.set(e.midi, { start: beat, vel: e.vel });
    else {
      const st = pendingNotes.get(e.midi);
      if (!st) return;
      pendingNotes.delete(e.midi);
      capturedNotes.push({ id: uid(), pitch: e.midi, start: st.start, dur: Math.max(0.05, beat - st.start), vel: st.vel });
    }
  });

  useStudio.setState({ playing: true, recording: true });
  return true;
}

async function finishRecording() {
  const endBeat = currentBeat();
  unsubscribeLive?.();
  unsubscribeLive = null;
  const s = useStudio.getState();
  const p = s.project;

  // close notes still held
  for (const [pitch, st] of pendingNotes) capturedNotes.push({ id: uid(), pitch, start: st.start, dur: Math.max(0.05, endBeat - st.start), vel: st.vel });
  pendingNotes.clear();

  if (capturedNotes.length && recMidiTracks.length) {
    const first = Math.min(...capturedNotes.map((x) => x.start));
    const last = Math.max(...capturedNotes.map((x) => x.start + x.dur));
    const bar = p.beatsPerBar;
    const clipStart = Math.floor(Math.min(first, recStartBeat) / bar) * bar;
    const clipEnd = Math.max(clipStart + bar, Math.ceil(last / bar) * bar);
    const notes = capturedNotes.map((x) => ({ ...x, start: x.start - clipStart }));
    s.edit((pr) => {
      let next = pr;
      for (const tid of recMidiTracks) {
        const clip: MidiClip = { id: uid(), kind: 'midi', name: 'Take', start: clipStart, length: clipEnd - clipStart, notes: notes.map((x) => ({ ...x, id: uid() })) };
        next = mapTrack(next, tid, (t) => ({ ...t, clips: [...t.clips, clip] }));
      }
      return next;
    });
  }
  capturedNotes = [];

  if (micRecorder && recAudioTrack) {
    const r = micRecorder;
    micRecorder = null;
    const trackId = recAudioTrack;
    if (r.state === 'started') {
      const blob = await r.stop();
      r.dispose();
      if (blob.size > 0) {
        const raw = await Tone.getContext().rawContext.decodeAudioData(await blob.arrayBuffer());
        const ctx = Tone.getContext().rawContext as AudioContext;
        // the singer hears the mix late by look-ahead + output latency; trim that from the take
        const latency = Tone.getContext().lookAhead + (ctx.outputLatency || ctx.baseLatency || 0) + useSettings.getState().recordOffsetMs / 1000;
        const id = await storeBuffer(raw);
        const bpm = useStudio.getState().project.bpm;
        const offset = Math.max(0, Math.min(raw.duration - 0.01, latency));
        const clip: AudioClip = {
          id: uid(),
          kind: 'audio',
          name: 'Vocal take',
          start: recStartBeat,
          length: ((raw.duration - offset) * bpm) / 60,
          bufferId: id,
          offset,
          gain: 1,
        };
        useStudio.getState().edit((pr) => mapTrack(pr, trackId, (t) => ({ ...t, clips: [...t.clips, clip] })));
      }
    } else r.dispose();
  }
}

/* ---------------------------------------------------------------- import */

export async function importAudioFile(file: File, trackId: string, atBeat: number) {
  await ensureAudio();
  const raw = await Tone.getContext().rawContext.decodeAudioData(await file.arrayBuffer());
  const id = await storeBuffer(raw);
  const bpm = useStudio.getState().project.bpm;
  const clip: AudioClip = {
    id: uid(),
    kind: 'audio',
    name: file.name.replace(/\.[^.]+$/, ''),
    start: atBeat,
    length: (raw.duration * bpm) / 60,
    bufferId: id,
    offset: 0,
    gain: 1,
  };
  useStudio.getState().edit((p) => mapTrack(p, trackId, (t) => ({ ...t, clips: [...t.clips, clip] })));
}

/* ---------------------------------------------------------------- bounce */

export async function bounce(onProgress: (frac: number) => void): Promise<void> {
  await ensureAudio();
  const s = useStudio.getState();
  const p = s.project;
  const end = songEnd(p);
  if (end <= 0) return;
  stop();
  const wasLoop = p.loop.on;
  const wasMetro = p.metronome;
  if (wasLoop || wasMetro) s.edit((pr) => ({ ...pr, loop: { ...pr.loop, on: false }, metronome: false }), false);
  syncGraph(useStudio.getState().project);
  reschedule(useStudio.getState().project);
  await Promise.all([...nodes.values()].map((n) => n.voice?.ready));

  const rec = new Tone.Recorder();
  master.recorderTap.connect(rec);
  await rec.start();
  transport.ticks = 0;
  transport.start('+0.05');
  useStudio.setState({ playing: true });
  const totalSec = (end * 60) / p.bpm + 2.2;
  await new Promise<void>((resolve) => {
    const t0 = performance.now();
    const iv = setInterval(() => {
      const frac = (performance.now() - t0) / 1000 / totalSec;
      onProgress(Math.min(1, frac));
      if (frac >= 1) {
        clearInterval(iv);
        resolve();
      }
    }, 100);
  });
  transport.stop();
  useStudio.setState({ playing: false });
  const blob = await rec.stop();
  rec.dispose();
  if (wasLoop || wasMetro) s.edit((pr) => ({ ...pr, loop: { ...pr.loop, on: wasLoop }, metronome: wasMetro }), false);
  const buf = await Tone.getContext().rawContext.decodeAudioData(await blob.arrayBuffer());
  download(encodeWav(buf), `${p.name.replace(/[^\w-]+/g, '_') || 'mix'}.wav`);
}

/* ------------------------------------------------------------- lifecycle */

let mounted = 0;
let unsubStore: (() => void) | null = null;

/** Called while the studio page is open: keeps audio graph in sync and routes live input. */
export function mountStudio() {
  mounted++;
  if (!unsubStore) {
    requestSync();
    unsubStore = useStudio.subscribe((s, prev) => {
      if (s.project !== prev.project) requestSync();
      if (s.selectedTrackId !== prev.selectedTrackId || s.project.tracks !== prev.project.tracks) routeLive();
    });
  }
  routeLive();
  return () => {
    mounted--;
    if (mounted === 0) {
      routed = null;
      setLiveTarget(null);
    }
  };
}

let routed: Voice | null = null;
function routeLive() {
  if (!mounted) return;
  const s = useStudio.getState();
  const t = s.project.tracks.find((x) => x.id === s.selectedTrackId);
  const node = t ? nodes.get(t.id) : undefined;
  const next = t && t.kind !== 'audio' && node?.voice ? node.voice : null;
  if (next === routed) return;
  routed = next;
  setLiveTarget(next);
}

/** Ensure graph exists before routing (first mount). */
export function ensureGraph() {
  syncGraph(useStudio.getState().project);
  routeLive();
}
