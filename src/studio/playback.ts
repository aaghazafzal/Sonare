import * as Tone from 'tone';
import { Strip, Voice, ensureAudio, master, metronomeClick, setMasterVolume } from '../audio/engine';
import { onLiveNote, setLiveTarget } from '../audio/live';
import { useSettings } from '../theme/settings';
import {
  useStudio,
  uid,
  songEnd,
  currentPattern,
  setChannelNotes,
  newPattern,
  freeLane,
  ensureLanes,
  addChannel,
} from './store';
import { getBuffer, loadBuffer, storeBuffer, encodeWav, download } from './buffers';
import type { AudioItem, Note, Pattern, Project } from './types';

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

/** Swing pushes every off-beat 16th later by up to a third of a 16th. */
const swung = (start: number, swing: number) => {
  const sixteenth = Math.round(start * 4);
  return Math.abs(start * 4 - sixteenth) < 0.01 && sixteenth % 2 === 1 ? start + swing * (0.25 / 3) : start;
};

/** Schedule a pattern at `at` for `length` beats, repeating it when the placement is longer. */
function schedulePattern(pat: Pattern, at: number, length: number) {
  if (pat.length <= 0) return;
  for (let rep = 0; rep < length; rep += pat.length) {
    for (const [channelId, notes] of Object.entries(pat.notes)) {
      const voice = nodes.get(channelId)?.voice;
      if (!voice) continue;
      for (const note of notes) {
        if (note.start < 0 || note.start >= pat.length) continue;
        const t = rep + swung(note.start, pat.swing);
        if (t >= length) continue;
        const dur = Math.min(note.dur, pat.length - note.start, length - t);
        const durTicks = Math.max(1, Math.round(dur * PPQ));
        transport.schedule((time) => {
          voice.play(note.pitch, Tone.Ticks(durTicks).toSeconds(), time, note.vel);
        }, ticks(at + t));
      }
    }
  }
}

function scheduleAudio(item: AudioItem, bpm: number, used: Set<string>) {
  const node = nodes.get(item.channelId);
  if (!node) return;
  const buf = getBuffer(item.bufferId);
  if (!buf) {
    void loadBuffer(item.bufferId).then((b) => b && requestSync());
    return;
  }
  used.add(item.id);
  let player = node.players.get(item.id);
  if (!player) {
    player = new Tone.Player(buf).connect(node.strip.input);
    node.players.set(item.id, player);
  }
  player.volume.value = Tone.gainToDb(item.gain);
  const startSec = (item.start * 60) / bpm;
  const durSec = Math.min((item.length * 60) / bpm, buf.duration - item.offset);
  if (durSec > 0) player.sync().start(startSec, item.offset, durSec);
}

function reschedule(p: Project) {
  for (const node of nodes.values()) node.players.forEach((pl) => pl.unsync().stop());
  transport.cancel(0);
  transport.bpm.value = p.bpm;
  transport.timeSignature = p.beatsPerBar;
  const used = new Set<string>();

  if (p.mode === 'pattern') {
    // pattern mode: loop the selected pattern on its own
    const pat = currentPattern(p);
    transport.loop = true;
    transport.loopStart = 0;
    transport.loopEnd = ticks(Math.max(1, pat.length));
    schedulePattern(pat, 0, pat.length);
  } else {
    transport.loop = p.loop.on;
    if (p.loop.on && p.loop.end > p.loop.start) {
      transport.loopStart = ticks(p.loop.start);
      transport.loopEnd = ticks(p.loop.end);
    }
    const byId = new Map(p.patterns.map((x) => [x.id, x]));
    for (const it of p.playlist) {
      if (p.lanes[it.lane]?.mute) continue;
      if (it.kind === 'pattern') {
        const pat = byId.get(it.patternId);
        if (pat) schedulePattern(pat, it.start, it.length);
      } else scheduleAudio(it, p.bpm, used);
    }
    // stop at the end of the song unless looping or recording past it
    if (!p.loop.on) {
      const end = Math.max(songEnd(p), p.beatsPerBar);
      transport.schedule((time) => {
        Tone.getDraw().schedule(() => {
          if (!useStudio.getState().recording) stop();
        }, time);
      }, ticks(end + 1));
    }
  }

  for (const node of nodes.values())
    for (const [id, pl] of node.players)
      if (!used.has(id)) {
        pl.dispose();
        node.players.delete(id);
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
  const start = s.project.mode === 'pattern' ? 0 : s.cursor;
  transport.ticks = Math.round(start * PPQ);
  transport.start('+0.05');
  useStudio.setState({ playing: true });
}

export function pause() {
  transport.pause();
  const s = useStudio.getState();
  useStudio.setState({ playing: false, cursor: s.project.mode === 'pattern' ? s.cursor : currentBeat() });
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
  if (useStudio.getState().playing && useStudio.getState().project.mode === 'song') transport.ticks = Math.round(b * PPQ);
}

export function togglePlay() {
  if (useStudio.getState().playing) pause();
  else void play();
}

/** Switch between looping the current pattern and playing the whole playlist. */
export function setMode(mode: Project['mode']) {
  const s = useStudio.getState();
  if (s.project.mode === mode) return;
  const wasPlaying = s.playing;
  if (wasPlaying) stop();
  s.edit((p) => ({ ...p, mode }), false);
  if (wasPlaying) void play();
}

/** Short preview of a note on a channel (step clicks, piano-roll keys). */
export function audition(channelId: string, pitch: number, vel = 0.8) {
  void ensureAudio();
  nodes.get(channelId)?.voice?.play(pitch, 0.3, Tone.immediate(), vel);
}

/* ------------------------------------------------------------- recording */

let mic: Tone.UserMedia | null = null;
let micRecorder: Tone.Recorder | null = null;
let monitor: Tone.Gain | null = null;
let recStartBeat = 0;
let recAudioChannel: string | null = null;
let recMidiChannels: string[] = [];
let recMode: Project['mode'] = 'song';
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
  let s = useStudio.getState();
  // if nothing is armed, arm the selected channel
  if (!s.project.tracks.some((t) => t.arm) && s.selectedTrackId) {
    s.edit((pr) => ({ ...pr, tracks: pr.tracks.map((t) => (t.id === s.selectedTrackId ? { ...t, arm: true } : t)) }), false);
  }
  s = useStudio.getState();
  const armed = s.project.tracks.filter((t) => t.arm);
  if (!armed.length) return false;

  recMidiChannels = armed.filter((t) => t.kind !== 'audio').map((t) => t.id);
  recAudioChannel = armed.find((t) => t.kind === 'audio')?.id ?? null;
  // audio always records onto the playlist
  if (recAudioChannel && s.project.mode === 'pattern') s.edit((p) => ({ ...p, mode: 'song' }), false);
  s = useStudio.getState();
  const p = s.project;
  recMode = p.mode;
  capturedNotes = [];
  pendingNotes.clear();

  if (recAudioChannel) {
    const m = await openMic();
    m.connect(micMeter);
    micRecorder = new Tone.Recorder();
    m.connect(micRecorder);
  }

  const startBeat = recMode === 'pattern' ? 0 : s.cursor;
  recStartBeat = startBeat;
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
    if (!recMidiChannels.length || transport.state !== 'started') return;
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

  for (const [pitch, st] of pendingNotes)
    capturedNotes.push({ id: uid(), pitch, start: st.start, dur: Math.max(0.05, Math.abs(endBeat - st.start)), vel: st.vel });
  pendingNotes.clear();

  if (capturedNotes.length && recMidiChannels.length) {
    if (recMode === 'pattern') {
      // overdub into the looping pattern
      const pat = currentPattern(p);
      const notes = capturedNotes.map((n) => {
        const start = ((n.start % pat.length) + pat.length) % pat.length;
        return { ...n, start, dur: Math.min(n.dur, pat.length - start) };
      });
      s.edit((pr) => recMidiChannels.reduce((acc, ch) => setChannelNotes(acc, pat.id, ch, (old) => [...old, ...notes.map((n) => ({ ...n, id: uid() }))]), pr));
    } else {
      const first = Math.min(...capturedNotes.map((x) => x.start));
      const last = Math.max(...capturedNotes.map((x) => x.start + x.dur));
      const bar = p.beatsPerBar;
      const clipStart = Math.floor(Math.min(first, recStartBeat) / bar) * bar;
      const clipEnd = Math.max(clipStart + bar, Math.ceil(last / bar) * bar);
      s.edit((pr) => {
        const [withPat, pat] = newPattern(pr, `Take ${pr.patterns.length + 1}`, clipEnd - clipStart);
        let next = recMidiChannels.reduce(
          (acc, ch) => setChannelNotes(acc, pat.id, ch, () => capturedNotes.map((n) => ({ ...n, id: uid(), start: n.start - clipStart }))),
          withPat,
        );
        const lane = freeLane(next, clipStart, clipEnd);
        next = ensureLanes({ ...next, playlist: [...next.playlist, { id: uid(), kind: 'pattern', patternId: pat.id, lane, start: clipStart, length: clipEnd - clipStart }] }, lane);
        return next;
      });
    }
  }
  capturedNotes = [];

  if (micRecorder && recAudioChannel) {
    const r = micRecorder;
    micRecorder = null;
    const channelId = recAudioChannel;
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
        const length = ((raw.duration - offset) * bpm) / 60;
        useStudio.getState().edit((pr) => {
          const lane = freeLane(pr, recStartBeat, recStartBeat + length);
          const item: AudioItem = { id: uid(), kind: 'audio', channelId, name: 'Vocal take', lane, start: recStartBeat, length, bufferId: id, offset, gain: 1 };
          return ensureLanes({ ...pr, playlist: [...pr.playlist, item] }, lane);
        });
      }
    } else r.dispose();
  }
}

/* ---------------------------------------------------------------- import */

export async function importAudioFile(file: File, opts: { start: number; lane?: number; channelId?: string }) {
  await ensureAudio();
  const raw = await Tone.getContext().rawContext.decodeAudioData(await file.arrayBuffer());
  const id = await storeBuffer(raw);
  useStudio.getState().edit((pr) => {
    let next = pr;
    let channelId = opts.channelId ?? next.tracks.find((t) => t.kind === 'audio')?.id;
    if (!channelId) {
      const [withCh, ch] = addChannel(next, 'audio', '', 'Audio');
      next = withCh;
      channelId = ch.id;
    }
    const length = (raw.duration * next.bpm) / 60;
    const lane = opts.lane ?? freeLane(next, opts.start, opts.start + length);
    const item: AudioItem = {
      id: uid(), kind: 'audio', channelId, name: file.name.replace(/\.[^.]+$/, ''), lane, start: opts.start, length, bufferId: id, offset: 0, gain: 1,
    };
    return ensureLanes({ ...next, playlist: [...next.playlist, item], mode: 'song' }, lane);
  });
}

/* ---------------------------------------------------------------- bounce */

export async function bounce(onProgress: (frac: number) => void): Promise<void> {
  await ensureAudio();
  const s = useStudio.getState();
  const p = s.project;
  const end = songEnd(p);
  if (end <= 0) return;
  stop();
  const saved = { loop: p.loop.on, metro: p.metronome, mode: p.mode };
  s.edit((pr) => ({ ...pr, loop: { ...pr.loop, on: false }, metronome: false, mode: 'song' }), false);
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
  s.edit((pr) => ({ ...pr, loop: { ...pr.loop, on: saved.loop }, metronome: saved.metro, mode: saved.mode }), false);
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
